"""Sync the local activities DB with Strava, then flag strava-source
activities in the last N days that no longer exist on Strava.

Usage:
    python run_page/sync_and_check_strava.py [--days 31] [--skip-sync]
"""

import argparse
import datetime
import json
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from config import JSON_FILE, SQL_FILE  # noqa: E402
from generator import Generator  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
ENV_PATH = os.path.join(ROOT, ".env")


def load_env(env_path):
    env = {}
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


def update_env_refresh_token(env_path, new_token):
    """Strava rotates refresh tokens; keep .env usable for next runs."""
    with open(env_path, encoding="utf-8", newline="") as f:
        lines = f.readlines()
    pattern = re.compile(r"^(\s*STRAVA_CLIENT_REFRESH_TOKEN\s*=\s*).*$")
    changed = False
    for i, line in enumerate(lines):
        m = pattern.match(line)
        if m:
            new_line = m.group(1) + new_token + "\n"
            if new_line != line:
                lines[i] = new_line
                changed = True
    if changed:
        with open(env_path, "w", encoding="utf-8", newline="") as f:
            f.writelines(lines)
        print(f"[env] refreshed STRAVA_CLIENT_REFRESH_TOKEN in {os.path.basename(env_path)}")
    else:
        print("[env] refresh token unchanged")


def fmt_km(distance_m):
    if distance_m is None:
        return "-"
    return f"{distance_m / 1000:.2f}"


