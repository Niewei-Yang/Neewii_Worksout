import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "run_page"))
from strava_pace_preview import pace_bins, power_bins, activity_bins, sample_bins
from strava_elevation_preview import categorized_climbs


class PacePreviewTest(unittest.TestCase):
    def test_climb_categories_use_official_values_and_elapsed_timestamps(self):
        activity = {
            "start_date": "2026-10-10T23:17:08Z",
            "elapsed_time": 100,
            "segment_efforts": [
                {
                    "start_date": "2026-10-10T23:17:18Z",
                    "elapsed_time": 40,
                    "start_index": 9999,
                    "segment": {"id": 1, "name": "Hill", "climb_category": 3},
                },
                {
                    "start_date": "2026-10-10T23:18:38Z",
                    "elapsed_time": 30,
                    "segment": {"id": 2, "climb_category": 5},
                },
                {
                    "start_date": "2026-10-10T23:17:08Z",
                    "elapsed_time": 10,
                    "segment": {"id": 3, "climb_category": 0},
                },
            ],
        }
        climbs = categorized_climbs(activity)
        self.assertEqual(
            [(c["category"], c["start"], c["end"]) for c in climbs],
            [(3, 10, 50), (5, 90, 100)],
        )

    def test_altitude_preserves_below_sea_level_zero_and_gaps(self):
        bins = sample_bins(
            [0, 5, 10, 50, 60], [-10, 0, 999, 100, 999], elapsed=60, metric="elevation"
        )
        self.assertEqual(bins[0], [0, 10, -5, "running"])
        self.assertTrue(all(b[2] is None for b in bins if 10 <= b[0] < 50))
        self.assertEqual(bins[-1], [50, 60, 100, "running"])
        self.assertEqual(sum(b[1] - b[0] for b in bins), 60)

    def test_power_is_time_weighted_and_zero_is_real_data(self):
        self.assertEqual(
            power_bins([0, 2, 10], [500, 0, 99]), [[0, 10, 100, "running"]]
        )
        self.assertEqual(power_bins([0, 10], [0, 0]), [[0, 10, 0, "running"]])

    def test_rides_prefer_power_and_fall_back_only_when_unavailable(self):
        streams = {
            "time": {"data": [0, 10, 20]},
            "watts": {"data": [200, None, 99]},
            "velocity_smooth": {"data": [10, 10, 10]},
            "moving": {"data": [False, False, False]},
        }
        metric, bins = activity_bins(streams, 20, prefer_power=True)
        self.assertEqual(metric, "power")
        self.assertEqual(bins, [[0, 10, 200, "running"], [10, 20, None, "unknown"]])
        streams["watts"]["data"] = [None, None, None]
        streams.pop("moving")
        self.assertEqual(
            activity_bins(streams, 20, True),
            ("pace", [[0, 10, 100, "running"], [10, 20, 100, "running"]]),
        )
        streams.pop("watts")
        self.assertEqual(activity_bins(streams, 20, True)[0], "pace")

    def test_irregular_sampling_averages_speed_by_duration(self):
        # 2s at 5m/s + 8s at 2.5m/s = 30m in 10s, NOT mean pace 300s/km.
        self.assertEqual(
            pace_bins([0, 2, 10], [5, 2.5, 99]), [[0, 10, 333.33, "running"]]
        )

    def test_pauses_and_missing_spans_keep_elapsed_time(self):
        bins = pace_bins(
            [2, 5, 8, 45, 50], [3, 0, 3, 4, 4], [True, False, True, True, True], 53
        )
        self.assertEqual(bins[0], [0, 2, None, "unknown"])
        self.assertIn([5, 8, None, "paused"], bins)
        self.assertEqual(bins[-1], [50, 53, None, "unknown"])
        self.assertEqual(sum(b[1] - b[0] for b in bins), 53)
        self.assertTrue(all(a[1] == b[0] for a, b in zip(bins, bins[1:])))
        self.assertTrue(
            all(b[3] == "unknown" for b in bins if b[0] >= 8 and b[1] <= 45)
        )

    def test_invalid_speed_is_not_a_fast_effort(self):
        bins = pace_bins([0, 1, 2, 3, 4], [None, -1, float("nan"), 0, 3])
        self.assertEqual(bins, [[0, 3, None, "unknown"], [3, 4, None, "paused"]])

    def test_stream_alignment_and_duration_are_validated(self):
        for times, speeds, elapsed in [
            ([0, 1], [2], 1),
            ([0, 0], [2, 2], 1),
            ([0, 10], [2, 2], 9),
        ]:
            with self.assertRaises(ValueError):
                pace_bins(times, speeds, elapsed=elapsed)


if __name__ == "__main__":
    unittest.main()
