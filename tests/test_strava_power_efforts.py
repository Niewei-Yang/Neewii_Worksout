import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "run_page"))

from generator.db import Activity, init_db
from strava_best_efforts import update_json
from strava_power_efforts import (
    POWER_DURATIONS,
    calculate_power_efforts,
    sync_power_efforts,
)


class PowerEffortsTest(unittest.TestCase):
    def test_all_six_intervals_and_zero_power_are_time_weighted(self):
        records = calculate_power_efforts(list(range(3601)), [200] * 3601)
        self.assertEqual([r["duration"] for r in records], list(POWER_DURATIONS))
        self.assertTrue(all(r["watts"] == 200 for r in records))
        # Five seconds at 200 W, then five at zero: a ten-second average of 100 W.
        record = calculate_power_efforts([0, 5, 10], [200, 0, 999], (10,))[0]
        self.assertEqual(record["watts"], 100)

    def test_irregular_samples_include_windows_ending_at_sample_boundaries(self):
        record = calculate_power_efforts([0, 2, 5, 9], [100, 500, 0, 0], (4,))[0]
        self.assertEqual(
            record, {"duration": 4, "watts": 400, "start_time": 1, "end_time": 5}
        )

    def test_missing_data_pauses_and_short_rides_do_not_create_records(self):
        self.assertEqual(calculate_power_efforts([0, 1, 100, 101], [1000] * 4), [])
        self.assertEqual(
            calculate_power_efforts(
                list(range(8)), [500, 500, None, 500, 500, 500, 500, 500]
            ),
            [],
        )
        self.assertEqual(
            calculate_power_efforts([0, 1, 2], [float("nan"), -1, 999]), []
        )
        with self.assertRaises(ValueError):
            calculate_power_efforts([0, 1], [200])
        with self.assertRaises(ValueError):
            calculate_power_efforts([0, 0], [200, 200])

    def test_six_windows_match_an_independent_second_by_second_scan(self):
        import random

        rng = random.Random(47)
        times = [0]
        while times[-1] < 3700:
            times.append(times[-1] + rng.randint(1, 5))
        watts = [rng.randrange(0, 700) for _ in times]
        expanded = []
        for i in range(len(times) - 1):
            expanded.extend([watts[i]] * (times[i + 1] - times[i]))
        prefix = [0]
        for power in expanded:
            prefix.append(prefix[-1] + power)
        for record in calculate_power_efforts(times, watts):
            d = record["duration"]
            expected = (
                max(prefix[i + d] - prefix[i] for i in range(len(expanded) - d + 1)) / d
            )
            self.assertAlmostEqual(record["watts"], expected)

    def test_sync_caches_measured_power_skips_estimates_and_preserves_results_on_failure(
        self,
    ):
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "data.db"
            # Exercise migration of a database created before the new columns.
            with sqlite3.connect(db_path) as old:
                old.execute("create table activities (run_id INTEGER PRIMARY KEY)")
            old.close()
            session = init_db(str(db_path))
            try:
                session.add_all(
                    [
                        Activity(
                            run_id=1, type="Ride", source="strava", device_watts=True
                        ),
                        Activity(
                            run_id=2, type="Ride", source="strava", device_watts=False
                        ),
                        Activity(run_id=3, type="Run", source="strava"),
                    ]
                )
                session.commit()
                calls = []

                def streams(activity_id, **kwargs):
                    calls.append(activity_id)
                    return {
                        "time": {"data": list(range(61))},
                        "watts": {"data": [250] * 61},
                    }

                client = SimpleNamespace(get_activity_streams=streams)
                self.assertEqual(sync_power_efforts(client, session, limit=0), 2)
                self.assertEqual(calls, [1])
                self.assertEqual(session.get(Activity, 2).power_efforts, [])
                cached = session.get(Activity, 1).power_efforts
                self.assertEqual([e["watts"] for e in cached], [250, 250])
                self.assertEqual(sync_power_efforts(client, session, limit=0), 0)

                session.add(Activity(run_id=4, type="Ride", source="strava"))
                session.commit()
                client.get_activity = lambda _: {"id": 4}
                self.assertEqual(sync_power_efforts(client, session, limit=0), 1)
                self.assertEqual(session.get(Activity, 4).power_efforts, [])

                json_path = Path(directory) / "activities.json"
                json_path.write_text(
                    json.dumps([{"run_id": 1, "name": "keep"}]), encoding="utf-8"
                )
                update_json(session, json_path)
                exported = json.loads(json_path.read_text())
                self.assertEqual(exported[0]["power_efforts"], cached)
                self.assertEqual(exported[0]["name"], "keep")

                client.get_activity = lambda _: {"device_watts": True}
                client.get_activity_streams = lambda *args, **kwargs: None
                self.assertEqual(
                    sync_power_efforts(client, session, limit=0, refresh=True), 0
                )
                self.assertEqual(session.get(Activity, 1).power_efforts, cached)

                def fail(*args, **kwargs):
                    raise RuntimeError("unavailable")

                client.get_activity_streams = fail
                self.assertEqual(
                    sync_power_efforts(client, session, limit=0, refresh=True), 0
                )
                self.assertEqual(session.get(Activity, 1).power_efforts, cached)
            finally:
                engine = session.get_bind()
                session.close()
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
