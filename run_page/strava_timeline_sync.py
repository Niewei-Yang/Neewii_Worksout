"""Bounded, resumable Strava timeline backfill with per-activity static files."""

import argparse
import json
import os
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from strava_elevation_preview import categorized_climbs
from strava_pace_preview import (
    ROOT,
    OUTPUT as LEGACY_OUTPUT,
    activity_bins,
    access_token,
    sample_bins,
)

STORE = ROOT / "public" / "data" / "activity-timelines"
ACTIVITIES = ROOT / "src" / "static" / "activities.json"
SCHEMA = 1
CONTENT_SCHEMA = 3
RUNS = {"run", "running", "trailrun", "virtualrun"}
RIDES = {
    "ride",
    "virtualride",
    "mountainbikeride",
    "gravelride",
    "ebikeride",
    "emountainbikeride",
    "handcycle",
    "velomobile",
}


def now_utc():
    return datetime.now(timezone.utc)


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    temporary.replace(path)


def read_json(path, default):
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def sport_group(activity):
    kind = (
        str(activity.get("type", ""))
        .replace(" ", "")
        .replace("_", "")
        .replace("-", "")
        .lower()
    )
    if activity.get("source") != "strava":
        return None
    return "run" if kind in RUNS else "ride" if kind in RIDES else None


def needs_elevation(activity):
    return bool(sport_group(activity)) and (activity.get("elevation_gain") or 0) > 500


def core_checked(item, activity):
    return bool(item.get("timeline_checked_at")) and (
        not needs_elevation(activity)
        or bool(item.get("elevation_checked_at") and item.get("climbs_checked_at"))
    )


def fully_checked(item, activity):
    speed_checked = (
        sport_group(activity) != "ride"
        or item.get("metric") != "power"
        or bool(item.get("speed_checked_at"))
    )
    return (
        core_checked(item, activity)
        and bool(item.get("route_checked_at"))
        and speed_checked
    )


def route_points(streams, step=10):
    """Keep timestamped WGS84 coordinates and explicit gaps; sample by time."""
    times = streams.get("time", {}).get("data", [])
    latlng = streams.get("latlng", {}).get("data", [])
    if not times or not latlng:
        return []
    if len(times) != len(latlng):
        raise ValueError("GPS/time streams are not aligned")
    points = []
    previous_time = -1
    last_kept = None
    previous_valid = False
    from strava_pace_preview import finite_number

    for index, (stamp, coordinate) in enumerate(zip(times, latlng)):
        if not finite_number(stamp) or stamp < 0 or stamp <= previous_time:
            raise ValueError("Invalid GPS timestamps")
        valid = (
            isinstance(coordinate, (list, tuple))
            and len(coordinate) == 2
            and all(finite_number(n) for n in coordinate)
            and -90 <= coordinate[0] <= 90
            and -180 <= coordinate[1] <= 180
        )
        if index and stamp - previous_time > step and points[-1][0] != previous_time:
            prior = latlng[index - 1]
            points.append(
                [
                    previous_time,
                    round(prior[1], 5) if previous_valid else None,
                    round(prior[0], 5) if previous_valid else None,
                ]
            )
        if (
            last_kept is None
            or stamp - last_kept >= step
            or valid != previous_valid
            or index == len(times) - 1
            or (index and stamp - previous_time > 30)
        ):
            points.append(
                [
                    stamp,
                    round(coordinate[1], 5) if valid else None,
                    round(coordinate[0], 5) if valid else None,
                ]
            )
            last_kept = stamp
        previous_time, previous_valid = stamp, valid
    return points


class BudgetStop(RuntimeError):
    pass


class ApiError(RuntimeError):
    def __init__(self, status):
        self.status = status
        super().__init__(f"Strava HTTP {status}")


