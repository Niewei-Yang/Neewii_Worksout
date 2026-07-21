import math
import os
from typing import Iterable, List, Tuple

import polyline

LatLng = Tuple[float, float]

LONG_ACTIVITY_STREAM_DISTANCE = float(
    os.getenv("STRAVA_STREAM_DISTANCE_THRESHOLD_M", "100000")
)
STREAM_POINTS_PER_100KM = int(os.getenv("STRAVA_STREAM_POINTS_PER_100KM", "2000"))
RUN_ACTIVITY_STREAM_DISTANCE = float(
    os.getenv("STRAVA_RUN_STREAM_DISTANCE_THRESHOLD_M", "10000")
)
RUN_STREAM_POINTS_PER_100KM = int(
    os.getenv("STRAVA_RUN_STREAM_POINTS_PER_100KM", "10000")
)
RUN_SUMMARY_MAX_SPACING_M = float(os.getenv("STRAVA_RUN_SUMMARY_MAX_SPACING_M", "25"))
STORED_ROUTE_SPACING_TOLERANCE = float(
    os.getenv("STRAVA_STORED_ROUTE_SPACING_TOLERANCE", "1.5")
)

RUN_ACTIVITY_TYPES = {"run", "running", "trailrun", "virtualrun"}


def stream_data(stream):
    if stream is None:
        return []
    return getattr(stream, "data", stream) or []


def haversine_meters(a: LatLng, b: LatLng) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    radius = 6371000
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    r_lat1 = math.radians(lat1)
    r_lat2 = math.radians(lat2)
    v = (
        math.sin(d_lat / 2) ** 2
        + math.cos(r_lat1) * math.cos(r_lat2) * math.sin(d_lon / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(v), math.sqrt(1 - v))


def simplify_latlng_by_density(
    latlng: Iterable[LatLng],
    points_per_100km: int = STREAM_POINTS_PER_100KM,
) -> List[LatLng]:
    points = [(float(lat), float(lon)) for lat, lon in latlng]
    if len(points) <= 2:
        return points

    interval_m = 100000 / max(points_per_100km, 1)
    simplified = [points[0]]
    distance_since_last = 0.0
    previous = points[0]

    for point in points[1:-1]:
        distance_since_last += haversine_meters(previous, point)
        previous = point
        if distance_since_last >= interval_m:
            simplified.append(point)
            distance_since_last = 0.0

    if simplified[-1] != points[-1]:
        simplified.append(points[-1])
    return simplified


def is_run_activity(activity_type) -> bool:
    normalized = (
        str(activity_type or "")
        .replace("_", "")
        .replace("-", "")
        .replace(" ", "")
        .lower()
    )
    return normalized in RUN_ACTIVITY_TYPES


def points_per_100km_for_activity(activity_type) -> int:
    if is_run_activity(activity_type):
        return RUN_STREAM_POINTS_PER_100KM
    return STREAM_POINTS_PER_100KM


def polyline_point_count(polyline_str) -> int:
    if not polyline_str:
        return 0
    try:
        return len(polyline.decode(polyline_str))
    except (TypeError, ValueError):
        return 0


def route_spacing_meters(distance, polyline_str):
    try:
        distance_m = float(distance)
    except (TypeError, ValueError):
        return None

    point_count = polyline_point_count(polyline_str)
    if distance_m <= 0 or point_count < 2:
        return None
    return distance_m / point_count


def route_has_sufficient_density(distance, polyline_str, activity_type) -> bool:
    spacing_m = route_spacing_meters(distance, polyline_str)
    if spacing_m is None:
        return False

    points_per_100km = points_per_100km_for_activity(activity_type)
    target_spacing_m = 100000 / max(points_per_100km, 1)
    return spacing_m <= target_spacing_m * STORED_ROUTE_SPACING_TOLERANCE


def prefer_denser_polyline(existing_polyline, incoming_polyline):
    if polyline_point_count(existing_polyline) > polyline_point_count(
        incoming_polyline
    ):
        return existing_polyline
    return incoming_polyline


def stream_kwargs(resolution=None):
    kwargs = {"types": ["latlng"]}
    if resolution and resolution != "all":
        kwargs["resolution"] = resolution
    return kwargs


def should_use_streams(distance, activity_type=None, summary_polyline=None) -> bool:
    try:
        distance_m = float(distance)
    except (TypeError, ValueError):
        return False

    if is_run_activity(activity_type):
        if distance_m >= RUN_ACTIVITY_STREAM_DISTANCE:
            return True
        summary_spacing_m = route_spacing_meters(distance_m, summary_polyline)
        return (
            summary_spacing_m is not None
            and summary_spacing_m > RUN_SUMMARY_MAX_SPACING_M
        )

    return distance_m > LONG_ACTIVITY_STREAM_DISTANCE


def enhanced_polyline_for_activity(
    client, activity, resolution=None, points_per_100km=None
):
    streams = client.get_activity_streams(
        int(activity.id), **stream_kwargs(resolution=resolution)
    )
    latlng = stream_data(streams.get("latlng") if streams else None)
    if not latlng:
        return None, 0, 0

    if points_per_100km is None:
        points_per_100km = points_per_100km_for_activity(
            getattr(activity, "type", None)
        )
    simplified = simplify_latlng_by_density(latlng, points_per_100km=points_per_100km)
    return polyline.encode(simplified), len(latlng), len(simplified)
