"""Elapsed-time cycling power records calculated from measured Strava streams."""

import bisect
import datetime
import math

from generator.db import Activity

POWER_DURATIONS = (5, 60, 300, 1200, 2400, 3600)
CYCLING_TYPES = {
    "ride",
    "virtualride",
    "mountainbikeride",
    "gravelride",
    "ebikeride",
    "emountainbikeride",
}
MAX_SAMPLE_GAP = 5  # Never carry a power reading across a pause or recording outage.


def is_cycling(activity_type):
    return (
        str(activity_type or "")
        .replace(" ", "")
        .replace("_", "")
        .replace("-", "")
        .lower()
        in CYCLING_TYPES
    )


def calculate_power_efforts(times, watts, durations=POWER_DURATIONS):
    """Integrate piecewise-constant watts using real elapsed timestamps.

    A reading at t[i] covers [t[i], t[i+1]); zero watts count. Missing/invalid
    readings and gaps over five seconds break a continuous recording block.
    Evaluate windows starting OR ending at sample boundaries, so irregular
    sample spacing cannot hide a better window. Do not extrapolate the last sample.
    """
    if len(times) != len(watts):
        raise ValueError("Time and power streams are not aligned")
    if any(not isinstance(t, (int, float)) or not math.isfinite(t) for t in times):
        raise ValueError("Invalid stream timestamps")
    if any(b <= a for a, b in zip(times, times[1:])):
        raise ValueError("Stream timestamps must increase")
    best = {}

    def process(boundaries, powers):
        if not powers:
            return
        energy = [0.0]
        for i, power in enumerate(powers):
            energy.append(energy[-1] + power * (boundaries[i + 1] - boundaries[i]))

        def integral(t):
            i = min(bisect.bisect_right(boundaries, t) - 1, len(powers) - 1)
            return energy[i] + powers[i] * (t - boundaries[i])

        for duration in durations:
            if duration <= 0 or boundaries[-1] - boundaries[0] < duration:
                continue
            starts = {t for t in boundaries if t + duration <= boundaries[-1]}
            starts.update(
                t - duration for t in boundaries if t - duration >= boundaries[0]
            )
            for start in sorted(starts):
                average = (integral(start + duration) - integral(start)) / duration
                if average > best.get(duration, {}).get("watts", 0):
                    best[duration] = {
                        "duration": duration,
                        "watts": average,
                        "start_time": start,
                        "end_time": start + duration,
                    }

    boundaries, powers = [], []
    for i in range(len(times) - 1):
        power = watts[i]
        valid = (
            isinstance(power, (int, float))
            and math.isfinite(power)
            and power >= 0
            and times[i + 1] - times[i] <= MAX_SAMPLE_GAP
        )
        if not valid:
            process(boundaries, powers)
            boundaries, powers = [], []
            continue
        if not boundaries:
            boundaries = [times[i]]
        boundaries.append(times[i + 1])
        powers.append(power)
    process(boundaries, powers)
    return [best[d] for d in durations if d in best]


def sync_power_efforts(client, session, limit=20, refresh=False):
    from strava_best_efforts import value

    candidates = [
        a
        for a in session.query(Activity).order_by(Activity.start_date_local.desc())
        if a.source == "strava"
        and is_cycling(a.type)
        and (refresh or a.power_efforts is None)
    ]
    if limit > 0:
        candidates = candidates[:limit]
    updated = 0
    for activity in candidates:
        try:
            measured = activity.device_watts
            if measured is None or refresh:
                detail = client.get_activity(int(activity.run_id))
                measured = value(detail, "device_watts")
                if measured is None and value(detail, "id") != activity.run_id:
                    continue  # An incomplete response is not a verified empty result.
            if measured is True:
                streams = client.get_activity_streams(
                    int(activity.run_id), types=["time", "watts"]
                )
                if not streams or "time" not in streams or "watts" not in streams:
                    continue  # Keep prior results and allow a later retry.
                data = []
                for key in ("time", "watts"):
                    stream = streams[key]
                    values = value(
                        stream, "data", stream if isinstance(stream, list) else []
                    )
                    if not values or (
                        value(stream, "original_size", len(values)) or len(values)
                    ) > len(values):
                        raise ValueError("Incomplete power stream")
                    data.append(values)
                efforts = calculate_power_efforts(*data)
            else:
                efforts = []
            activity.device_watts = measured
            activity.power_efforts = efforts
            activity.power_efforts_synced_at = datetime.datetime.now(
                datetime.timezone.utc
            ).isoformat()
            session.commit()
            updated += 1
            print(
                f"Cycling power {updated}/{len(candidates)}: {activity.run_id} ({len(efforts)} durations)",
                flush=True,
            )
        except Exception as error:
            session.rollback()
            print(
                f"Power sync stopped ({type(error).__name__}); cached results retained.",
                flush=True,
            )
            break
    return updated
