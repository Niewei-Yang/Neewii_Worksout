import argparse
import datetime as dt
import hashlib
import json
import math
import os
import re
import xml.etree.ElementTree as ET
from collections import namedtuple
from pathlib import Path

import polyline
import gpxpy

from config import JSON_FILE, SQL_FILE, run_map, start_point
from generator import Generator
from generator.db import Activity, update_or_create_activity
from synced_data_file_logger import (
    load_synced_file_list,
    save_synced_data_file_list,
)

FLIGHT_FOLDER = Path(__file__).resolve().parent.parent / "flight"
LOCAL_TZ = dt.timezone(dt.timedelta(hours=8))


def parse_time(value):
    if not value:
        return None
    value = value.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    parsed = dt.datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=LOCAL_TZ)
    return parsed


def fallback_start_time(file_path, date_value):
    if date_value:
        parsed = dt.datetime.strptime(date_value, "%Y%m%d")
        return parsed.replace(hour=12, tzinfo=LOCAL_TZ)
    modified = dt.datetime.fromtimestamp(os.path.getmtime(file_path), tz=LOCAL_TZ)
    return modified.replace(second=0, microsecond=0)


def infer_date_value(file_path, date_value=None):
    if date_value:
        return date_value
    match = re.search(r"(20\d{6})", file_path.stem)
    return match.group(1) if match else None


def parse_local_time(value, file_path, date_value=None):
    if not value:
        return None
    value = value.strip()
    fallback_date = infer_date_value(file_path, date_value)
    if re.fullmatch(r"\d{4}", value):
        if not fallback_date:
            raise ValueError(
                "--start/--end in HHMM format requires --date or YYYYMMDD in filename"
            )
        value = f"{fallback_date}{value}"
    for fmt in ("%Y%m%d%H%M", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return dt.datetime.strptime(value, fmt).replace(tzinfo=LOCAL_TZ)
        except ValueError:
            pass
    parsed = dt.datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=LOCAL_TZ)
    return parsed.astimezone(LOCAL_TZ)


def parse_coordinate_text(text):
    points = []
    if not text:
        return points
    for raw in text.replace("\n", " ").split():
        parts = raw.split(",")
        if len(parts) < 2:
            continue
        lon = float(parts[0])
        lat = float(parts[1])
        points.append((lat, lon))
    return points


def parse_kml(file_path, date_value=None):
    ns = {
        "kml": "http://www.opengis.net/kml/2.2",
        "gx": "http://www.google.com/kml/ext/2.2",
    }
    root = ET.parse(file_path).getroot()

    track = root.find(".//gx:Track", ns)
    if track is not None:
        coords = [
            coord.text.strip().split()
            for coord in track.findall("gx:coord", ns)
            if coord.text and coord.text.strip()
        ]
        points = [
            (float(parts[1]), float(parts[0])) for parts in coords if len(parts) >= 2
        ]
        times = [
            parse_time(when.text)
            for when in track.findall("kml:when", ns)
            if when.text and when.text.strip()
        ]
    else:
        points = []
        for coordinates in root.findall(".//kml:LineString/kml:coordinates", ns):
            points.extend(parse_coordinate_text(coordinates.text))
        times = []

    if len(points) < 2:
        raise ValueError("KML does not contain at least two route coordinates.")

    start_time = next((time for time in times if time is not None), None)
    if start_time is None:
        start_time = fallback_start_time(file_path, date_value)

    end_time = next((time for time in reversed(times) if time is not None), None)
    if end_time is None or end_time <= start_time:
        end_time = start_time + dt.timedelta(minutes=max(len(points) - 1, 1))

    return points, start_time, end_time


def parse_gpx(file_path, date_value=None):
    with open(file_path, encoding="utf-8") as f:
        gpx = gpxpy.parse(f)

    points = [
        (point.latitude, point.longitude)
        for track in gpx.tracks
        for segment in track.segments
        for point in segment.points
    ]
    times = [
        point.time
        for track in gpx.tracks
        for segment in track.segments
        for point in segment.points
        if point.time is not None
    ]

    if len(points) < 2:
        raise ValueError("GPX does not contain at least two route coordinates.")

    start_time = times[0].astimezone(LOCAL_TZ) if times else None
    if start_time is None:
        start_time = fallback_start_time(file_path, date_value)

    end_time = times[-1].astimezone(LOCAL_TZ) if times else None
    if end_time is None or end_time <= start_time:
        end_time = start_time + dt.timedelta(minutes=max(len(points) - 1, 1))

    return points, start_time, end_time


def parse_route_file(file_path, date_value=None):
    suffix = file_path.suffix.lower()
    if suffix == ".kml":
        return parse_kml(file_path, date_value=date_value)
    if suffix == ".gpx":
        return parse_gpx(file_path, date_value=date_value)
    raise ValueError(f"Unsupported Flight file type: {suffix}")


def haversine_meters(point_a, point_b):
    lat1, lon1 = point_a
    lat2, lon2 = point_b
    radius = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def calculate_distance(points):
    return sum(
        haversine_meters(points[index - 1], points[index])
        for index in range(1, len(points))
    )


def make_run_id(start_time, file_name):
    base = int(start_time.timestamp() * 1000)
    suffix = int(hashlib.sha1(file_name.encode("utf-8")).hexdigest()[:6], 16) % 1000
    return base + suffix