class TimelineClient:
    def __init__(self, token, max_requests=70, short_reserve=20, daily_reserve=100):
        self.token = token
        self.max_requests = max_requests
        self.short_reserve = short_reserve
        self.daily_reserve = daily_reserve
        self.requests = 0
        self.budgets = []

    def update_limits(self, headers):
        budgets = []
        for prefix in ("X-ReadRateLimit", "X-RateLimit"):
            limits, usage = headers.get(prefix + "-Limit"), headers.get(
                prefix + "-Usage"
            )
            if not limits or not usage:
                continue
            try:
                limit_short, limit_daily = map(int, limits.split(","))
                used_short, used_daily = map(int, usage.split(","))
            except (ValueError, TypeError):
                continue
            budgets.append((limit_short - used_short, limit_daily - used_daily))
        if budgets:
            # Some stream responses carry cached quota headers. Never allow a
            # response to replenish this batch's locally decremented budget.
            combined = budgets + self.budgets
            self.budgets = [(min(b[0] for b in combined), min(b[1] for b in combined))]

    def probe_quota(self):
        self.get("/athlete")

    def ensure_budget(self, requests=1):
        if self.requests + requests > self.max_requests:
            raise BudgetStop("per-run request budget reached")
        if any(
            short - requests < self.short_reserve
            or daily - requests < self.daily_reserve
            for short, daily in self.budgets
        ):
            raise BudgetStop("API reserve reached; resume in a later batch")

    def get(self, endpoint):
        self.ensure_budget()
        self.requests += 1
        self.budgets = [(short - 1, daily - 1) for short, daily in self.budgets]
        request = Request(
            "https://www.strava.com/api/v3" + endpoint,
            headers={
                "Authorization": "Bearer " + self.token,
                "Cache-Control": "no-cache",
            },
        )
        try:
            with urlopen(request, timeout=40) as response:
                self.update_limits(response.headers)
                return json.load(response)
        except HTTPError as error:
            self.update_limits(error.headers)
            if error.code == 429:
                raise BudgetStop(
                    "Strava rate limited this batch; saved progress"
                ) from None
            raise ApiError(error.code) from None
        except (URLError, TimeoutError):
            raise RuntimeError("Strava network request failed") from None


def record_summary(item, activity, stamp):
    ready = bool(item.get("bins") or item.get("elevation_bins"))
    return {
        "state": "ready" if ready else "unavailable",
        "complete": fully_checked(item, activity),
        "schema": CONTENT_SCHEMA,
        "updated_at": stamp,
        "elevation_status": (
            (
                "ready"
                if item.get("elevation_bins")
                else "unavailable" if item.get("elevation_checked_at") else "pending"
            )
            if needs_elevation(activity)
            else "not_required"
        ),
    }


def migrate_previews(activities, store, manifest, legacy=LEGACY_OUTPUT):
    lookup = {int(a["run_id"]): a for a in activities if sport_group(a)}
    migrated = 0
    for original in read_json(legacy, {"activities": []})["activities"]:
        activity_id = int(original["id"])
        activity = lookup.get(activity_id)
        path = store / f"{activity_id}.json"
        if not activity or path.exists():
            continue
        item = dict(original)
        stamp = item.get("fetched_at") or now_utc().isoformat()
        item.update(timeline_checked_at=stamp, timeline_schema=CONTENT_SCHEMA)
        item.setdefault("metric", "pace")
        item["sport_group"] = sport_group(activity)
        if "elevation_bins" in item:
            item["elevation_checked_at"] = item.get("elevation_fetched_at", stamp)
        if "climbs" in item:
            item["climbs_checked_at"] = item.get("elevation_fetched_at", stamp)
        atomic_json(path, item)
        manifest["activities"][str(activity_id)] = record_summary(item, activity, stamp)
        migrated += 1
    return migrated


def candidates_for(activities, manifest, store, now=None):
    now = now or now_utc()
    candidates = []
    for activity in activities:
        if not sport_group(activity):
            continue
        activity_id = int(activity["run_id"])
        status = manifest["activities"].get(str(activity_id), {})
        exists = (store / f"{activity_id}.json").exists()
        if status.get("complete") and status.get("schema") == CONTENT_SCHEMA and exists:
            continue
        retry = status.get("retry_after")
        if retry and datetime.fromisoformat(retry) > now:
            continue
        candidates.append(activity)
    return sorted(candidates, key=lambda a: a.get("start_date", ""), reverse=True)


