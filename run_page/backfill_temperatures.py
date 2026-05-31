import argparse
import datetime as dt
import json
import os
import re
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import polyline

from config import JSON_FILE, SQL_FILE
from generator.db import Activity, init_db


EXCLUDED_TYPES = {"Workout", "Indoor Ride", "VirtualRide", "Flight", "Train", "RoadTrip"}
OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"
weather_cache = {}


def parse_duration(value):
    if not value:
        return dt.timedelta()

    days = 0
    time_part = value
    if ", " in value:
        days_part, time_part = value.split(", ", 1)
        days = int(days_part.split(" ", 1)[0])

    hours, minutes, seconds = [int(part) for part in time_part.split(":")]
    return dt.timedelta(days=days, hours=hours, minutes=minutes, seconds=seconds)


def eligible_activity(activity):
    return (
        activity.get("summary_polyline")
        and activity.get("type") not in EXCLUDED_TYPES
        and activity.get("distance", 0) > 100
    )


def missing_temperature(activity):
    return activity.get("temperature_min") is None or activity.get("temperature_max") is None


def activity_window(activity):
    start = dt.datetime.strptime(activity["start_date_local"], "%Y-%m-%d %H:%M:%S")
    end = start + parse_duration(activity.get("moving_time", ""))
    return start, end


def hourly_temperatures(latitude, longitude, start_date, end_date):
    latitude = round(latitude, 4)
    longitude = round(longitude, 4)
    cache_key = (latitude, longitude, start_date.isoformat(), end_date.isoformat())
    if cache_key in weather_cache:
        return weather_cache[cache_key]

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "temperature_2m",
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "timezone": "auto",
    }
    url = f"{OPEN_METEO_URL}?{urlencode(params)}"
    last_error = None
    for attempt in range(3):
        try:
            with urlopen(url, timeout=20) as response:
                data = json.loads(response.read().decode("utf-8"))
            break
        except Exception as error:
            last_error = error
            if attempt < 2:
                time.sleep(1 + attempt)
    else:
        raise RuntimeError(f"Open-Meteo request failed: {last_error}") from last_error

    hourly = data.get("hourly", {})
    result = hourly.get("time", []), hourly.get("temperature_2m", [])
    weather_cache[cache_key] = result
    return result


def temperature_range_for_activity(activity):
    points = polyline.decode(activity["summary_polyline"])
    if not points:
        return None

    latitude, longitude = points[0]
    start, end = activity_window(activity)
    times, temperatures = hourly_temperatures(latitude, longitude, start.date(), end.date())

    selected = []
    for time_value, temperature in zip(times, temperatures):
        if temperature is None:
            continue
        hour = dt.datetime.fromisoformat(time_value)
        if start.replace(minute=0, second=0, microsecond=0) <= hour <= end:
            selected.append(float(temperature))

    if not selected:
        return None

    return min(selected), max(selected)


def write_temperature_fields(json_path, updates):
    path = Path(json_path)
    content = path.read_text(encoding="utf-8")

    for run_id, values in updates.items():
        temperature_min, temperature_max = values
        block_pattern = re.compile(
            rf'(\{{\r?\n"run_id": {run_id},.*?\r?\n\}})', re.DOTALL
        )

        def replace_block(match):
            block = match.group(1)
            block = re.sub(
                r'\r?\n"temperature_min": [-\d.]+,\r?\n'
                r'"temperature_max": [-\d.]+,\r?\n'
                r'"temperature_source": "[^"]+",',
                "",
                block,
            )
            return block.replace(
                '"source":',
                f'"temperature_min": {temperature_min:.1f},\n'
                f'"temperature_max": {temperature_max:.1f},\n'
                '"temperature_source": "open-meteo",\n'
                '"source":',
            )

        content, replaced = block_pattern.subn(replace_block, content, count=1)
        if replaced == 0:
            print(f"warn {run_id} not found in {json_path}")

    temp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    temp_path.write_text(content, encoding="utf-8")
    last_error = None
    for attempt in range(5):
        try:
            os.replace(temp_path, path)
            return
        except PermissionError as error:
            last_error = error
            time.sleep(0.5 + attempt * 0.5)
    raise last_error


def main():
    parser = argparse.ArgumentParser(
        description="Backfill activity temperature ranges from Open-Meteo hourly weather."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=25,
        help="Maximum number of missing activities to backfill. Defaults to 25.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Backfill all missing eligible activities. This can take a long time.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.2,
        help="Seconds to pause between weather requests.",
    )
    parser.add_argument(
        "--include-existing",
        action="store_true",
        help="Recalculate activities that already have temperature fields.",
    )
    parser.add_argument("--db", default=SQL_FILE)
    parser.add_argument("--json", default=JSON_FILE)
    args = parser.parse_args()

    json_path = Path(args.json)
    activities = json.loads(json_path.read_text(encoding="utf-8-sig"))
    candidates = [
        activity
        for activity in activities
        if eligible_activity(activity)
        and (args.include_existing or missing_temperature(activity))
    ]
    targets = sorted(
        candidates,
        key=lambda activity: activity["start_date_local"],
        reverse=True,
    )
    if not args.all and args.limit is not None:
        targets = targets[: args.limit]

    print(f"target activities: {len(targets)}", flush=True)

    session = init_db(args.db)
    updated = 0
    for index, activity in enumerate(targets, start=1):
        try:
            temperature_range = temperature_range_for_activity(activity)
        except Exception as error:
            print(
                f"[{index}/{len(targets)}] skip {activity['run_id']} "
                f"weather request failed: {error}",
                flush=True,
            )
            continue

        if temperature_range is None:
            print(
                f"[{index}/{len(targets)}] skip {activity['run_id']} no weather data",
                flush=True,
            )
            continue

        temperature_min, temperature_max = temperature_range
        db_activity = (
            session.query(Activity).filter_by(run_id=int(activity["run_id"])).first()
        )
        if db_activity is None:
            print(
                f"[{index}/{len(targets)}] skip {activity['run_id']} "
                "not found in database",
                flush=True,
            )
            continue

        db_activity.temperature_min = round(temperature_min, 1)
        db_activity.temperature_max = round(temperature_max, 1)
        db_activity.temperature_source = "open-meteo"
        session.commit()
        write_temperature_fields(
            args.json,
            {
                int(activity["run_id"]): (
                    db_activity.temperature_min,
                    db_activity.temperature_max,
                )
            },
        )
        updated += 1
        print(
            f"[{index}/{len(targets)}] {activity['run_id']} "
            f"{activity['start_date_local']} "
            f"{db_activity.temperature_min}-{db_activity.temperature_max} C",
            flush=True,
        )
        if args.sleep > 0:
            time.sleep(args.sleep)

    print(f"updated {updated} activities", flush=True)


if __name__ == "__main__":
    main()
