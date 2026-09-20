import datetime as dt
import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import ExitStack, closing
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "run_page"))

import roadtrip_sync  # noqa: E402


class RoadTripTimesTest(unittest.TestCase):
    def test_utc_gpx_times_survive_import_and_export(self):
        for creator, start, end, local_start, local_end in (
            (
                "IGPSPORT",
                "2026-09-19T09:03:25Z",
                "2026-09-19T09:31:54Z",
                "2026-09-19 17:03:25",
                "2026-09-19 17:31:54",
            ),
            (
                "IGPSPORT",
                "2026-09-19T15:50:00Z",
                "2026-09-19T16:10:00Z",
                "2026-09-19 23:50:00",
                "2026-09-20 00:10:00",
            ),
            (
                "Garmin",
                "2026-09-19T09:03:25Z",
                "2026-09-19T09:31:54Z",
                "2026-09-19 17:03:25",
                "2026-09-19 17:31:54",
            ),
        ):
            with self.subTest(creator=creator, start=start):
                with (
                    tempfile.TemporaryDirectory() as directory,
                    ExitStack() as resources,
                ):
                    folder = Path(directory)
                    db_path = str(folder / "data.db")
                    json_path = str(folder / "activities.json")
                    (folder / "trip.gpx").write_text(
                        f'<gpx version="1.1" creator="{creator}" '
                        'xmlns="http://www.topografix.com/GPX/1/1">'
                        "<trk><name>trip</name><trkseg>"
                        '<trkpt lat="38.863272" lon="115.596422">'
                        f"<time>{start}</time></trkpt>"
                        '<trkpt lat="38.867851" lon="115.599758">'
                        f"<time>{end}</time></trkpt>"
                        "</trkseg></trk></gpx>",
                        encoding="utf-8",
                    )
                    rebuild = roadtrip_sync.rebuild_activities_json
                    generator_class = roadtrip_sync.Generator

                    def make_generator(path):
                        generator = generator_class(path)
                        resources.callback(generator.session.get_bind().dispose)
                        resources.callback(generator.session.close)
                        return generator

                    with (
                        patch("generator.db.g.reverse", return_value="China"),
                        patch.object(
                            roadtrip_sync, "Generator", side_effect=make_generator
                        ),
                        patch.object(roadtrip_sync, "SQL_FILE", db_path),
                        patch.object(
                            roadtrip_sync, "load_synced_file_list", return_value=[]
                        ),
                        patch.object(roadtrip_sync, "save_synced_data_file_list"),
                        patch.object(
                            roadtrip_sync,
                            "rebuild_activities_json",
                            side_effect=lambda: rebuild(db_path, json_path),
                        ),
                    ):
                        roadtrip_sync.sync_roadtrip_gpx(folder)
                        roadtrip_sync.sync_roadtrip_gpx(folder)
                    with closing(sqlite3.connect(db_path)) as connection:
                        rows = connection.execute(
                            "SELECT start_date, start_date_local, elapsed_time "
                            "FROM activities"
                        ).fetchall()
                    self.assertEqual(len(rows), 1)
                    utc_start = dt.datetime.fromisoformat(start)
                    duration = dt.datetime.fromisoformat(end) - utc_start
                    self.assertEqual(
                        rows[0][0], utc_start.strftime("%Y-%m-%d %H:%M:%S")
                    )
                    self.assertEqual(rows[0][1], local_start)
                    self.assertEqual(
                        dt.datetime.fromisoformat(rows[0][2]) - dt.datetime(1970, 1, 1),
                        duration,
                    )
                    self.assertEqual(
                        dt.datetime.fromisoformat(local_start) + duration,
                        dt.datetime.fromisoformat(local_end),
                    )
                    exported = json.loads(Path(json_path).read_text(encoding="utf-8"))
                    self.assertEqual(len(exported), 1)
                    self.assertEqual(exported[0]["start_date_local"], local_start)
                    self.assertEqual(exported[0]["start_date"], rows[0][0])

    def test_naive_local_times_keep_existing_behavior(self):
        start = dt.datetime(2026, 9, 19, 17, 3, 25)
        end = start + dt.timedelta(minutes=30)
        offset = dt.timedelta(hours=8)
        track = SimpleNamespace(
            start_time=start,
            end_time=end,
            start_time_local=start + offset,
            end_time_local=end + offset,
            source="IGPSPORT",
            run_id=123,
        )
        roadtrip_sync.normalize_local_times(track)
        self.assertEqual(track.start_time_local, start)
        self.assertEqual(track.end_time_local, end)
        self.assertEqual(track.start_time, start - offset)
        self.assertEqual(track.end_time, end - offset)
        self.assertEqual(track.run_id, 123)


if __name__ == "__main__":
    unittest.main()
