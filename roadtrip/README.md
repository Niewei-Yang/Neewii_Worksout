# RoadTrip uploads

Put road trip `.gpx` or `.fit` files in this folder, then import them into the local database with:

```powershell
python .\run_page\roadtrip_sync.py --dry-run
python .\run_page\roadtrip_sync.py
```

The file name becomes the activity name. The importer writes `RoadTrip` activities to `run_page/data.db`, updates `imported.json`, and rebuilds `src/static/activities.json`.

GPX timestamps with an explicit timezone are respected, including IGPSPORT files: `2026-09-19T09:03:25Z` imports as `2026-09-19 17:03:25` in China. Timestamps without a timezone are treated as local wall-clock times. Files with incorrectly labeled timezones must be corrected before import; the importer does not infer a timezone error from the creator name.

Use files with real timestamps when possible. For planned routes without timestamps, use the train importer if the activity should be categorized as `Train`, or add timestamps before importing as `RoadTrip`.
