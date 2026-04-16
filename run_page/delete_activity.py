import argparse
import json
import sqlite3
from datetime import datetime
from pathlib import Path

from config import JSON_FILE, SQL_FILE
from generator import Generator


def normalize_date(date_text):
    date_text = date_text.strip()
    for fmt in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(date_text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    raise ValueError("date must be YYYYMMDD or YYYY-MM-DD")


def find_matches(conn, name, date_text, exact):
    date_prefix = normalize_date(date_text)
    if exact:
        sql = """
            SELECT run_id, name, type, start_date_local, distance, source
            FROM activities
            WHERE name = ?
              AND substr(start_date_local, 1, 10) = ?
            ORDER BY start_date_local
        """
        params = (name, date_prefix)
    else:
        sql = """
            SELECT run_id, name, type, start_date_local, distance, source
            FROM activities
            WHERE name LIKE ?
              AND substr(start_date_local, 1, 10) = ?
            ORDER BY start_date_local
        """
        params = (f"%{name}%", date_prefix)
    return conn.execute(sql, params).fetchall()


def rebuild_activities_json(db_path=SQL_FILE, json_path=JSON_FILE):
    generator = Generator(db_path)
    activities_list = generator.loadForMapping()
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(activities_list, f, indent=0)


def delete_activity(args):
    conn = sqlite3.connect(args.db)
    matches = find_matches(conn, args.name, args.date, args.exact)

    if not matches:
        print("No activity matched.")
        conn.close()
        return 1

    print("Matched activities:")
    for row in matches:
        run_id, name, activity_type, start_date_local, distance, source = row
        print(
            f"- run_id={run_id}, name={name}, type={activity_type}, "
            f"date={start_date_local}, distance={distance}, source={source}"
        )

    if len(matches) > 1 and not args.delete_all:
        print(
            "Multiple activities matched. Re-run with --delete-all, or use "
            "--exact / a more specific name."
        )
        conn.close()
        return 2

    if args.dry_run:
        print("Dry run only. Nothing deleted.")
        conn.close()
        return 0

    run_ids = [row[0] for row in matches]
    conn.executemany("DELETE FROM activities WHERE run_id = ?", [(i,) for i in run_ids])
    conn.commit()
    conn.close()

    rebuild_activities_json(args.db, args.json)
    print(f"Deleted {len(run_ids)} activity record(s).")
    print(f"Rebuilt {args.json}")
    return 0


def parse_args():
    parser = argparse.ArgumentParser(
        description="Delete activities by name and date, then rebuild activities.json."
    )
    parser.add_argument("name", help="Activity name, or partial name unless --exact")
    parser.add_argument("date", help="Activity date: YYYYMMDD or YYYY-MM-DD")
    parser.add_argument("--db", default=SQL_FILE, help="SQLite database path")
    parser.add_argument("--json", default=JSON_FILE, help="activities.json path")
    parser.add_argument(
        "--exact",
        action="store_true",
        help="Require exact activity name instead of partial match",
    )
    parser.add_argument(
        "--delete-all",
        action="store_true",
        help="Delete all matched activities when more than one record matches",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print matched activities without deleting anything",
    )
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(delete_activity(parse_args()))
