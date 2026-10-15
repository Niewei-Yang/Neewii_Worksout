# Original five-run and five-ride timeline experiments

The active implementation now uses per-activity files and gradual backfill.
See [activity timelines](../docs/activity-timelines.md) for current behaviour,
worker state, batch commands and daily sync integration. The notes below record
the original bounded experiments; their legacy JSON is only a migration source.

Open `/dashboard` and select one of the five sampled runs or rides in the activity list.
A compact pace strip expands directly below that row; select it again to close,
or select a different activity to move the expansion. Only the new Dashboard
is affected. There is no separate pace page, navigation item or map-side card.

For runs/rides with elevation gain strictly above 500 m, cached altitude data
adds a 40px elevation profile below the pace/power strip. Both share the same
elapsed-time axis and one shared cursor. Time, pace/speed/power and altitude
appear together at the upper strip's right edge. Both strips update the cursor.
Fetch the initial named test with
`python run_page/strava_elevation_preview.py 20536849090` (大棒骨+东北口关).
Altitude uses time-weighted 10-second windows, including stationary samples,
zero and negative elevations. The profile connects valid samples across missing
spans with straight lines; the shared readout uses the same linear interpolation.
At the start/end, the closest known altitude extends to the timeline boundary.
Raw cached gaps stay missing. Heights scale to
this activity's altitude range. Other qualifying activities need altitude data
fetched before a profile can appear. The original tests did not change daily sync.

The elevation fetch also retains officially categorized Strava segment efforts.
Categories 1..5 in the API mean Cat 4, Cat 3, Cat 2, Cat 1, HC respectively.
Effort start timestamps and elapsed durations position them on the time axis;
stream indexes are never mistaken for elapsed seconds or indexes into cached
bins. Colour overlays are clipped to the elevation contour. Harder categories
paint over easier overlapping segments. Green remains the unclassified base.
The test ride has Cat 4/3/2 climbs; it has no Cat 1 or HC segment in the returned
data. The small legend includes all five colours. Shared readouts stay unchanged.

Refresh explicitly with `python run_page/strava_pace_preview.py`. The script
reads the existing `.env` credentials, selects the latest five Run / TrailRun /
VirtualRun activities from Strava, and writes `public/data/pace-preview.json`.
It does not alter the activity database, main activities JSON, or daily sync.
No credentials or GPS locations are included in the preview output.
Use `python run_page/strava_pace_preview.py --sport ride` to refresh the latest
five cycling activities while retaining the five running samples. Cycling uses
a usable watts stream first, otherwise velocity-derived speed displayed in km/h
(cached seconds/km values are converted using 3600 / pace). Gaps in
an otherwise usable power stream stay missing; we never mix watts and pace in
one strip. Zero watts remains valid, including when stationary. Power uses the
same duration-weighted 10-second windows. Estimated power is labelled explicitly
when Strava reports `device_watts: false`.

The horizontal axis is elapsed time, with each strip scaled to its own duration.
Velocity samples are held until the next timestamp and averaged by duration in
10-second windows. Pauses and missing data split windows. Gaps longer than 30
seconds and uncovered start/end spans remain unknown. Zero speed or an explicit
false `moving` flag is paused/stationary; missing data is never treated as easy
running. Pace is `1000 / mean velocity`, not the mean of individual paces.

Bands are fixed comparison ranges (seconds/km): >=420, [360,420), [330,360),
[300,330), [270,300), [240,270), and <240. They are not personalised threshold
zones and are not grade-adjusted. Pauses and gaps keep their elapsed width.
Cycling speed boundaries are 15, 20, 24, 30, 36, 40 km/h.
Power boundaries are 100, 150, 200, 250, 300, 400 watts, with lower bounds
inclusive. These are absolute visual bands, not personalised FTP zones.
Hover/touch the strip to inspect a time window; focus it and use arrow keys,
Home or End for the equivalent keyboard interaction.

Checks: `python -m unittest discover -s tests -p test_strava_pace_preview.py`,
`pnpm test:dashboard`, `pnpm typecheck`, `pnpm build`.