def fmt_time(moving_time):
    """sqlite stores Interval as '1970-01-01 HH:MM:SS.ffffff' -> HH:MM:SS."""
    if not moving_time:
        return "-"
    s = str(moving_time)
    return s.split(" ", 1)[-1].split(".")[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--days",
        type=int,
        default=31,
        help="how many days back to check (default 31 = last month)",
    )
    parser.add_argument(
        "--fetch-margin",
        type=int,
        default=10,
        help="extra days fetched from Strava beyond --days to cover timezone edges",
    )
    parser.add_argument(
        "--skip-sync",
        action="store_true",
        help="skip the DB update step and only run the comparison",
    )
    args = parser.parse_args()

    env = load_env(ENV_PATH)
    for key in ("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_CLIENT_REFRESH_TOKEN"):
        if key not in env:
            sys.exit(f"Missing {key} in .env")
    client_id = env["STRAVA_CLIENT_ID"]
    client_secret = env["STRAVA_CLIENT_SECRET"]
    refresh_token = env["STRAVA_CLIENT_REFRESH_TOKEN"]

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    now_local = datetime.datetime.now()

    # window used both for the sync fetch and the comparison fetch
    fetch_after = now_utc - datetime.timedelta(days=args.days + args.fetch_margin)
    cutoff_local = (now_local - datetime.timedelta(days=args.days)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    gen = Generator(SQL_FILE)
    gen.set_strava_config(client_id, client_secret, refresh_token)
    gen.check_access()
    print("Access ok")

    if gen.refresh_token != refresh_token:
        update_env_refresh_token(ENV_PATH, gen.refresh_token)

    if not args.skip_sync:
        gen.only_run = False
        # sync the whole month window (not just the default ~7 days)
        gen.sync(force=False, after=fetch_after)
        activities_list = gen.loadForMapping()
        with open(JSON_FILE, "w", encoding="utf-8") as f:
            json.dump(activities_list, f, indent=0)
        print(f"[sync] wrote {JSON_FILE}")

    # ---- comparison ----
    strava_ids = set()
    for act in gen.client.get_activities(after=fetch_after):
        strava_ids.add(int(act.id))
    print(
        f"[strava] {len(strava_ids)} current Strava activities since "
        f"{fetch_after.strftime('%Y-%m-%d')}"
    )

    conn = sqlite3.connect(SQL_FILE)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT run_id, name, type, start_date, start_date_local, distance,
               moving_time, elevation_gain, source
        FROM activities
        WHERE source = 'strava' AND start_date_local >= ?
        ORDER BY start_date_local
        """,
        (cutoff_local,),
    ).fetchall()
    conn.close()
    print(
        f"[db] {len(rows)} strava-source activities in DB since "
        f"{cutoff_local[:10]}"
    )

    missing = [r for r in rows if int(r["run_id"]) not in strava_ids]
    missing.sort(key=lambda r: r["start_date"], reverse=True)

    # ---- verify each flagged id directly against the Strava API ----
    verified = []
    for r in missing:
        try:
            gen.client.get_activity(int(r["run_id"]))
            verified.append((r, "exists-on-strava (list fetch missed it)"))
        except Exception as e:
            verified.append((r, f"not-found ({type(e).__name__})"))
    for r, note in verified:
        print(f"[verify] run_id={r['run_id']} {r['name']}: {note}")

    report_path = os.path.join(ROOT, "strava_missing_report.md")
    lines = []
    lines.append("# Strava 缺失活动检查报告")
    lines.append("")
    lines.append(
        f"- 生成时间: {now_local.strftime('%Y-%m-%d %H:%M:%S')} (本地时间)"
    )
    lines.append(f"- 检查窗口: 最近 {args.days} 天 (本地时间 {cutoff_local[:10]} 至今)")
    lines.append(
        f"- Strava 侧拉取: {fetch_after.strftime('%Y-%m-%d')} 至今, "
        f"共 {len(strava_ids)} 条活动"
    )
    lines.append(
        f"- 数据库侧: source='strava' 且在本窗口内的活动共 {len(rows)} 条"
    )
    lines.append(
        f"- **标记为缺失(Strava 上已不存在): {len(missing)} 条**"
    )
    lines.append("")
    lines.append(
        "> 说明: 以下活动在数据库中标记为 `strava` 来源, 但 Strava 当前列表"
        "中不存在(可能已在 Strava 上被删除)。仅供核对, 未做任何删除。"
    )
    lines.append("")

    if missing:
        lines.append("| run_id | 名称 | 类型 | 开始时间(本地) | 距离(km) | 用时 | 爬升(m) |")
        lines.append("| --- | --- | --- | --- | --- | --- | --- |")
        for r in missing:
            lines.append(
                "| {} | {} | {} | {} | {} | {} | {} |".format(
                    r["run_id"],
                    (r["name"] or "").replace("|", "\\|"),
                    r["type"],
                    r["start_date_local"],
                    fmt_km(r["distance"]),
                    fmt_time(r["moving_time"]),
                    f"{r['elevation_gain']:.0f}" if r["elevation_gain"] else "-",
                )
            )
    else:
        lines.append("未发现缺失活动。")
    lines.append("")

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[report] wrote {report_path}")

    print("\n===== 缺失活动汇总 (Strava 上不存在, 但 DB 标记为 strava 来源) =====")
    if not missing:
        print("无。最近 {} 天内数据库中的 strava 来源活动都还在 Strava 上。".format(args.days))
    for r in missing:
        print(
            "  - run_id={} | {} | {} | {} | {} km | {}".format(
                r["run_id"],
                r["name"],
                r["type"],
                r["start_date_local"],
                fmt_km(r["distance"]),
                fmt_time(r["moving_time"]),
            )
        )
    print("================================================================")

    # ---- reverse direction context: Strava activities not recorded as strava ----
    conn = sqlite3.connect(SQL_FILE)
    conn.row_factory = sqlite3.Row
    db_all = {
        int(row["run_id"]): row
        for row in conn.execute(
            "SELECT run_id, source, start_date_local FROM activities"
        ).fetchall()
    }
    conn.close()
    strava_only = []
    strava_other_source = []
    for sid in sorted(strava_ids):
        row = db_all.get(sid)
        if row is None:
            strava_only.append(sid)
        elif row["source"] != "strava":
            strava_other_source.append((sid, row["source"]))
    print(
        f"\n[reverse] Strava 上有 {len(strava_only)} 条活动在 DB 中完全不存在, "
        f"{len(strava_other_source)} 条在 DB 中但来源不是 strava"
    )


if __name__ == "__main__":
    main()
