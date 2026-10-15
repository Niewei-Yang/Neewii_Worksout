"""Add one eligible activity's altitude stream to the local timeline preview."""

import argparse
import json
from datetime import datetime, timezone

from strava_pace_preview import (
    OUTPUT,
    RIDE_TYPES,
    RUN_TYPES,
    access_token,
    request_json,
    sample_bins,
    finite_number,
)


def categorized_climbs(activity):
    """Use official segment grades; map UTC start times to activity elapsed time.

    Timestamp mapping also works for sparse/downsampled streams; stream indices
    must not be interpreted as elapsed seconds or indexes into cached bins.
    Strava's categories 1..5 map to Cat 4, 3, 2, 1, HC respectively.
    """
    origin = datetime.fromisoformat(activity["start_date"].replace("Z", "+00:00"))
    duration = activity["elapsed_time"]
    climbs = []
    for effort in activity.get("segment_efforts") or []:
        segment = effort.get("segment") or {}
        category = segment.get("climb_category")
        if category not in (1, 2, 3, 4, 5) or isinstance(category, bool):
            continue
        seconds = effort.get("elapsed_time")
        if not finite_number(seconds) or seconds <= 0:
            continue
        try:
            start = (
                datetime.fromisoformat(effort["start_date"].replace("Z", "+00:00"))
                - origin
            ).total_seconds()
        except (KeyError, ValueError, TypeError):
            continue
        end = min(duration, start + seconds)
        start = max(0, start)
        if end <= start:
            continue
        climbs.append(
            {
                "segment_id": segment["id"],
                "name": segment.get("name", ""),
                "category": category,
                "start": start,
                "end": end,
                "distance": segment.get("distance"),
                "average_grade": segment.get("average_grade"),
            }
        )
    return climbs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("activity_id", type=int)
    activity_id = parser.parse_args().activity_id
    token = access_token()
    activity = request_json(
        f"https://www.strava.com/api/v3/activities/{activity_id}", token
    )
    sport = activity.get("sport_type") or activity.get("type")
    gain = activity.get("total_elevation_gain") or 0
    if sport not in RUN_TYPES | RIDE_TYPES or gain <= 500:
        raise RuntimeError(
            "Elevation preview requires a run or ride with elevation gain above 500 m"
        )
    payload = json.loads(OUTPUT.read_text(encoding="utf-8"))
    item = next((a for a in payload["activities"] if a["id"] == activity_id), None)
    if item is None:
        raise RuntimeError("Activity is not in the current timeline preview")
    streams = request_json(
        f"https://www.strava.com/api/v3/activities/{activity_id}/streams?keys=time,altitude&key_by_type=true",
        token,
    )
    if "time" not in streams or "altitude" not in streams:
        raise RuntimeError("No altitude stream available")
    bins = sample_bins(
        streams["time"]["data"],
        streams["altitude"]["data"],
        elapsed=activity["elapsed_time"],
        metric="elevation",
    )
    if not any(b[2] is not None for b in bins):
        raise RuntimeError("No valid altitude samples")
    climbs = categorized_climbs(activity)
    item.update(
        elevation_bins=bins,
        elevation_gain=gain,
        climbs=climbs,
        climbs_source="strava_segments",
        elevation_fetched_at=datetime.now(timezone.utc).isoformat(),
    )
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    temporary.replace(OUTPUT)
    values = [b[2] for b in bins if b[2] is not None]
    print(
        f"Activity {activity_id}: gain {gain} m; altitude {min(values):.1f}–{max(values):.1f} m; {len(bins)} bins"
    )
    print(f"Official categorized climbing segments: {len(climbs)}")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError) as error:
        raise SystemExit(str(error)) from None
