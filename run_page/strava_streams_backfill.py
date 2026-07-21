import argparse
import json
import os
from pathlib import Path

import polyline
from sqlalchemy import or_

from config import JSON_FILE, SQL_FILE
from generator.db import Activity, init_db
from polyline_processor import filter_out
from strava_streams import (
    points_per_100km_for_activity,
    simplify_latlng_by_density,
    stream_data,
    stream_kwargs,
)
from utils import make_strava_client

IGNORE_BEFORE_SAVING = os.getenv("IGNORE_BEFORE_SAVING", "").lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def find_activity(session, activity_id=None, name=None):
    query = session.query(Activity)
    if activity_id:
        return query.filter(Activity.run_id == int(activity_id)).first()

    if not name:
        raise ValueError("Either --activity-id or --activity-name is required.")

    matches = (
        query.filter(or_(Activity.name == name, Activity.name.like(f"%{name}%")))
        .order_by(Activity.start_date_local.desc())
        .all()
    )
    if not matches:
        return None
    if len(matches) > 1:
        print("Matched multiple activities; using the most recent one:")
        for activity in matches[:10]:
            print(
                f"  {activity.run_id} {activity.start_date_local} "
                f"{activity.name} {activity.distance / 1000:.1f} km"
            )
    return matches[0]


def decode_point_count(polyline_str):
    if not polyline_str:
        return 0
    return len(polyline.decode(polyline_str))


def update_activity_in_json(activity):
    with open(JSON_FILE, encoding="utf-8") as file:
        activities = json.load(file)

    for item in activities:
        if int(item["run_id"]) == int(activity.run_id):
            item["summary_polyline"] = activity.summary_polyline
            break
    else:
        raise ValueError(f"Activity {activity.run_id} was not found in {JSON_FILE}")

    with open(JSON_FILE, "w", encoding="utf-8") as file:
        json.dump(activities, file, indent=0)


def write_gpx(path, activity, latlng):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    name = activity.name or f"activity-{activity.run_id}"
    points = "\n".join(
        f'      <trkpt lat="{lat}" lon="{lon}"></trkpt>' for lat, lon in latlng
    )
    content = f"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Neewii_Worksout strava_streams_backfill">
  <trk>
    <name>{name}</name>
    <trkseg>
{points}
    </trkseg>
  </trk>
</gpx>
"""
    path.write_text(content, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Fetch Strava latlng streams for one activity, compare them with "
            "the stored summary_polyline, and optionally write the denser "
            "polyline back to the local DB."
        )
    )
    parser.add_argument("client_id", help="Strava client id")
    parser.add_argument("client_secret", help="Strava client secret")
    parser.add_argument("refresh_token", help="Strava refresh token")
    parser.add_argument(
        "--activity-id",
        help="Local/Strava activity id. Prefer this when known.",
    )
    parser.add_argument(
        "--activity-name",
        default="百里画廊骑行",
        help="Activity name or partial name to search in the local DB.",
    )
    parser.add_argument(
        "--resolution",
        default="all",
        choices=["low", "medium", "high", "all"],
        help="Strava stream resolution. Use all for the most complete stream.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write the stream polyline back to run_page/data.db and rebuild activities.json.",
    )
    parser.add_argument(
        "--gpx-out",
        help="Optional GPX output path for inspecting the fetched stream route.",
    )
    options = parser.parse_args()

    session = init_db(SQL_FILE)
    activity = find_activity(session, options.activity_id, options.activity_name)
    if not activity:
        raise SystemExit("Activity not found in the local database.")

    original_points = decode_point_count(activity.summary_polyline)
    print(
        f"Activity: {activity.run_id} {activity.start_date_local} "
        f"{activity.name} {activity.distance / 1000:.1f} km"
    )
    print(f"Stored summary_polyline points: {original_points}")

    client = make_strava_client(
        options.client_id, options.client_secret, options.refresh_token
    )
    streams = client.get_activity_streams(
        int(activity.run_id), **stream_kwargs(options.resolution)
    )
    latlng = stream_data(streams.get("latlng") if streams else None)
    if not latlng:
        raise SystemExit(
            "No latlng stream returned. Make sure the authenticated athlete owns "
            "this activity and the activity has GPS data."
        )

    stream_points = len(latlng)
    simplified_latlng = simplify_latlng_by_density(
        latlng,
        points_per_100km=points_per_100km_for_activity(activity.type),
    )
    simplified_polyline = polyline.encode(simplified_latlng)
    if IGNORE_BEFORE_SAVING:
        simplified_polyline = filter_out(simplified_polyline)
        if not simplified_polyline:
            raise SystemExit("Privacy filtering removed the entire route; not writing.")
    simplified_points = len(simplified_latlng)
    print(f"Fetched latlng stream points: {stream_points}")
    print(f"Simplified stream points: {simplified_points}")
    if original_points:
        print(f"Point count multiplier: {simplified_points / original_points:.2f}x")
    print(
        "Average meters per point: "
        f"{activity.distance / max(simplified_points, 1):.1f} "
        f"(was {activity.distance / max(original_points, 1):.1f})"
    )

    if options.gpx_out:
        write_gpx(options.gpx_out, activity, simplified_latlng)
        print(f"Wrote GPX preview: {options.gpx_out}")

    if options.write:
        activity.summary_polyline = simplified_polyline
        session.commit()
        update_activity_in_json(activity)
        print(f"Updated DB and activity route in {JSON_FILE}")
    else:
        print("Dry run only. Pass --write to update the local DB and activities.json.")


if __name__ == "__main__":
    main()
