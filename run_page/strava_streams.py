import math
import os
from typing import Iterable, List, Tuple

import polyline

LatLng = Tuple[float, float]

LONG_ACTIVITY_STREAM_DISTANCE = float(
    os.getenv("STRAVA_STREAM_DISTANCE_THRESHOLD_M", "100000")
)
STREAM_POINTS_PER_100KM = int(os.getenv("STRAVA_STREAM_POINTS_PER_100KM", "2000"))


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


def stream_kwargs(resolution=None):
    kwargs = {"types": ["latlng"]}
    if resolution and resolution != "all":
        kwargs["resolution"] = resolution
    return kwargs


def should_use_streams(distance) -> bool:
    try:
        return float(distance) > LONG_ACTIVITY_STREAM_DISTANCE
    except (TypeError, ValueError):
        return False


def enhanced_polyline_for_activity(client, activity, resolution=None):
    streams = client.get_activity_streams(
        int(activity.id), **stream_kwargs(resolution=resolution)
    )
    latlng = stream_data(streams.get("latlng") if streams else None)
    if not latlng:
        return None, 0, 0

    simplified = simplify_latlng_by_density(latlng)
    return polyline.encode(simplified), len(latlng), len(simplified)
