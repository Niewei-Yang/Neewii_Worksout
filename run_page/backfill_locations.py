import argparse
import json
import sqlite3
import time
from pathlib import Path

import polyline
from geopy.exc import GeocoderServiceError, GeocoderTimedOut
from geopy.geocoders import Nominatim

from config import JSON_FILE, SQL_FILE
from generator import Generator


def first_point(summary_polyline):
    if not summary_polyline:
        return None
    points = polyline.decode(summary_polyline)
    if not points:
        return None
    return points[0]


def location_cache_key(point, precision):
    lat, lon = point
    return (round(lat, precision), round(lon, precision))


def load_empty_location_rows(conn, limit):
    sql = """
        SELECT run_id, name, start_date_local, summary_polyline
        FROM activities
        WHERE (location_country IS NULL OR location_country = '')
          AND summary_polyline IS NOT NULL
          AND summary_polyline != ''
        ORDER BY start_date_local DESC
    """
    if limit:
        sql += " LIMIT ?"
        return conn.execute(sql, (limit,)).fetchall()
    return conn.execute(sql).fetchall()


def rebuild_activities_json(db_path, json_path):
    generator = Generator(str(db_path))
    activities_list = generator.loadForMapping()
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(activities_list, f, indent=0)


def backfill_locations(args):
    db_path = Path(args.db)
    json_path = Path(args.json)
    conn = sqlite3.connect(db_path)
    rows = load_empty_location_rows(conn, args.limit)

    print(f"Found {len(rows)} activities with empty location and route data.")
    if not rows:
        conn.close()
        return

    geolocator = Nominatim(
        user_agent=args.user_agent,
        timeout=args.timeout,
    )
    cache = {}
    updated = 0
    skipped = 0
    failed = 0

    for index, (run_id, name, start_date_local, summary_polyline) in enumerate(
        rows, start=1
    ):
        try:
            point = first_point(summary_polyline)
        except Exception as exc:
            failed += 1
            print(f"[{index}/{len(rows)}] {run_id} decode failed: {exc}")
            continue

        if not point:
            skipped += 1
            print(f"[{index}/{len(rows)}] {run_id} skipped: no route point")
            continue

        key = location_cache_key(point, args.cache_precision)
        location_text = cache.get(key)

        if location_text is None:
            lat, lon = key
            try:
                location = geolocator.reverse(
                    f"{lat}, {lon}",
                    language=args.language,
                    exactly_one=True,
                )
                location_text = str(location) if location else ""
                cache[key] = location_text
                time.sleep(args.sleep)
            except (GeocoderServiceError, GeocoderTimedOut) as exc:
                failed += 1
                print(f"[{index}/{len(rows)}] {run_id} geocode failed: {exc}")
                time.sleep(args.sleep)
                continue
            except Exception as exc:
                failed += 1
                print(f"[{index}/{len(rows)}] {run_id} unexpected error: {exc}")
                time.sleep(args.sleep)
                continue

        if not location_text:
            skipped += 1
            print(f"[{index}/{len(rows)}] {run_id} skipped: empty geocode result")
            continue

        preview = location_text[:90].replace("\n", " ")
        print(f"[{index}/{len(rows)}] {run_id} {start_date_local} {name}: {preview}")

        if not args.dry_run:
            conn.execute(
                "UPDATE activities SET location_country = ? WHERE run_id = ?",
                (location_text, run_id),
            )
            updated += 1

            if args.commit_every and updated % args.commit_every == 0:
                conn.commit()

    if not args.dry_run:
        conn.commit()
    conn.close()

    print(
        f"Done. updated={updated}, skipped={skipped}, failed={failed}, "
        f"cache_entries={len(cache)}, dry_run={args.dry_run}"
    )

    if not args.dry_run and not args.no_json:
        rebuild_activities_json(db_path, json_path)
        print(f"Rebuilt {json_path}")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Backfill empty activity locations from summary polyline start points."
    )
    parser.add_argument("--db", default=SQL_FILE, help="SQLite database path")
    parser.add_argument("--json", default=JSON_FILE, help="activities.json path")
    parser.add_argument("--limit", type=int, default=0, help="Max rows to process")
    parser.add_argument(
        "--sleep",
        type=float,
        default=1.2,
        help="Seconds to wait between Nominatim requests",
    )
    parser.add_argument(
        "--timeout", type=int, default=10, help="Nominatim request timeout in seconds"
    )
    parser.add_argument("--language", default="zh-CN", help="Geocode language")
    parser.add_argument(
        "--cache-precision",
        type=int,
        default=4,
        help="Coordinate rounding precision for request cache",
    )
    parser.add_argument(
        "--commit-every",
        type=int,
        default=10,
        help="Commit after this many successful updates",
    )
    parser.add_argument(
        "--user-agent",
        default="workouts-page-location-backfill",
        help="Nominatim user agent",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print results without updating the database",
    )
    parser.add_argument(
        "--no-json",
        action="store_true",
        help="Do not rebuild src/static/activities.json after updating the database",
    )
    return parser.parse_args()


if __name__ == "__main__":
    backfill_locations(parse_args())