def fetch_timeline(activity, client, cached=None):
    activity_id = int(activity["run_id"])
    if cached and core_checked(cached, activity):
        # Fetch only missing GPS / speed fields, preserving the existing strips.
        keys = ["time"]
        if not cached.get("route_checked_at"):
            keys.append("latlng")
        speed_missing = (
            sport_group(activity) == "ride"
            and cached.get("metric") == "power"
            and not cached.get("speed_checked_at")
        )
        if speed_missing:
            keys.extend(["velocity_smooth", "moving"])
        if len(keys) == 1:
            return {**cached, "timeline_schema": CONTENT_SCHEMA}
        client.ensure_budget()
        try:
            streams = client.get(
                f"/activities/{activity_id}/streams?keys={','.join(keys)}&key_by_type=true"
            )
        except ApiError as error:
            if error.status != 404:
                raise
            streams = {}
        item = dict(cached)
        item.setdefault("metric", "pace")
        stamp = now_utc().isoformat()
        item["timeline_schema"] = CONTENT_SCHEMA
        if "latlng" in keys:
            item.update(route_points=route_points(streams), route_checked_at=stamp)
        if speed_missing:
            item.update(
                speed_bins=activity_bins(streams, item["elapsed_time"])[1],
                speed_checked_at=stamp,
            )
        return item
    # Check the budget for the whole activity before starting the two requests.
    client.ensure_budget(2)
    detail = client.get(f"/activities/{activity_id}")
    group = sport_group(activity)
    elevation = needs_elevation(activity)
    stamp = now_utc().isoformat()
    item = {
        key: detail.get(key)
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
    item.update(sport_group=group, fetched_at=stamp, timeline_schema=CONTENT_SCHEMA)
    keys = ["time", "velocity_smooth", "moving", "latlng"]
    if group == "ride":
        keys.append("watts")
    if elevation:
        keys.append("altitude")
    try:
        streams = client.get(
            f"/activities/{activity_id}/streams?keys={','.join(keys)}&key_by_type=true"
        )
    except ApiError as error:
        if error.status != 404:
            raise
        streams = {}  # A detailed activity exists but has no streams (e.g. manual).
    item["metric"], item["bins"] = activity_bins(
        streams, detail["elapsed_time"], prefer_power=group == "ride"
    )
    item["timeline_checked_at"] = stamp
    if group == "ride" and item["metric"] == "power":
        item["speed_bins"] = activity_bins(streams, detail["elapsed_time"])[1]
        item["speed_checked_at"] = stamp
    item["route_points"] = route_points(streams)
    item["route_checked_at"] = stamp
    item["sample_count"] = len(streams.get("time", {}).get("data", []))
    if not item["bins"]:
        item["unavailable"] = "missing_streams"
    if elevation:
        item.update(
            elevation_gain=activity.get("elevation_gain"),
            elevation_bins=[],
            elevation_checked_at=stamp,
            climbs_checked_at=stamp,
            climbs=categorized_climbs(detail),
            climbs_source="strava_segments",
        )
        times = streams.get("time", {}).get("data", [])
        altitude = streams.get("altitude", {}).get("data", [])
        if times and altitude:
            bins = sample_bins(
                times, altitude, elapsed=detail["elapsed_time"], metric="elevation"
            )
            if any(b[2] is not None for b in bins):
                item["elevation_bins"] = bins
        item["elevation_fetched_at"] = stamp
    return item


def _backfill_timelines(
    activities=None,
    token=None,
    limit=20,
    max_requests=70,
    store=STORE,
    legacy=LEGACY_OUTPUT,
    client=None,
    delay=0.2,
    dry_run=False,
):
    if limit < 0 or max_requests < 0:
        raise ValueError("Batch and request limits must be non-negative")
    store = Path(store)
    activities = activities if activities is not None else read_json(ACTIVITIES, [])
    eligible = [a for a in activities if sport_group(a)]
    manifest_path = store / "index.json"
    manifest = read_json(manifest_path, {"version": SCHEMA, "activities": {}})
    migrated = 0 if dry_run else migrate_previews(activities, store, manifest, legacy)
    # Recover a completed file if execution stopped just before its index commit.
    if not dry_run:
        for activity in eligible:
            key = str(int(activity["run_id"]))
            status = manifest["activities"].get(key, {})
            if not status.get("complete") or status.get("schema") != CONTENT_SCHEMA:
                item = read_json(store / f"{key}.json", {})
                if fully_checked(item, activity):
                    if item.get("timeline_schema") != CONTENT_SCHEMA:
                        item["timeline_schema"] = CONTENT_SCHEMA
                        atomic_json(store / f"{key}.json", item)
                    manifest["activities"][key] = record_summary(
                        item, activity, item["timeline_checked_at"]
                    )
    queue = candidates_for(activities, manifest, store)
    completed_before = sum(
        bool(manifest["activities"].get(str(a["run_id"]), {}).get("complete"))
        and manifest["activities"].get(str(a["run_id"]), {}).get("schema")
        == CONTENT_SCHEMA
        and (store / f"{int(a['run_id'])}.json").exists()
        for a in eligible
    )
    summary = {
        "eligible": len(eligible),
        "eligible_elevation": sum(needs_elevation(a) for a in eligible),
        "migrated": migrated,
        "updated": 0,
        "unavailable": 0,
        "failed": 0,
        "pending": len(eligible) - completed_before,
        "due": len(queue),
        "requests": 0,
        "stopped": None,
    }
    if dry_run:
        print(json.dumps(summary), flush=True)
        return summary
    # Write migrated progress before making the first network request.
    manifest["generated_at"] = now_utc().isoformat()
    atomic_json(manifest_path, manifest)
    if not queue or limit == 0:
        print(json.dumps(summary), flush=True)
        return summary
    client = client or TimelineClient(
        token or access_token(), max_requests=max_requests
    )
    try:
        client.probe_quota()
    except BudgetStop as error:
        summary.update(stopped=str(error), requests=client.requests)
        manifest["last_batch"] = summary
        atomic_json(manifest_path, manifest)
        return summary
    for activity in queue[:limit]:
        activity_id = int(activity["run_id"])
        stamp = now_utc().isoformat()
        try:
            item = fetch_timeline(
                activity, client, read_json(store / f"{activity_id}.json", {})
            )
            atomic_json(store / f"{activity_id}.json", item)
            manifest["activities"][str(activity_id)] = record_summary(
                item, activity, stamp
            )
            summary["updated"] += 1
            if not item.get("bins") and not item.get("elevation_bins"):
                summary["unavailable"] += 1
            print(
                f"Timeline {activity_id}: {item.get('metric', 'pace')}, {len(item['bins'])} bins"
                f", altitude {len(item.get('elevation_bins', []))} bins",
                flush=True,
            )
        except BudgetStop as error:
            summary["stopped"] = str(error)
            break
        except (ApiError, RuntimeError, ValueError, KeyError) as error:
            old = manifest["activities"].get(str(activity_id), {})
            old.update(
                complete=False,
                schema=CONTENT_SCHEMA,
                retry_after=(
                    now_utc()
                    + timedelta(
                        days=(
                            7
                            if isinstance(error, ApiError) and error.status == 404
                            else 1
                        )
                    )
                ).isoformat(),
                error=str(error),
                updated_at=stamp,
            )
            old.setdefault("state", "retry")
            manifest["activities"][str(activity_id)] = old
            summary["failed"] += 1
            print(f"Timeline {activity_id}: deferred ({error})", flush=True)
            if isinstance(error, ApiError) and error.status in (401, 403):
                summary["stopped"] = "authorization unavailable; stopped batch"
                break
        finally:
            manifest["generated_at"] = now_utc().isoformat()
            atomic_json(manifest_path, manifest)
        if delay:
            time.sleep(delay)
    completed = sum(
        bool(manifest["activities"].get(str(a["run_id"]), {}).get("complete"))
        and manifest["activities"].get(str(a["run_id"]), {}).get("schema")
        == CONTENT_SCHEMA
        and (store / f"{int(a['run_id'])}.json").exists()
        for a in eligible
    )
    summary.update(pending=len(eligible) - completed, requests=client.requests)
    if client.budgets:
        summary["remaining_budget"] = {
            "short": min(b[0] for b in client.budgets),
            "daily": min(b[1] for b in client.budgets),
        }
    manifest["last_batch"] = summary
    atomic_json(manifest_path, manifest)
    print(json.dumps(summary), flush=True)
    return summary


@contextmanager
def batch_lock(store):
    store = Path(store)
    store.mkdir(parents=True, exist_ok=True)
    lock = store / ".sync.lock"
    try:
        handle = lock.open("x", encoding="utf-8")
    except FileExistsError:
        # Batches are bounded to at most 70 requests; stale crash locks expire.
        if time.time() - lock.stat().st_mtime <= 3600:
            raise RuntimeError("Another timeline batch is running") from None
        lock.unlink()
        handle = lock.open("x", encoding="utf-8")
    try:
        with handle:
            handle.write(str(os.getpid()))
        yield
    finally:
        lock.unlink(missing_ok=True)


def backfill_timelines(*args, **kwargs):
    if kwargs.get("dry_run"):
        return _backfill_timelines(*args, **kwargs)
    with batch_lock(kwargs.get("store", STORE)):
        return _backfill_timelines(*args, **kwargs)


def next_batch_delay(summary, manifest, now=None):
    now = now or now_utc()
    if summary.get("remaining_budget", {}).get("daily", 1000) < 102:
        return max(
            5,
            (
                (now + timedelta(days=1)).replace(
                    hour=0, minute=0, second=5, microsecond=0
                )
                - now
            ).total_seconds(),
        )
    if not summary.get("due") and summary.get("pending"):
        retries = [
            datetime.fromisoformat(s["retry_after"])
            for s in manifest["activities"].values()
            if s.get("retry_after") and not s.get("complete")
        ]
        if retries:
            return max(5, (min(retries) - now).total_seconds())
    return 905 - (now.timestamp() % 900)


def continue_backfill(limit=30, max_requests=70):
    """One local worker continues bounded batches until all eligible rows are checked."""
    state_path = ROOT / ".cache" / "activity-timeline-worker.json"
    state = {"pid": os.getpid(), "started_at": now_utc().isoformat()}
    while True:
        state.update(state="running", updated_at=now_utc().isoformat())
        state.pop("next_batch_at", None)
        atomic_json(state_path, state)
        try:
            summary = backfill_timelines(limit=limit, max_requests=max_requests)
        except Exception as error:
            state.update(
                state="error", error=str(error), updated_at=now_utc().isoformat()
            )
            atomic_json(state_path, state)
            raise
        state.update(last_batch=summary, updated_at=now_utc().isoformat())
        if summary["pending"] == 0 or (summary.get("stopped") or "").startswith(
            "authorization"
        ):
            state["state"] = (
                "complete" if summary["pending"] == 0 else "needs_authorization"
            )
            atomic_json(state_path, state)
            return
        manifest = read_json(STORE / "index.json", {"activities": {}})
        delay = next_batch_delay(summary, manifest)
        state.update(
            state="waiting",
            next_batch_at=(now_utc() + timedelta(seconds=delay)).isoformat(),
        )
        atomic_json(state_path, state)
        print(
            f"Next timeline batch at {state['next_batch_at']}; {summary['pending']} pending",
            flush=True,
        )
        time.sleep(delay)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--max-requests", type=int, default=70)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--continue",
        dest="continue_backfill",
        action="store_true",
        help="continue local batches at API window resets until complete",
    )
    args = parser.parse_args()
    if args.continue_backfill and not args.dry_run:
        if args.limit <= 0 or args.max_requests < 2:
            parser.error(
                "continuation requires a positive limit and at least two requests"
            )
        continue_backfill(limit=args.limit, max_requests=args.max_requests)
    else:
        backfill_timelines(
            limit=args.limit, max_requests=args.max_requests, dry_run=args.dry_run
        )


if __name__ == "__main__":
    main()
