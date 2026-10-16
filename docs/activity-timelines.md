# Activity timelines and gradual backfill

The new Dashboard expands a compact timeline below the selected activity row.
Strava running uses pace in min/km. Cycling with an available power stream
(including measured zero watts) displays power and speed as two aligned strips;
otherwise it displays speed alone in km/h. Estimated
power is explicitly labelled. Time-weighted windows are about 10 seconds.

Running activities with a recorded heart-rate stream also display a BPM strip,
aligned with pace and the shared map cursor. Fixed BPM bands are not personalized
training zones. Resting samples remain visible; zero, invalid values and gaps are
missing data, not zero BPM. The strip is hidden when no valid samples exist.

Running/cycling/hiking with elevation gain strictly above 200 m also displays an
elevation profile. Missing altitude spans connect linearly; the upper right
readout combines time, pace or power+speed, heart rate when available, and altitude. Speed has no duplicate
readout, and all strips share one time axis. Official Strava categorized
segment efforts colour climbing sections. Overlaps show the harder category.
API categories 1..5 mean Cat 4, Cat 3, Cat 2, Cat 1, HC. Hiking displays elevation
alone, with its own time axis and altitude readout. Hikes at or below 200 m are
excluded from backfill.

All strips share a cursor. The route map shows a yellow dot at its corresponding
timestamped GPS position. During missing GPS spans the dot holds the last valid
position; before the first valid fix it is hidden. Ordinary short intervals are
interpolated, including antimeridian crossings. Selecting another activity clears
the marker. Coordinates use the same map correction as the route line.

## Backfill

`python run_page/strava_timeline_sync.py --limit 20` processes at most 20 pending
activities, newest first. Eligible rows must have `source: strava` and a running
or cycling type, or a hiking type with more than 200 m elevation gain. The script
reads the existing `.env` or process credentials.
`--dry-run` prints counts without writing or accessing Strava. `--limit 0` only
migrates/reconciles existing test files and makes no API requests.

Each activity saves atomically to `public/data/activity-timelines/<id>.json`.
The small `index.json` records completion and retry status. Existing five-run /
five-ride preview files migrate once; the frontend now loads only the selected
activity's file. The index refreshes on selection after 30 seconds. Completed
files are reused; confirmed missing streams are cached. Older power files receive
an incremental speed-stream upgrade, preserving GPS, power, altitude and climbs.
Older running files receive an incremental heart-rate-stream upgrade, preserving
pace, GPS, altitude and climbs. Missing heart-rate streams are cached after one
check. The content schema also rechecks activities newly eligible for elevation
under the 200 m threshold. Already complete unaffected files advance without
another API request.
Transient errors defer
the affected activity for one day, activity-not-found responses for seven days.
Successful files recover even if execution stops before the index is saved.

A batch defaults to at most 70 API requests, reserves at least 20 short-window
and 100 daily requests, and honours both overall and read rate-limit headers.
Every batch probes the quota before downloading. HTTP 429 stops the batch with
completed progress retained. Batch locks prevent concurrent writes. Credentials
are not written to public data. Old timelines can acquire GPS with one streams
request; their existing pace/power/elevation data is preserved.

`python run_page/strava_timeline_sync.py --continue --limit 30 --max-requests 65`
continues local batches until all eligible activities have been checked. It waits
until natural 15-minute API resets between batches, or midnight UTC when the
daily reserve is reached. The computer/process must remain running. Its current
PID, state and next batch time are in `.cache/activity-timeline-worker.json`.
If interrupted, rerun the command to resume saved progress. Stop a running worker
using its recorded PID, preferably while its state is `waiting`.

The existing `strava_sync.py` now backfills at most 20 timelines after exporting
the main activity data. `--timeline-limit 0` skips this step. Daily workflow cache
paths include timeline files, and data-sync jobs run serially. These repository
changes take effect remotely after they are pushed; the local worker is separate.

The old `strava_pace_preview.py` and `strava_elevation_preview.py` entrypoints are
kept for the original bounded experiments; use `strava_timeline_sync.py` for the
production store and all further backfills.

## Checks

- `python -m unittest discover -s tests -p test_strava_timeline_sync.py`
- `python -m unittest discover -s tests -p test_strava_pace_preview.py`
- `pnpm test:dashboard`
- `pnpm typecheck`
- `pnpm build`
