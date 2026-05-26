import argparse
import datetime as dt
import hashlib
import json
import math
import os
import sys
import xml.etree.ElementTree as ET
from collections import namedtuple
from pathlib import Path

import gpxpy
import polyline

from config import JSON_FILE, SQL_FILE, run_map, start_point
from generator import Generator
from generator.db import Activity, update_or_create_activity
from synced_data_file_logger import (
    load_synced_file_list,
    save_synced_data_file_list,
)


TRAIN_FOLDER = Path(__file__).resolve().parent.parent / "train"
LOCAL_TZ = dt.timezone(dt.timedelta(hours=8))


def parse_local_time(value):
    if not value:
        return None
    value = value.strip()
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


def load_gpx_points(file_path):
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
    return points, times


def load_kml_points(file_path):
    ns = {
        "kml": "http://www.opengis.net/kml/2.2",
        "gx": "http://www.google.com/kml/ext/2.2",
    }
    root = ET.parse(file_path).getroot()
    track = root.find(".//gx:Track", ns)
    times = []
    if track is not None:
        coords = [
            coord.text.strip().split()
            for coord in track.findall("gx:coord", ns)
            if coord.text and coord.text.strip()
        ]
        points = [
            (float(parts[1]), float(parts[0]))
            for parts in coords
            if len(parts) >= 2
        ]
        for when in track.findall("kml:when", ns):
            if not when.text or not when.text.strip():
                continue
            value = when.text.strip()
            if value.endswith("Z"):
                value = value[:-1] + "+00:00"
            times.append(dt.datetime.fromisoformat(value))
    else:
        points = []
        for coordinates in root.findall(".//kml:LineString/kml:coordinates", ns):
            points.extend(parse_coordinate_text(coordinates.text))
    return points, times


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


def rebuild_activities_json(db_path=SQL_FILE, json_path=JSON_FILE):
    generator = Generator(db_path)
    activities_list = generator.loadForMapping()
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(activities_list, f, indent=0)


def load_points(file_path):
    suffix = file_path.suffix.lower()
    if suffix == ".gpx":
        return load_gpx_points(file_path)
    if suffix == ".kml":
        return load_kml_points(file_path)
    raise ValueError(f"Unsupported Train file type: {suffix}")


def build_activity(file_path, start_value=None, end_value=None):
    points, times = load_points(file_path)
    if len(points) < 2:
        raise ValueError("Route does not contain at least two coordinates.")

    start_time = parse_local_time(start_value)
    end_time = parse_local_time(end_value)
    if start_time is None and times:
        start_time = times[0].astimezone(LOCAL_TZ)
    if end_time is None and times:
        end_time = times[-1].astimezone(LOCAL_TZ)
    if start_time is None:
        modified = dt.datetime.fromtimestamp(os.path.getmtime(file_path), tz=LOCAL_TZ)
        start_time = modified.replace(second=0, microsecond=0)
    if end_time is None or end_time <= start_time:
        end_time = start_time + dt.timedelta(minutes=max(len(points) - 1, 1))

    local_start = start_time.astimezone(LOCAL_TZ).replace(tzinfo=None)
    local_end = end_time.astimezone(LOCAL_TZ).replace(tzinfo=None)
    utc_start = start_time.astimezone(dt.timezone.utc).replace(tzinfo=None)
    moving_time = local_end - local_start
    distance = calculate_distance(points)
    seconds = max(moving_time.total_seconds(), 1)
    activity = {
        "id": make_run_id(start_time, file_path.name),
        "name": file_path.stem,
        "type": "Train",
        "distance": distance,
        "moving_time": moving_time,
        "elapsed_time": moving_time,
        "start_date": utc_start.strftime("%Y-%m-%d %H:%M:%S"),
        "start_date_local": local_start.strftime("%Y-%m-%d %H:%M:%S"),
        "average_heartrate": None,
        "average_speed": distance / seconds,
        "elevation_gain": 0,
        "map": run_map(polyline.encode(points)),
        "start_latlng": start_point(points[0][0], points[0][1]),
        "source": f"train_{file_path.suffix.lower().lstrip('.')}",
        "location_country": "Train",
    }
    return namedtuple("TrainActivity", activity.keys())(*activity.values())


def sync_train(folder, dry_run=False, start_value=None, end_value=None):
    folder = Path(folder).resolve()
    if not folder.exists():
        folder.mkdir(parents=True)
        print(f"Created train folder: {folder}")

    files = sorted(
        file_path
        for file_path in folder.iterdir()
        if file_path.is_file() and file_path.suffix.lower() in {".gpx", ".kml"}
    )
    print(f"Train route files: {len(files)}")
    if not files:
        return

    generator = Generator(SQL_FILE)
    session = generator.session
    synced_files = set(load_synced_file_list())
    imported_files = []
    created_count = 0
    skipped_count = 0
    failed_count = 0

    for file_path in files:
        file_name = file_path.name
        if file_name in synced_files:
            skipped_count += 1
            print(f"skip synced file: {file_name}")
            continue

        try:
            activity = build_activity(
                file_path, start_value=start_value, end_value=end_value
            )
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
                f"import Train: {activity.name} "
                f"{activity.start_date_local} "
                f"{activity.distance / 1000:.1f} km "
                f"{activity.average_speed * 3.6:.1f} km/h"
            )
            if not dry_run:
                created, _ = update_or_create_activity(session, activity)
                if created:
                    created_count += 1
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
        description="Import GPX/KML files from train/ as Train activities."
    )
    parser.add_argument(
        "--folder",
        default=str(TRAIN_FOLDER),
        help="Folder containing Train GPX/KML files",
    )
    parser.add_argument(
        "--start",
        help="Local start time, for example 202604300840 or '2026-04-30 08:40'",
    )
    parser.add_argument(
        "--end",
        help="Local end time, for example 202604301110 or '2026-04-30 11:10'",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and report what would be imported without writing data",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    sync_train(
        args.folder,
        dry_run=args.dry_run,
        start_value=args.start,
        end_value=args.end,
    )
