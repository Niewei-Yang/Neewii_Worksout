import datetime
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "run_page"))

from generator.db import Activity, init_db  # noqa: E402
from strava_best_efforts import official_efforts, sync_best_efforts  # noqa: E402


class BestEffortTest(unittest.TestCase):
    def test_uses_elapsed_time_not_moving_time_and_accepts_slow_half_marathon(self):
        detail = {
            "best_efforts": [
                {
                    "name": "5K",
                    "distance": 5000,
                    "elapsed_time": 1500,
                    "moving_time": 1200,
                },
                {"name": "Half-Marathon", "distance": 21097, "elapsed_time": 11670},
                {"name": "5K", "distance": 4800, "elapsed_time": 1000},
            ]
        }
        self.assertEqual(
            [e["elapsed_time"] for e in official_efforts(detail)], [1500, 11670]
        )

    def test_supports_stravalib_timedeltas_and_missing_vs_empty_results(self):
        effort = SimpleNamespace(
            name="10K", distance=10000, elapsed_time=datetime.timedelta(minutes=45)
        )
        self.assertEqual(
            official_efforts(SimpleNamespace(best_efforts=[effort]))[0]["elapsed_time"],
            2700,
        )
        self.assertIsNone(official_efforts({}))
        self.assertEqual(official_efforts({"best_efforts": []}), [])

    def test_resume_only_fetches_uncached_qualifying_strava_runs(self):
        with tempfile.TemporaryDirectory() as directory:
            session = init_db(str(Path(directory) / "data.db"))
            try:
                session.add_all(
                    [
                        Activity(run_id=1, type="Run", source="strava", distance=7000),
                        Activity(
                            run_id=2,
                            type="Run",
                            source="strava",
                            distance=7000,
                            best_efforts=[],
                        ),
                        Activity(
                            run_id=3, type="Flight", source="strava", distance=7000
                        ),
                        Activity(run_id=4, type="Run", source="gpx", distance=7000),
                        Activity(run_id=5, type="Run", source="strava", distance=4994),
                    ]
                )
                session.commit()
                calls = []

                def detail(activity_id):
                    calls.append(activity_id)
                    return {
                        "best_efforts": [
                            {"name": "5K", "distance": 5000, "elapsed_time": 1200}
                        ]
                    }

                client = SimpleNamespace(get_activity=detail)
                self.assertEqual(sync_best_efforts(client, session, limit=0), 1)
                self.assertEqual(calls, [1])
                self.assertEqual(
                    session.get(Activity, 1).to_dict()["best_efforts"][0][
                        "elapsed_time"
                    ],
                    1200,
                )
                self.assertEqual(sync_best_efforts(client, session, limit=0), 0)
            finally:
                engine = session.get_bind()
                session.close()
                engine.dispose()

    def test_missing_api_fields_and_failures_do_not_erase_cached_records(self):
        with tempfile.TemporaryDirectory() as directory:
            session = init_db(str(Path(directory) / "data.db"))
            cached = [{"name": "5K", "distance": 5000, "elapsed_time": 1200}]
            try:
                session.add(
                    Activity(
                        run_id=1,
                        type="Run",
                        source="strava",
                        distance=7000,
                        best_efforts=cached,
                    )
                )
                session.commit()
                missing = SimpleNamespace(get_activity=lambda _id: {})
                self.assertEqual(sync_best_efforts(missing, session, refresh=True), 0)
                self.assertEqual(session.get(Activity, 1).best_efforts, cached)

                def fail(_id):
                    raise RuntimeError("request failed")

                self.assertEqual(
                    sync_best_efforts(
                        SimpleNamespace(get_activity=fail), session, refresh=True
                    ),
                    0,
                )
                self.assertEqual(session.get(Activity, 1).best_efforts, cached)
            finally:
                engine = session.get_bind()
                session.close()
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
