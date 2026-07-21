import datetime
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import polyline

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "run_page"))

from generator import Generator  # noqa: E402
from generator.db import Activity  # noqa: E402


def line_polyline(point_count, spacing_m):
    degrees_per_meter = 1 / 111320
    return polyline.encode(
        [(0.0, index * spacing_m * degrees_per_meter) for index in range(point_count)]
    )


def incoming_activity(summary_polyline):
    return SimpleNamespace(
        id=123,
        name="Long track run",
        sport_type="Run",
        type="Run",
        distance=15000.0,
        moving_time=datetime.timedelta(hours=1),
        elapsed_time=datetime.timedelta(hours=1),
        start_date="2026-07-20 11:00:00+00:00",
        start_date_local="2026-07-20 19:00:00",
        start_latlng=None,
        map=SimpleNamespace(summary_polyline=summary_polyline),
        average_heartrate=150.0,
        average_speed=3.5,
        total_elevation_gain=10.0,
    )


class StravaSyncRouteTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.generator = Generator(str(Path(self.temp_dir.name) / "activities.db"))
        self.generator.check_access = lambda: None

    def tearDown(self):
        engine = self.generator.session.get_bind()
        self.generator.session.close()
        engine.dispose()
        self.temp_dir.cleanup()

    def add_existing_activity(self, summary_polyline):
        self.generator.session.add(
            Activity(
                run_id=123,
                name="Long track run",
                distance=15000.0,
                moving_time=datetime.timedelta(hours=1),
                elapsed_time=datetime.timedelta(hours=1),
                type="Run",
                start_date="2026-07-20 11:00:00+00:00",
                start_date_local="2026-07-20 19:00:00",
                summary_polyline=summary_polyline,
                average_heartrate=150.0,
                average_speed=3.5,
                elevation_gain=10.0,
                source="strava",
            )
        )
        self.generator.session.commit()

    def stored_polyline(self):
        return self.generator.session.get(Activity, 123).summary_polyline

    def test_reuses_existing_detailed_route_without_an_api_call(self):
        detailed = line_polyline(1250, 12.0)
        incoming = line_polyline(282, 50.0)
        self.add_existing_activity(detailed)
        self.generator.client = SimpleNamespace(
            get_activities=lambda **_kwargs: [incoming_activity(incoming)]
        )

        with patch("generator.enhanced_polyline_for_activity") as enhance:
            self.generator.sync(force=False)

        enhance.assert_not_called()
        self.assertEqual(self.stored_polyline(), detailed)

    def test_stream_failure_preserves_a_denser_existing_route(self):
        existing = line_polyline(800, 18.0)
        incoming = line_polyline(282, 50.0)
        self.add_existing_activity(existing)
        self.generator.client = SimpleNamespace(
            get_activities=lambda **_kwargs: [incoming_activity(incoming)]
        )

        with patch(
            "generator.enhanced_polyline_for_activity",
            side_effect=RuntimeError("temporary stream error"),
        ) as enhance:
            self.generator.sync(force=False)

        enhance.assert_called_once()
        self.assertEqual(self.stored_polyline(), existing)


if __name__ == "__main__":
    unittest.main()
