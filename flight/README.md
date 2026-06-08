# Flight uploads

Put flight `.kml` or `.gpx` files in this folder, then import them into the local database with:

```powershell
python .\run_page\flight_sync.py --dry-run
python .\run_page\flight_sync.py
```

If a route file does not contain usable timestamps, pass a date so the importer can create a stable fallback time:

```powershell
python .\run_page\flight_sync.py --date 20260430
```

The importer writes `Flight` activities to `run_page/data.db`, updates `imported.json`, and rebuilds `src/static/activities.json`. `Flight` routes are shown as dashed lines and count as activities, but their kilometers are excluded from the homepage distance totals.

