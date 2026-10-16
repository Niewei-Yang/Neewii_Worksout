import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "run_page"))
from strava_timeline_sync import (
    ApiError,
    BudgetStop,
    TimelineClient,
    atomic_json,
    backfill_timelines,
    candidates_for,
    fetch_timeline,
    needs_elevation,
    sport_group,
    route_points,
    next_batch_delay,
    batch_lock,
    normalize_streams,
    heartrate_bins,
    CONTENT_SCHEMA,
)
from datetime import datetime, timezone


def activity(activity_id, kind="Run", gain=0, source="strava"):
    return {
        "run_id": activity_id,
        "type": kind,
        "source": source,
        "start_date": f"2026-10-{activity_id:02d} 00:00:00",
        "elevation_gain": gain,
    }


class FakeClient(TimelineClient):
    def __init__(self, overrides=None, max_requests=70):
        super().__init__("test-token", max_requests=max_requests)
        self.overrides = overrides or {}
        self.endpoints = []

    def probe_quota(self):
        pass

    def get(self, endpoint):
        self.ensure_budget()
        self.requests += 1
        self.endpoints.append(endpoint)
        if "streams?" in endpoint:
            result = self.overrides.get(
                "streams",
                {
                    "time": {"data": [0, 10, 20]},
                    "velocity_smooth": {"data": [5, 5, 5]},
                    "watts": {"data": [0, 200, 100]},
                    "altitude": {"data": [-5, 0, 10]},
                },
            )
        else:
            activity_id = int(endpoint.rsplit("/", 1)[1])
            result = self.overrides.get(
                activity_id,
                {
                    "id": activity_id,
                    "name": "Test",
                    "start_date": "2026-10-01T00:00:00Z",
                    "start_date_local": "2026-10-01T08:00:00Z",
                    "distance": 100,
                    "elapsed_time": 20,
                    "moving_time": 20,
                    "device_watts": True,
                    "segment_efforts": [],
                },
            )
        if isinstance(result, Exception):
            raise result
        return result


class TimelineSyncTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.store = self.root / "timelines"
        self.legacy = self.root / "preview.json"

    def tearDown(self):
        self.directory.cleanup()

    def run_batch(self, activities, client, **kwargs):
        return backfill_timelines(
            activities,
            client=client,
            store=self.store,
            legacy=self.legacy,
            delay=0,
            **kwargs,
        )

    def test_resume_is_bounded_and_newest_first_and_fetches_new_activities(self):
        activities = [activity(1), activity(2)]
        first = FakeClient()
        self.assertEqual(self.run_batch(activities, first, limit=1)["updated"], 1)
        self.assertIn("/activities/2", first.endpoints)
        second = FakeClient()
        self.run_batch(activities, second, limit=1)
        self.assertNotIn("/activities/2", second.endpoints)
        empty = FakeClient()
        self.assertEqual(self.run_batch(activities, empty)["pending"], 0)
        self.assertEqual(empty.requests, 0)
        fresh = FakeClient()
        self.run_batch(activities + [activity(3)], fresh)
        self.assertIn("/activities/3", fresh.endpoints)
        self.assertNotIn("/activities/2", fresh.endpoints)

    def test_strava_runs_rides_hikes_and_strict_elevation_threshold(self):
        self.assertIsNone(sport_group(activity(1, source="gpx")))
        self.assertEqual(sport_group(activity(1, "Hike", gain=999)), "hike")
        self.assertIsNone(sport_group(activity(1, "Workout", gain=999)))
        self.assertEqual(sport_group(activity(1, "Trail Run")), "run")
        self.assertFalse(needs_elevation(activity(1, gain=200)))
        self.assertTrue(needs_elevation(activity(1, gain=200.1)))
        client = FakeClient()
        result = fetch_timeline(activity(1, "Ride", 201), client)
        self.assertEqual(result["metric"], "power")
        self.assertEqual(result["bins"][0][2], 0)
        self.assertEqual(result["speed_bins"][0][2], 200)
        self.assertTrue(result["speed_checked_at"])
        self.assertTrue(result["elevation_checked_at"])
        self.assertEqual(result["elevation_bins"][0][2], -5)
        self.assertIn("altitude", client.endpoints[-1])
        low = FakeClient()
        fetch_timeline(activity(1, "Ride", 200), low)
        self.assertNotIn("altitude", low.endpoints[-1])

    def test_hiking_elevation_only_and_low_gain_hikes_skip_requests(self):
        client = FakeClient()
        summary = self.run_batch(
            [activity(1, "Hike", 201), activity(2, "Hike", 200)], client
        )
        self.assertEqual(summary["eligible"], 1)
        item = json.loads((self.store / "1.json").read_text())
        self.assertEqual(item["sport_group"], "hike")
        self.assertEqual(item["bins"], [])
        self.assertTrue(item["elevation_bins"])
        self.assertNotIn("unavailable", item)
        self.assertNotIn("velocity_smooth", client.endpoints[-1])
        self.assertNotIn("heartrate", client.endpoints[-1])
        self.assertEqual(summary["unavailable"], 0)

    def test_old_threshold_file_gets_elevation_after_schema_upgrade(self):
        row = activity(1, "Ride", 300)
        cached = fetch_timeline(row, FakeClient())
        for key in list(cached):
            if key.startswith("elevation_") or key.startswith("climbs"):
                cached.pop(key)
        cached["timeline_schema"] = CONTENT_SCHEMA - 1
        atomic_json(self.store / "1.json", cached)
        atomic_json(
            self.store / "index.json",
            {
                "version": 1,
                "activities": {
                    "1": {
                        "complete": True,
                        "schema": CONTENT_SCHEMA - 1,
                        "state": "ready",
                    }
                },
            },
        )
        self.run_batch([row], FakeClient())
        upgraded = json.loads((self.store / "1.json").read_text())
        self.assertTrue(upgraded["elevation_bins"])

    def test_heart_rate_weighted_average_preserves_missing_spans_and_rest(self):
        streams = {
            "time": {"data": [0, 2, 10, 20, 30, 40, 50, 90]},
            "heartrate": {"data": [100, 150, 0, None, -2, 160, 170, 180]},
            "moving": {"data": [False] * 8},
        }
        bins = heartrate_bins(streams, 100)
        self.assertEqual(bins[0], [0, 10, 140, "running"])
        self.assertEqual([b[2] for b in bins[1:4]], [None, None, None])
        self.assertEqual(bins[4], [40, 50, 160, "running"])
        self.assertTrue(all(b[2] is None for b in bins[5:]))
        with self.assertRaises(ValueError):
            heartrate_bins(
                {"time": {"data": [0, 10]}, "heartrate": {"data": [150]}}, 10
            )

    def test_heart_rate_upgrade_preserves_existing_data_and_deduplicates(self):
        row = activity(1, gain=600)
        cached = fetch_timeline(row, FakeClient())
        cached.pop("heartrate_checked_at")
        cached.pop("heartrate_bins")
        client = FakeClient(
            {
                "streams": {
                    "time": {"data": [0, 0, 10, 20]},
                    "heartrate": {"data": [999, 140, 160, 170]},
                }
            }
        )
        upgraded = fetch_timeline(row, client, cached)
        self.assertEqual(client.requests, 1)
        self.assertIn("keys=time,heartrate&", client.endpoints[0])
        self.assertEqual([b[2] for b in upgraded["heartrate_bins"]], [140, 160])
        for key in ("bins", "elevation_bins", "climbs", "route_points"):
            self.assertEqual(cached[key], upgraded[key])
        self.assertNotIn("heartrate_checked_at", cached)

    def test_heart_rate_missing_or_invalid_is_cached_and_heart_rate_only_is_ready(self):
        for values in ([], [0, -1, None], [False, float("nan"), float("inf")]):
            streams = {"time": {"data": [0, 10, 20]}, "heartrate": {"data": values}}
            item = fetch_timeline(activity(1), FakeClient({"streams": streams}))
            self.assertEqual(item["heartrate_bins"], [])
            later = FakeClient()
            fetch_timeline(activity(1), later, item)
            self.assertEqual(later.requests, 0)
        client = FakeClient(
            {
                "streams": {
                    "time": {"data": [0, 10, 20]},
                    "heartrate": {"data": [140, 160, 150]},
                }
            }
        )
        summary = self.run_batch([activity(1)], client)
        manifest = json.loads((self.store / "index.json").read_text())
        self.assertEqual(manifest["activities"]["1"]["state"], "ready")
        self.assertEqual(summary["unavailable"], 0)
        self.assertNotIn("unavailable", json.loads((self.store / "1.json").read_text()))

    def test_duplicate_seconds_keep_all_metrics_and_gps_aligned(self):
        streams = {
            "time": {"data": [0, 0, 10, 10, 20]},
            "watts": {"data": [999, 100, 999, 0, 50]},
            "velocity_smooth": {"data": [99, 5, 99, 10, 5]},
            "moving": {"data": [False, True, False, True, True]},
            "altitude": {"data": [999, -5, 999, 10, 20]},
            "latlng": {"data": [[0, 0], [40, 116], [0, 0], [41, 117], [42, 118]]},
        }
        item = fetch_timeline(
            activity(1, "Ride", 501), FakeClient({"streams": streams})
        )
        self.assertEqual(
            item["bins"], [[0, 10, 100, "running"], [10, 20, 0, "running"]]
        )
        self.assertEqual([b[2] for b in item["speed_bins"]], [200, 100])
        self.assertEqual([b[2] for b in item["elevation_bins"]], [-5, 10])
        self.assertEqual(
            item["route_points"], [[0, 116, 40], [10, 117, 41], [20, 118, 42]]
        )
        self.assertEqual(streams["time"]["data"], [0, 0, 10, 10, 20])
        cached = dict(item)
        cached.pop("route_checked_at")
        cached.pop("speed_checked_at")
        upgraded = fetch_timeline(
            activity(1, "Ride", 501), FakeClient({"streams": streams}), cached
        )
        self.assertEqual(upgraded["route_points"], item["route_points"])
        self.assertEqual(upgraded["speed_bins"], item["speed_bins"])

    def test_duplicate_cleanup_rejects_misaligned_or_reversed_streams(self):
        for streams in [
            {"time": {"data": [0, 0, 10]}, "watts": {"data": [1, 2]}},
            {"time": {"data": [0, 10, 5]}},
            {"time": {"data": [0, float("nan"), 10]}},
        ]:
            with self.assertRaises(ValueError):
                normalize_streams(streams)

    def test_confirmed_missing_streams_are_cached_and_not_retried(self):
        client = FakeClient({"streams": ApiError(404)})
        summary = self.run_batch([activity(1, "Ride", 501)], client)
        self.assertEqual(summary["unavailable"], 1)
        self.assertEqual(summary["pending"], 0)
        later = FakeClient()
        self.run_batch([activity(1, "Ride", 501)], later)
        self.assertEqual(later.requests, 0)

    def test_rate_budget_stops_without_marking_activity_complete(self):
        client = FakeClient(max_requests=1)
        summary = self.run_batch([activity(1)], client)
        self.assertIsNotNone(summary["stopped"])
        self.assertEqual(client.requests, 0)
        self.assertEqual(summary["pending"], 1)
        self.assertFalse((self.store / "1.json").exists())
        quota = TimelineClient("test")
        quota.update_limits(
            {"X-ReadRateLimit-Limit": "100,1000", "X-ReadRateLimit-Usage": "79,899"}
        )
        quota.update_limits(
            {"X-ReadRateLimit-Limit": "100,1000", "X-ReadRateLimit-Usage": "1,1"}
        )
        self.assertEqual(quota.budgets, [(21, 101)])
        with self.assertRaises(BudgetStop):
            quota.ensure_budget(2)
        quota.update_limits(
            {"X-RateLimit-Limit": "200,2000", "X-RateLimit-Usage": "1,1950"}
        )
        with self.assertRaises(BudgetStop):
            quota.ensure_budget()

    def test_errors_defer_activity_and_preserve_successful_progress(self):
        client = FakeClient({2: ApiError(500)})
        summary = self.run_batch([activity(1), activity(2)], client)
        self.assertEqual((summary["updated"], summary["failed"]), (1, 1))
        manifest = json.loads((self.store / "index.json").read_text())
        self.assertTrue(manifest["activities"]["1"]["complete"])
        self.assertFalse(manifest["activities"]["2"]["complete"])
        self.assertEqual(
            candidates_for([activity(1), activity(2)], manifest, self.store), []
        )

    def test_migrated_high_gain_preview_is_upgraded_without_losing_other_files(self):
        item = {
            "id": 1,
            "name": "Old",
            "elapsed_time": 20,
            "bins": [[0, 20, 300, "running"]],
        }
        atomic_json(self.legacy, {"activities": [item]})
        result = self.run_batch([activity(1, "Ride", 600)], FakeClient(), limit=0)
        self.assertEqual((result["migrated"], result["pending"]), (1, 1))
        self.run_batch([activity(1, "Ride", 600)], FakeClient())
        stored = json.loads((self.store / "1.json").read_text())
        self.assertTrue(stored["elevation_bins"])
        self.assertEqual(stored["climbs_source"], "strava_segments")

    def test_completed_file_recovers_after_interruption_before_index_write(self):
        item = fetch_timeline(activity(1), FakeClient())
        atomic_json(self.store / "1.json", item)
        client = FakeClient()
        result = self.run_batch([activity(1)], client)
        self.assertEqual(result["pending"], 0)
        self.assertEqual(client.requests, 0)

    def test_dry_run_does_not_write_or_make_requests(self):
        client = FakeClient()
        result = self.run_batch([activity(1)], client, dry_run=True)
        self.assertEqual(result["pending"], 1)
        self.assertFalse(self.store.exists())
        self.assertEqual(client.requests, 0)

    def test_timestamped_gps_keeps_gaps_endpoints_and_order(self):
        points = route_points(
            {
                "time": {"data": [0, 5, 10, 12, 50, 60]},
                "latlng": {
                    "data": [
                        [40, 116],
                        [40.001, 116],
                        [40.002, 116],
                        [40.003, 116],
                        [40.004, 116],
                        None,
                    ]
                },
            }
        )
        self.assertEqual(points[0], [0, 116, 40])
        self.assertIn([12, 116, 40.003], points)
        self.assertEqual(points[-1], [60, None, None])
        self.assertTrue(all(a[0] < b[0] for a, b in zip(points, points[1:])))

    def test_route_upgrade_does_not_download_detail_or_overwrite_power_altitude(self):
        cached = fetch_timeline(activity(1, "Ride", 600), FakeClient())
        cached.pop("route_checked_at")
        client = FakeClient()
        upgraded = fetch_timeline(activity(1, "Ride", 600), client, cached)
        self.assertEqual(client.requests, 1)
        self.assertIn("keys=time,latlng", client.endpoints[0])
        self.assertEqual(cached["bins"], upgraded["bins"])
        self.assertEqual(cached["elevation_bins"], upgraded["elevation_bins"])

    def test_power_speed_upgrade_preserves_existing_strips_and_gps(self):
        cached = fetch_timeline(activity(1, "Ride", 600), FakeClient())
        cached.pop("speed_checked_at")
        cached.pop("speed_bins")
        cached["route_points"] = [[0, 116, 40]]
        client = FakeClient()
        upgraded = fetch_timeline(activity(1, "Ride", 600), client, cached)
        self.assertEqual(client.requests, 1)
        self.assertIn("velocity_smooth", client.endpoints[0])
        self.assertNotIn("latlng", client.endpoints[0])
        self.assertEqual(upgraded["route_points"], cached["route_points"])
        self.assertEqual(upgraded["bins"], cached["bins"])
        self.assertEqual(upgraded["elevation_bins"], cached["elevation_bins"])
        self.assertEqual(upgraded["speed_bins"][0][2], 200)

    def test_missing_velocity_does_not_discard_valid_power(self):
        client = FakeClient(
            {"streams": {"time": {"data": [0, 10]}, "watts": {"data": [200, 200]}}}
        )
        item = fetch_timeline(activity(1, "Ride"), client)
        self.assertEqual(item["metric"], "power")
        self.assertEqual(item["bins"][0][2], 200)
        self.assertEqual(item["speed_bins"], [])
        self.assertTrue(item["speed_checked_at"])

    def test_batches_do_not_overlap_and_daily_limits_wait_until_utc_reset(self):
        with batch_lock(self.store):
            with self.assertRaises(RuntimeError):
                with batch_lock(self.store):
                    pass
        self.assertFalse((self.store / ".sync.lock").exists())
        now = datetime(2026, 10, 15, 12, 5, tzinfo=timezone.utc)
        self.assertEqual(
            next_batch_delay({"pending": 5, "due": 5}, {"activities": {}}, now), 605
        )
        self.assertEqual(
            next_batch_delay(
                {"pending": 5, "remaining_budget": {"daily": 101}},
                {"activities": {}},
                now,
            ),
            42905,
        )


if __name__ == "__main__":
    unittest.main()
