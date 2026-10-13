"""Cache Strava's official 5K/10K/half/full-marathon elapsed-time efforts."""

import argparse
import datetime
import json
import logging
import os
from pathlib import Path

from config import JSON_FILE, SQL_FILE
from generator.db import Activity, init_db
from strava_streams import is_run_activity

DISTANCES = {"5k": 5000, "10k": 10000, "halfmarathon": 21097.5, "marathon": 42195}


def value(item, key, default=None):
    return (
        item.get(key, default)
        if isinstance(item, dict)
        else getattr(item, key, default)
    )


def seconds(duration):
    if hasattr(duration, "total_seconds"):
        return duration.total_seconds()
    try:
        return float(duration)
    except (TypeError, ValueError):
        return 0


def official_efforts(detail):
    raw = value(detail, "best_efforts")
    if raw is None:
        return None  # A missing API field is not a verified empty result.
    result = []
    for effort in raw:
        name = str(value(effort, "name", ""))
        key = name.replace("-", "").replace(" ", "").lower()
        target = DISTANCES.get(key)
        try:
            distance = float(value(effort, "distance", 0))
        except (TypeError, ValueError):
            continue
        elapsed = seconds(value(effort, "elapsed_time"))
        if target is None or abs(distance - target) > 1 or elapsed <= 0:
            continue
        result.append(
            {"name": name, "distance": distance, "elapsed_time": int(elapsed)}
        )
    return result


def sync_best_efforts(client, session, limit=20, refresh=False):
    # Old stravalib models warn about every new API attribute; none affect efforts.
    logging.getLogger("stravalib.model").setLevel(logging.ERROR)
    candidates = [
        activity
        for activity in session.query(Activity).order_by(
            Activity.start_date_local.desc()
        )
        if activity.source == "strava"
        and is_run_activity(activity.type)
        and activity.distance >= 5000
        and (refresh or activity.best_efforts is None)
    ]
    if limit > 0:
        candidates = candidates[:limit]
    updated = 0
    for activity in candidates:
        try:
            efforts = official_efforts(client.get_activity(int(activity.run_id)))
            if efforts is None:
                print(
                    f"Best efforts unavailable for {activity.run_id}; keeping cached data.",
                    flush=True,
                )
                continue
            activity.best_efforts = efforts
            activity.best_efforts_synced_at = datetime.datetime.now(
                datetime.timezone.utc
            ).isoformat()
            session.commit()  # Resume safely after an API or process interruption.
            updated += 1
            print(
                f"Best efforts {updated}/{len(candidates)}: {activity.run_id} ({len(efforts)} distances)",
                flush=True,
            )
        except Exception as error:
            session.rollback()
            # Do not log request URLs or authentication data from third-party exceptions.
            print(
                f"Best-effort sync stopped ({type(error).__name__}); cached results retained.",
                flush=True,
            )
            break
    return updated


def update_json(session, json_path=JSON_FILE):
    path = Path(json_path)
    activities = json.loads(path.read_text(encoding="utf-8"))
    cached = {
        activity.run_id: activity
        for activity in session.query(Activity)
        if activity.best_efforts is not None
    }
    for item in activities:
        activity = cached.get(int(item["run_id"]))
        if activity is not None:
            item["best_efforts"] = activity.best_efforts
            item["best_efforts_synced_at"] = activity.best_efforts_synced_at
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(activities, indent=0), encoding="utf-8")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Maximum detail requests; 0 means all missing qualifying runs.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Re-fetch cached efforts after cropping/deleting efforts on Strava.",
    )
    args = parser.parse_args()
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip().strip("\"'"))
    import stravalib

    required = [
        "STRAVA_CLIENT_ID",
        "STRAVA_CLIENT_SECRET",
        "STRAVA_CLIENT_REFRESH_TOKEN",
    ]
    if any(not os.getenv(key) for key in required):
        raise SystemExit("Strava credentials are required in the environment or .env.")
    client = stravalib.Client()
    token = client.refresh_access_token(
        client_id=os.environ[required[0]],
        client_secret=os.environ[required[1]],
        refresh_token=os.environ[required[2]],
    )
    client.access_token = token["access_token"]
    session = init_db(SQL_FILE)
    try:
        updated = sync_best_efforts(client, session, args.limit, args.refresh)
        update_json(session)
        print(f"Saved official best efforts for {updated} activities.")
    finally:
        session.close()


if __name__ == "__main__":
    main()
