"""Fetch a bounded, explicit five-run pace preview; never runs in the daily sync.

Uses time-weighted velocity over 10-second elapsed-time windows. Pauses and
unknown spans split windows, so neither is smoothed into running pace.
Credentials stay in .env/process memory, never in the exported preview.
"""

import argparse
import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data" / "pace-preview.json"
WINDOW_SECONDS = 10
MAX_SAMPLE_GAP = 30
RUN_TYPES = {"Run", "TrailRun", "VirtualRun"}
RIDE_TYPES = {
    "Ride",
    "VirtualRide",
    "MountainBikeRide",
    "GravelRide",
    "EBikeRide",
    "EMountainBikeRide",
    "Handcycle",
    "Velomobile",
}


def finite_number(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def sample_bins(times, velocities, moving=None, elapsed=None, metric="pace"):
    """Return [start, end, seconds/km or null, running|paused|unknown].

    A velocity sample represents [t[i], t[i+1]). Gaps exceeding 30 seconds,
    invalid velocity and uncovered head/tail spans are unknown, not recovery.
    A false moving flag or zero velocity means paused/stationary.
    """
    if len(times) != len(velocities) or (
        moving is not None and len(moving) != len(times)
    ):
        raise ValueError("Streams are not aligned")
    if not times or any(not finite_number(t) or t < 0 for t in times):
        raise ValueError("Missing or invalid timestamps")
    if any(b <= a for a, b in zip(times, times[1:])):
        raise ValueError("Timestamps must increase")
    if elapsed is None:
        elapsed = times[-1]
    if not finite_number(elapsed) or elapsed < times[-1] or elapsed <= 0:
        raise ValueError("Invalid elapsed duration")

    spans = []
    if times[0] > 0:
        spans.append((0, times[0], None, "unknown"))
    for i, (start, end) in enumerate(zip(times, times[1:])):
        speed = velocities[i]
        if end - start > MAX_SAMPLE_GAP:
            state = "unknown"
        elif moving is not None and moving[i] is False:
            state = "paused"
        elif not finite_number(speed) or (speed < 0 and metric != "elevation"):
            state = "unknown"
        elif speed == 0 and metric == "pace":
            state = "paused"
        else:
            state = "running"
        spans.append((start, end, speed if state == "running" else None, state))
    if times[-1] < elapsed:
        spans.append((times[-1], elapsed, None, "unknown"))

    # Accumulate speed * seconds, not average pace or sample counts.
    chunks = []
    for start, end, speed, state in spans:
        while start < end:
            boundary = (math.floor(start / WINDOW_SECONDS) + 1) * WINDOW_SECONDS
            stop = min(end, boundary)
            bucket = math.floor(start / WINDOW_SECONDS)
            if (
                chunks
                and chunks[-1][4] == bucket
                and chunks[-1][3] == state
                and chunks[-1][1] == start
            ):
                chunks[-1][1] = stop
                chunks[-1][2] += (speed or 0) * (stop - start)
            else:
                chunks.append(
                    [start, stop, (speed or 0) * (stop - start), state, bucket]
                )
            start = stop
    return [
        [
            start,
            end,
            (
                round(
                    (
                        1000 * (end - start) / distance
                        if metric == "pace"
                        else distance / (end - start)
                    ),
                    2,
                )
                if state == "running"
                else None
            ),
            state,
        ]
        for start, end, distance, state, _ in chunks
    ]


def pace_bins(times, velocities, moving=None, elapsed=None):
    return sample_bins(times, velocities, moving, elapsed, metric="pace")


def power_bins(times, watts, elapsed=None):
    # Coasting at zero watts is valid power. Stationary/indoor power also counts.
    return sample_bins(times, watts, elapsed=elapsed, metric="power")


def activity_bins(streams, elapsed, prefer_power=False):
    times = streams.get("time", {}).get("data", [])
    watts = streams.get("watts", {}).get("data", [])
    if prefer_power and len(times) >= 2 and len(watts) == len(times):
        bins = power_bins(times, watts, elapsed)
        if any(b[3] == "running" for b in bins):
            return "power", bins
    speeds = streams.get("velocity_smooth", {}).get("data", [])
    if not times or not speeds:
        return "pace", []
    return "pace", pace_bins(
        times, speeds, streams.get("moving", {}).get("data"), elapsed
    )


def request_json(url, token=None, form=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    data = urlencode(form).encode() if form else None
    request = Request(url, data=data, headers=headers)
    try:
        with urlopen(request, timeout=40) as response:
            return json.load(response)
    except HTTPError as error:
        raise RuntimeError(f"Strava request failed (HTTP {error.code})") from None
    except URLError:
        raise RuntimeError("Strava network request failed") from None


def access_token():
    env_path = ROOT / ".env"
    env_text = env_path.read_text(encoding="utf-8-sig") if env_path.exists() else ""
    values = {}
    for line in env_text.splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip("\"'")
    names = ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_CLIENT_REFRESH_TOKEN"]
    credentials = {name: os.environ.get(name) or values.get(name) for name in names}
    if not all(credentials.values()):
        raise RuntimeError("Missing Strava credentials in .env or environment")
    result = request_json(
        "https://www.strava.com/oauth/token",
        form={
            "client_id": credentials[names[0]],
            "client_secret": credentials[names[1]],
            "refresh_token": credentials[names[2]],
            "grant_type": "refresh_token",
        },
    )
    # Preserve a rotated refresh token locally, only when this file supplied it.
    refreshed = result.get("refresh_token")
    if (
        refreshed
        and refreshed != values.get(names[2])
        and not os.environ.get(names[2])
        and names[2] in values
    ):
        env_path.write_text(
            re.sub(
                r"(?m)^\s*STRAVA_CLIENT_REFRESH_TOKEN\s*=.*$",
                lambda _: f"STRAVA_CLIENT_REFRESH_TOKEN={refreshed}",
                env_text,
            ),
            encoding="utf-8",
        )
    return result["access_token"]


def main():
    parser = argparse.ArgumentParser(
        description="Refresh five runs or rides in the activity timeline preview"
    )
    parser.add_argument("--sport", choices=("run", "ride"), default="run")
    sport = parser.parse_args().sport
    sport_types = RIDE_TYPES if sport == "ride" else RUN_TYPES
    token = access_token()
    runs = []
    for page in range(1, 11):
        activities = request_json(
            f"https://www.strava.com/api/v3/athlete/activities?per_page=100&page={page}",
            token,
        )
        runs.extend(
            a
            for a in activities
            if (a.get("sport_type") or a.get("type")) in sport_types
        )
        if len(runs) >= 5 or len(activities) < 100:
            break
    runs = sorted(runs, key=lambda a: a["start_date"], reverse=True)[:5]
    if not runs:
        raise RuntimeError(f"No {sport} activities found")
    exported = []
    for activity in runs:
        item = {
            key: activity.get(key)
            for key in (
                "id",
                "name",
                "start_date_local",
                "distance",
                "moving_time",
                "elapsed_time",
                "device_watts",
            )
        }
        # Preserve the separately fetched altitude test when refreshing pace/power.
        if OUTPUT.exists():
            old = json.loads(OUTPUT.read_text(encoding="utf-8"))
            cached = next(
                (a for a in old["activities"] if a["id"] == activity["id"]), {}
            )
            item.update(
                {
                    key: cached[key]
                    for key in (
                        "elevation_bins",
                        "elevation_gain",
                        "elevation_fetched_at",
                        "climbs",
                        "climbs_source",
                    )
                    if key in cached
                }
            )
        item["sport_group"] = sport
        item["fetched_at"] = datetime.now(timezone.utc).isoformat()
        keys = (
            "time,velocity_smooth,moving,watts"
            if sport == "ride"
            else "time,velocity_smooth,moving"
        )
        streams = request_json(
            f"https://www.strava.com/api/v3/activities/{activity['id']}/streams?keys={keys}&key_by_type=true",
            token,
        )
        item["metric"], item["bins"] = activity_bins(
            streams, activity["elapsed_time"], prefer_power=sport == "ride"
        )
        if not item["bins"]:
            item["unavailable"] = "missing_streams"
        item["sample_count"] = len(streams.get("time", {}).get("data", []))
        exported.append(item)
        print(
            f"{item['id']} {item['start_date_local']}: {len(item['bins'])} {item['metric']} bins",
            flush=True,
        )
    retained = []
    if OUTPUT.exists():
        previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
        retained = [
            a for a in previous["activities"] if a.get("sport_group", "run") != sport
        ]
    payload = {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window_seconds": WINDOW_SECONDS,
        "max_sample_gap_seconds": MAX_SAMPLE_GAP,
        "activities": retained + exported,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    temporary.replace(OUTPUT)
    print(
        f"Saved {len(exported)} {sport} activities; retained {len(retained)} other activities"
    )


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError) as error:
        raise SystemExit(str(error)) from None
