import calendar
import datetime
import argparse

import svgwrite

from .exceptions import PosterError
from .poster import Poster
from .tracks_drawer import TracksDrawer
from .utils import format_float
from .xy import XY


class GithubDrawer(TracksDrawer):
    """Draw a github profile-like poster"""

    type_palettes = {
        "running": ["#fed7aa", "#fb923c", "#f97316", "#ea580c"],
        "cycling": ["#bfdbfe", "#60a5fa", "#3b82f6", "#2563eb"],
        "walking": ["#bbf7d0", "#4ade80", "#22c55e", "#16a34a"],
        "training": ["#fae8ff", "#e879f9", "#c026d3", "#a21caf"],
    }

    def __init__(self, the_poster: Poster):
        super().__init__(the_poster)
        self.empty_color = "#444444"

    def create_args(self, args_parser: argparse.ArgumentParser):
        """Add arguments specific to github drawer"""
        group = args_parser.add_argument_group("Github Type Options")
        group.add_argument(
            "--empty-data-color",
            dest="github_empty_data_color",
            metavar="COLOR",
            type=str,
            default=self.empty_color,
            help="Color for empty dates in github style poster (default: #444444)",
        )

    def fetch_args(self, args):
        self.empty_color = args.github_empty_data_color

    def footer_legend_items(self):
        return [
            (self.type_palettes["running"], "Run"),
            (self.type_palettes["walking"], "Hike"),
            (self.type_palettes["cycling"], "Ride"),
            (self.type_palettes["training"], "Workout"),
        ]

    def display_type(self, track_type: str) -> str:
        if track_type in ("Run", "running", "Trail Run", "Treadmill Run"):
            return "running"
        if track_type in ("Ride", "cycling", "Indoor Ride", "VirtualRide"):
            return "cycling"
        if track_type in ("Hike", "Walk", "walking"):
            return "walking"
        return "training"

    def activity_value(self, track, display_type: str) -> float:
        if display_type == "training":
            if hasattr(track, "duration_seconds"):
                return track.duration_seconds() / 60
            return 0
        return track.length

    def dominant_type(self, tracks) -> str:
        if not tracks:
            return "training"
        return max(
            self.type_palettes.keys(),
            key=lambda display_type: self.value_for_type(tracks, display_type),
        )

    def value_for_type(self, tracks, display_type: str) -> float:
        return sum(
            self.activity_value(t, display_type)
            for t in tracks
            if self.display_type(t.type) == display_type
        )

    def type_max_by_year(self, year: int):
        max_by_type = {key: 1.0 for key in self.type_palettes.keys()}
        for date, tracks in self.poster.tracks_by_date.items():
            if not date.startswith(f"{year}-"):
                continue
            display_type = self.dominant_type(tracks)
            value = self.value_for_type(tracks, display_type)
            max_by_type[display_type] = max(max_by_type[display_type], value)
        return max_by_type

    def color_by_type(self, display_type: str, value: float, max_value: float) -> str:
        """Return a color from the sport palette based on the value ratio."""
        palette = self.type_palettes.get(display_type, self.type_palettes["training"])
        ratio = min(max(value / max_value, 0), 1)
        level = max(1, min(4, int((ratio * 4) + 0.999999)))
        return palette[level - 1]

    def draw(self, dr: svgwrite.Drawing, size: XY, offset: XY):
        if self.poster.tracks is None:
            raise PosterError("No tracks to draw")
        year_size = 200 * 4.0 / 80.0
        year_style = f"font-size:{year_size}px; font-family:Arial;"
        year_length_style = f"font-size:{110 * 3.0 / 80.0}px; font-family:Arial;"
        month_names_style = "font-size:2.5px; font-family:Arial"
        total_length_year_dict = self.poster.total_length_year_dict

        is_align_monday = self.poster.github_style == "align-monday"
        for year in range(self.poster.years.from_year, self.poster.years.to_year + 1)[
            ::-1
        ]:
            start_date_weekday, _ = calendar.monthrange(year, 1)
            github_rect_first_day = datetime.date(year, 1, 1)

            # default GitHub svg style:  the start day of each year always aligns with first day.
            github_rect_day = github_rect_first_day
            first_day_weekday = github_rect_first_day.weekday()

            if is_align_monday:
                # This is an earlier GitHub style: the start day of each year always aligns with Monday.
                # If you want to use this, please add the command-line argument "--github-style align-monday" .
                github_rect_day = github_rect_first_day + datetime.timedelta(
                    -start_date_weekday
                )
                first_day_weekday = 0

            year_length = total_length_year_dict.get(year, 0)
            year_length = format_float(self.poster.m2u(year_length))

            if not any(
                date.startswith(f"{year}-") for date in self.poster.tracks_by_date
            ):
                continue
            month_names = [calendar.month_abbr[i][:3] for i in range(1, 13)]
            km_or_mi = "mi"
            if self.poster.units == "metric":
                km_or_mi = "km"
            dr.add(
                dr.text(
                    f"{year}",
                    insert=offset.tuple(),
                    fill=self.poster.colors["text"],
                    dominant_baseline="hanging",
                    style=year_style,
                )
            )

            dr.add(
                dr.text(
                    f"{year_length} {km_or_mi}",
                    insert=(offset.tuple()[0] + 165, offset.tuple()[1] + 5),
                    fill=self.poster.colors["text"],
                    dominant_baseline="hanging",
                    style=year_length_style,
                )
            )
            # add month name up to the poster one by one because of svg text auto trim the spaces.
            for num, name in enumerate(month_names):
                dr.add(
                    dr.text(
                        f"{name}",
                        insert=(offset.tuple()[0] + 15.5 * num, offset.tuple()[1] + 14),
                        fill=self.poster.colors["text"],
                        style=month_names_style,
                    )
                )

            rect_x = 10.0
            dom = (2.6, 2.6)
            type_max = self.type_max_by_year(year)

            # add every day of this year for 53 weeks and per week has 7 days
            for i in range(54):
                # the first day of the first week of the year may not Monday
                # so we need to skip some empty spaces
                if i == 0:
                    rect_y = offset.y + year_size + 2 + 3.5 * first_day_weekday
                else:
                    # the first day of the n week (n >1) must be  Monday
                    # so set first_day_weekday = 0
                    first_day_weekday = 0
                    rect_y = offset.y + year_size + 2
                for j in range(7 - first_day_weekday):
                    if int(github_rect_day.year) > year:
                        break
                    rect_y += 3.5
                    color = self.empty_color
                    date_title = str(github_rect_day)
                    if date_title in self.poster.tracks_by_date:
                        tracks = self.poster.tracks_by_date[date_title]
                        length = sum([t.length for t in tracks])
                        display_type = self.dominant_type(tracks)
                        type_value = self.value_for_type(tracks, display_type)
                        color = self.color_by_type(
                            display_type, type_value, type_max[display_type]
                        )
                        str_length = format_float(self.poster.m2u(length))
                        value_unit = km_or_mi
                        if display_type == "training":
                            str_length = format_float(type_value)
                            value_unit = "min"
                        date_title = (
                            f"{date_title} {display_type} {str_length} {value_unit}"
                        )

                    rect = dr.rect((rect_x, rect_y), dom, fill=color)
                    rect.set_desc(title=date_title)
                    dr.add(rect)
                    github_rect_day += datetime.timedelta(1)
                rect_x += 3.5
            offset.y += 3.5 * 9 + year_size + 1.0
