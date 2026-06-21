import argparse
import datetime as dt
import json
from pathlib import Path

from config import JSON_FILE, SQL_FILE
from generator import Generator
from generator.db import Activity, update_or_create_activity
from gpxtrackposter.track_loader import load_fit_file, load_gpx_file
from synced_data_file_logger import (
    load_synced_file_list,
    save_synced_data_file_list,
)

ROADTRIP_FOLDER = Path(__file__).resolve().parent.parent / "roadtrip"


def load_existing_roadtrip_names(session):
    rows = (
        session.query(Activity.name)
        .filter(Activity.type == "RoadTrip")
        .filter(Activity.name.isnot(None))
        .all()
    )
    return {name for (name,) in rows if name}


def rebuild_activities_json(db_path=SQL_FILE, json_path=JSON_FILE):
    generator = Generator(db_path)
    activities_list = generator.loadForMapping()
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(activities_list, f, indent=0)


ROADTRIP_LOADERS = {
    ".gpx": ("GPX", "roadtrip_gpx", load_gpx_file),
    ".fit": ("FIT", "roadtrip_fit", load_fit_file),
}


def normalize_naive_local_times(track):
    if (
        not track.start_time
        or not track.end_time
        or not track.start_time_local
        or track.start_time.tzinfo is not None
    ):
        return

    offset = track.start_time_local - track.start_time
    if offset == dt.timedelta():
        return

    track.start_time_local = track.start_time
    track.end_time_local = track.end_time
    track.start_time = track.start_time - offset
    track.end_time = track.end_time - offset


def sync_roadtrip_gpx(folder, dry_run=False):
    folder = Path(folder).resolve()
    if not folder.exists():
        folder.mkdir(parents=True)
        print(f"Created roadtrip folder: {folder}")

    files = sorted(
        file_path
        for file_path in folder.iterdir()
        if file_path.is_file() and file_path.suffix.lower() in ROADTRIP_LOADERS
    )
    file_counts = {
        label: sum(1 for file_path in files if file_path.suffix.lower() == suffix)
        for suffix, (label, _, _) in ROADTRIP_LOADERS.items()
    }
    print(
        "RoadTrip files: "
        + ", ".join(f"{label}={count}" for label, count in file_counts.items())
    )
    if not files:
        return

    generator = Generator(SQL_FILE)
    session = generator.session
    synced_files = set(load_synced_file_list())
    existing_names = load_existing_roadtrip_names(session)

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

        if activity_name in existing_names:
            skipped_count += 1
            imported_files.append(file_name)
            print(f"skip existing RoadTrip activity: {activity_name}")
            continue

        try:
            _, source, load_file = ROADTRIP_LOADERS[file_path.suffix.lower()]
            track = load_file(
                str(file_path), activity_title_dict={activity_name: activity_name}
            )
            if not track or not track.length or not track.start_time_local:
                skipped_count += 1
                print(f"skip invalid GPX: {file_name}")
                continue

            normalize_naive_local_times(track)
            track.type = "RoadTrip"
            track.track_name = activity_name
            track.name = activity_name
            track.source = source

            existing_activity = (
                session.query(Activity).filter_by(run_id=int(track.run_id)).first()
            )
            if existing_activity:
                skipped_count += 1
                print(
                    "skip run_id conflict: "
                    f"{file_name} -> {track.run_id} already exists as "
                    f"{existing_activity.type} / {existing_activity.name}"
                )
                continue

            print(f"import RoadTrip: {activity_name}")
            if not dry_run:
                created, _ = update_or_create_activity(session, track.to_namedtuple())
                if created:
                    created_count += 1
                    existing_names.add(activity_name)
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
        description="Import GPX files from roadtrip/ as RoadTrip activities."
    )
    parser.add_argument(
        "--folder",
        default=str(ROADTRIP_FOLDER),
        help="Folder containing RoadTrip GPX files",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and report what would be imported without writing data",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    sync_roadtrip_gpx(args.folder, dry_run=args.dry_run)
