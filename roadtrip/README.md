# RoadTrip uploads

Put road trip `.gpx` or `.fit` files in this folder, then import them into the local database with:

```powershell
python .\run_page\roadtrip_sync.py --dry-run
python .\run_page\roadtrip_sync.py
```

The file name becomes the activity name. The importer writes `RoadTrip` activities to `run_page/data.db`, updates `imported.json`, and rebuilds `src/static/activities.json`.

Use files with real timestamps when possible. For planned routes without timestamps, use the train importer if the activity should be categorized as `Train`, or add timestamps before importing as `RoadTrip`.

