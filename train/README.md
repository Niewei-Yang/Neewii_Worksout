# Train uploads

Put train route files in this folder, then import them into the local database with:

```powershell
python .\run_page\train_sync.py --dry-run --start 202604300840 --end 202604301110
python .\run_page\train_sync.py --start 202604300840 --end 202604301110
```

Supported file types are `.gpx` and `.kml`.

Use `--start` and `--end` when the route file is only a planned route and does not contain timestamps. Times are local China/Singapore time by default. The importer calculates `average_speed` as route distance divided by elapsed seconds, writes `Train` activities to `run_page/data.db`, updates `imported.json`, and rebuilds `src/static/activities.json`.