def load_existing_flights(session):
    rows = (
        session.query(Activity.name, Activity.start_date_local)
        .filter(Activity.type == "Flight")
        .filter(Activity.name.isnot(None))
        .all()
    )
    return {
        (name, str(start_date_local)[:10]) for name, start_date_local in rows if name
    }


def rebuild_activities_json(db_path=SQL_FILE, json_path=JSON_FILE):
    generator = Generator(db_path)
    activities_list = generator.loadForMapping()
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(activities_list, f, indent=0)


def build_activity(file_path, date_value=None, start_value=None, end_value=None):
    points, start_time, end_time = parse_route_file(file_path, date_value=date_value)
    override_start = parse_local_time(start_value, file_path, date_value=date_value)
    override_end = parse_local_time(end_value, file_path, date_value=date_value)
    start_time = override_start or start_time
    end_time = override_end or end_time
    if end_time <= start_time:
        end_time = end_time + dt.timedelta(days=1)
    local_start = start_time.astimezone(LOCAL_TZ).replace(tzinfo=None)
    local_end = end_time.astimezone(LOCAL_TZ).replace(tzinfo=None)
    utc_start = start_time.astimezone(dt.timezone.utc).replace(tzinfo=None)
    moving_time = local_end - local_start
    elapsed_time = moving_time
    distance = calculate_distance(points)
    seconds = max(moving_time.total_seconds(), 1)
    activity = {
        "id": make_run_id(start_time, file_path.name),
        "name": file_path.stem,
        "type": "Flight",
        "distance": distance,
        "moving_time": moving_time,
        "elapsed_time": elapsed_time,
        "start_date": utc_start.strftime("%Y-%m-%d %H:%M:%S"),
        "start_date_local": local_start.strftime("%Y-%m-%d %H:%M:%S"),
        "average_heartrate": None,
        "average_speed": distance / seconds,
        "elevation_gain": 0,
        "map": run_map(polyline.encode(points)),
        "start_latlng": start_point(points[0][0], points[0][1]),
        "source": f"flight_{file_path.suffix.lower().lstrip('.')}",
        "location_country": "Flight",
    }
    return namedtuple("FlightActivity", activity.keys())(*activity.values())


def sync_flight_routes(
    folder, dry_run=False, date_value=None, start_value=None, end_value=None
):
    folder = Path(folder).resolve()
    if not folder.exists():
        folder.mkdir(parents=True)
        print(f"Created flight folder: {folder}")

    files = sorted(
        file_path
        for file_path in folder.iterdir()
        if file_path.is_file() and file_path.suffix.lower() in {".kml", ".gpx"}
    )
    print(f"Flight route files: {len(files)}")
    if not files:
        return

    generator = Generator(SQL_FILE)
    session = generator.session
    synced_files = set(load_synced_file_list())
    existing_flights = load_existing_flights(session)

    imported_files = []
    created_count = 0
    skipped_count = 0
    failed_count = 0

    for file_path in files:
        file_name = file_path.name
        activity_name = file_path.stem

        if file_name in synced_files:
            skipped_count += 1
            print(f"skip synced file: {file_name}")
            continue

        try:
            activity = build_activity(
                file_path,
                date_value=date_value,
                start_value=start_value,
                end_value=end_value,
            )
            activity_date = activity.start_date_local[:10]

            if (activity_name, activity_date) in existing_flights:
                skipped_count += 1
                imported_files.append(file_name)
                print(f"skip existing Flight activity: {activity_name} {activity_date}")
                continue

            existing_activity = (
                session.query(Activity).filter_by(run_id=activity.id).first()
            )
            if existing_activity:
                skipped_count += 1
                print(
                    "skip run_id conflict: "
                    f"{file_name} -> {activity.id} already exists as "
                    f"{existing_activity.type} / {existing_activity.name}"
                )
                continue

            print(
                f"import Flight: {activity_name} "
                f"{activity.start_date_local} "
                f"{activity.distance / 1000:.1f} km"
            )
            if not dry_run:
                created, _ = update_or_create_activity(session, activity)
                if created:
                    created_count += 1
                    existing_flights.add((activity_name, activity_date))
                    imported_files.append(file_name)
                else:
                    skipped_count += 1
        except Exception as exc:
            failed_count += 1
            print(f"failed {file_name}: {exc}")

    if dry_run:
        print(
            f"Dry run done. would_import={len(files) - skipped_count - failed_count}, "
            f"skipped={skipped_count}, failed={failed_count}"
        )
        return

    session.commit()

    if imported_files:
        save_synced_data_file_list(imported_files)
        rebuild_activities_json()

    print(
        f"Done. imported={created_count}, skipped={skipped_count}, "
        f"failed={failed_count}"
    )
    if imported_files:
        print(f"Rebuilt {JSON_FILE}")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Import KML/GPX files from flight/ as Flight activities."
    )
    parser.add_argument(
        "--folder",
        default=str(FLIGHT_FOLDER),
        help="Folder containing Flight KML/GPX files",
    )
    parser.add_argument(
        "--date",
        help="Fallback local date in YYYYMMDD format when the route has no timestamps",
    )
    parser.add_argument(
        "--start",
        help="Override local start time, for example 0839, 202606080839, or '2026-06-08 08:39'",
    )
    parser.add_argument(
        "--end",
        help="Override local end time, for example 1024, 202606081024, or '2026-06-08 10:24'",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and report what would be imported without writing data",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    sync_flight_routes(
        args.folder,
        dry_run=args.dry_run,
        date_value=args.date,
        start_value=args.start,
        end_value=args.end,
    )
