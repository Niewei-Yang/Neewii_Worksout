import math
import sys
import unittest
from pathlib import Path

import polyline

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "run_page"))

from strava_streams import (  # noqa: E402
    points_per_100km_for_activity,
    prefer_denser_polyline,
    route_has_sufficient_density,
    should_use_streams,
    simplify_latlng_by_density,
)


def line_points(count, spacing_m=1.0):
    degrees_per_meter = 1 / 111320
    return [(0.0, index * spacing_m * degrees_per_meter) for index in range(count)]


class StravaStreamsTest(unittest.TestCase):
    def test_running_uses_ten_meter_density(self):
        self.assertEqual(points_per_100km_for_activity("Run"), 10000)
        self.assertEqual(points_per_100km_for_activity("Trail Run"), 10000)
        self.assertEqual(points_per_100km_for_activity("Ride"), 2000)

    def test_distance_sampling_preserves_ends_and_roughly_ten_meters(self):
        points = line_points(201)
        simplified = simplify_latlng_by_density(points, points_per_100km=10000)

        self.assertEqual(simplified[0], points[0])
        self.assertEqual(simplified[-1], points[-1])
        self.assertGreaterEqual(len(simplified), 18)
        self.assertLessEqual(len(simplified), 22)

    def test_long_or_coarse_runs_use_streams(self):
        smooth_short_route = polyline.encode(line_points(300, spacing_m=16.0))
        coarse_short_route = polyline.encode(line_points(100, spacing_m=50.0))

        self.assertTrue(
            should_use_streams(10000, "Run", summary_polyline=smooth_short_route)
        )
        self.assertTrue(
            should_use_streams(5000, "Run", summary_polyline=coarse_short_route)
        )
        self.assertFalse(
            should_use_streams(5000, "Run", summary_polyline=smooth_short_route)
        )

    def test_non_running_activities_keep_legacy_threshold(self):
        self.assertFalse(should_use_streams(15000, "Ride"))
        self.assertTrue(should_use_streams(100001, "Ride"))

    def test_cached_route_density_matches_activity_type(self):
        detailed_run = polyline.encode(line_points(1250, spacing_m=12.0))
        coarse_run = polyline.encode(line_points(282, spacing_m=50.0))

        self.assertTrue(route_has_sufficient_density(15000, detailed_run, "Run"))
        self.assertFalse(route_has_sufficient_density(15000, coarse_run, "Run"))

    def test_stream_failure_prefers_denser_existing_route(self):
        existing = polyline.encode(line_points(1200, spacing_m=10.0))
        incoming = polyline.encode(line_points(280, spacing_m=50.0))

        self.assertEqual(prefer_denser_polyline(existing, incoming), existing)
        self.assertEqual(prefer_denser_polyline(incoming, existing), existing)

    def test_generated_coordinates_are_finite(self):
        for lat, lon in simplify_latlng_by_density(
            line_points(50), points_per_100km=10000
        ):
            self.assertTrue(math.isfinite(lat))
            self.assertTrue(math.isfinite(lon))


if __name__ == "__main__":
    unittest.main()
