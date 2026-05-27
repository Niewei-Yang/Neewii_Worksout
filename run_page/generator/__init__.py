import datetime
import os
import sys

import arrow
import stravalib
from config import MAPPING_TYPE, run_map
from gpxtrackposter import track_loader
from sqlalchemy import func

from polyline_processor import filter_out
from strava_streams import enhanced_polyline_for_activity, should_use_streams

from .db import Activity, init_db, normalize_activity_type, update_or_create_activity

from synced_data_file_logger import save_synced_data_file_list

IGNORE_BEFORE_SAVING = os.getenv("IGNORE_BEFORE_SAVING", False)
STRAVA_STREAM_RESOLUTION = os.getenv("STRAVA_STREAM_RESOLUTION")


class Generator:
    def __init__(self, db_path):
        self.client = stravalib.Client()
        self.session = init_db(db_path)

        self.client_id = ""
        self.client_secret = ""
        self.refresh_token = ""
        self.only_run = False

    def set_strava_config(self, client_id, client_secret, refresh_token):
        self.client_id = client_id
        self.client_secret = client_secret
        self.refresh_token = refresh_token

    def check_access(self):
        response = self.client.refresh_access_token(
            client_id=self.client_id,
            client_secret=self.client_secret,
            refresh_token=self.refresh_token,
        )
        # Update the authdata object
        self.access_token = response["access_token"]
        self.refresh_token = response["refresh_token"]

        self.client.access_token = response["access_token"]
        print("Access ok")

    def sync(self, force):
        """
        Sync activities means sync from strava
        TODO, better name later
        """
        self.check_access()

        print("Start syncing")
        if force:
            filters = {"before": datetime.datetime.now(datetime.timezone.utc)}
        else:
            last_activity = self.session.query(func.max(Activity.start_date)).scalar()
            if last_activity:
                last_activity_date = arrow.get(last_activity)
                last_activity_date = last_activity_date.shift(days=-7)
                filters = {"after": last_activity_date.datetime}
            else:
                filters = {"before": datetime.datetime.now(datetime.timezone.utc)}

        renamed_count = 0
        for activity in self.client.get_activities(**filters):
            strava_activity_type = getattr(activity, "sport_type", None) or activity.type
            activity_type = normalize_activity_type(strava_activity_type)
            if self.only_run and activity_type != "Run":
                continue
            if activity.distance and should_use_streams(activity.distance):
                try:
                    enhanced_polyline, stream_points, simplified_points = (
                        enhanced_polyline_for_activity(
                            self.client,
                            activity,
                            resolution=STRAVA_STREAM_RESOLUTION,
                        )
                    )
                    if enhanced_polyline:
                        if activity.map:
                            try:
                                activity.map.summary_polyline = enhanced_polyline
                            except AttributeError:
                                activity.map = run_map(enhanced_polyline)
                        else:
                            activity.map = run_map(enhanced_polyline)
                        print(
                            f"\nEnhanced Strava route {activity.id}: "
                            f"{stream_points} stream points -> "
                            f"{simplified_points} stored points"
                        )
                except Exception as e:
                    print(f"\nCould not enhance Strava route {activity.id}: {e}")
            if IGNORE_BEFORE_SAVING:
                if activity.map and activity.map.summary_polyline:
                    activity.map.summary_polyline = filter_out(
                        activity.map.summary_polyline
                    )
            activity.source = "strava"
            #  strava use total_elevation_gain as elevation_gain
            activity.elevation_gain = activity.total_elevation_gain
            activity.subtype = strava_activity_type
            activity.type = activity_type
            created, renamed = update_or_create_activity(self.session, activity)
            if created:
                sys.stdout.write("+")
            else:
                sys.stdout.write(".")
            if renamed:
                renamed_count += 1
            sys.stdout.flush()
        self.session.commit()
        if renamed_count:
            print(f"\nAligned {renamed_count} activity title(s) from Strava.")

    def sync_from_data_dir(self, data_dir, file_suffix="gpx", activity_title_dict={}):
        loader = track_loader.TrackLoader()
        tracks = loader.load_tracks(
            data_dir, file_suffix=file_suffix, activity_title_dict=activity_title_dict
        )
        print(f"load {len(tracks)} tracks")
        if not tracks:
            print("No tracks found.")
            return

        synced_files = []

        for t in tracks:
            created, _ = update_or_create_activity(self.session, t.to_namedtuple())
            if created:
                sys.stdout.write("+")
            else:
                sys.stdout.write(".")
            synced_files.extend(t.file_names)
            sys.stdout.flush()

        save_synced_data_file_list(synced_files)

        self.session.commit()

    def sync_from_kml_track(self, track):
        created, _ = update_or_create_activity(self.session, track.to_namedtuple())
        if created:
            sys.stdout.write("+")
        else:
            sys.stdout.write(".")
        sys.stdout.flush()

        self.session.commit()

    def sync_from_app(self, app_tracks):
        if not app_tracks:
            print("No tracks found.")
            return
        print("Syncing tracks '+' means new track '.' means update tracks")
        synced_files = []
        for t in app_tracks:
            created, _ = update_or_create_activity(self.session, t)
            if created:
                sys.stdout.write("+")
            else:
                sys.stdout.write(".")
            if "file_names" in t:
                synced_files.extend(t.file_names)
            sys.stdout.flush()

        self.session.commit()

    def load(self):
        # if sub_type is not in the db, just add an empty string to it
        query = self.session.query(Activity).filter(Activity.distance > 0.1)
        if self.only_run:
            query = query.filter(Activity.type == "Run")

        activities = query.order_by(Activity.start_date_local)
        activity_list = []

        streak = 0
        last_date = None
        for activity in activities:
            # Determine running streak.
            date = datetime.datetime.strptime(
                activity.start_date_local, "%Y-%m-%d %H:%M:%S"  # type: ignore
            ).date()
            if last_date is None:
                streak = 1
            elif date == last_date:
                pass
            elif date == last_date + datetime.timedelta(days=1):
                streak += 1
            else:
                assert date > last_date
                streak = 1
            activity.streak = streak  # type: ignore
            last_date = date
            if not IGNORE_BEFORE_SAVING:
                activity.summary_polyline = filter_out(activity.summary_polyline)  # type: ignore
            activity_list.append(activity.to_dict())

        return activity_list

    def loadForMapping(self):
        activities = (
            self.session.query(Activity)
            .filter(Activity.type.in_(MAPPING_TYPE))
            .order_by(Activity.start_date_local)
        )
        activity_list = []

        streak = 0
        last_date = None
        for activity in activities:
            # Determine running streak.
            # if activity.type == "Run" or activity.type == "Walk":
            date = datetime.datetime.strptime(
                activity.start_date_local, "%Y-%m-%d %H:%M:%S"
            ).date()
            if last_date is None:
                streak = 1
            elif date == last_date:
                pass
            elif date == last_date + datetime.timedelta(days=1):
                streak += 1
            else:
                assert date > last_date
                streak = 1
            activity.streak = streak
            last_date = date
            activity_list.append(activity.to_dict())

        return activity_list

    def get_old_tracks_ids(self):
        try:
            activities = self.session.query(Activity).all()
            return [str(a.run_id) for a in activities]
        except Exception as e:
            # pass the error
            print(f"something wrong with {str(e)}")
            return []

    def get_old_tracks_dates(self):
        try:
            activities = (
                self.session.query(Activity)
                .order_by(Activity.start_date_local.desc())
                .all()
            )
            return [str(a.start_date_local) for a in activities]
        except Exception as e:
            # pass the error
            print(f"something wrong with {str(e)}")
            return []
