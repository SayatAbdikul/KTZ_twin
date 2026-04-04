# map_gis

Leaflet-based map frontend for locomotive geospatial monitoring.

## What it does

- Displays a live map using OpenStreetMap tiles via Leaflet.
- Polls telemetry from `http://localhost:3001/api/telemetry/current`.
- Uses direct telemetry coordinates when available (`latitude`/`longitude`).
- Falls back to route interpolation using `motion.distance` when direct coordinates are not present.
- Provides quick links to the locomotive frontend pages running on `http://localhost:5183`.

## Files

- `index.html` - layout and Leaflet wiring
- `styles.css` - page styles
- `app.js` - map + telemetry polling logic

## Run

Use any static server from repo root or `map_gis` folder.

Example:

```powershell
cd map_gis
python -m http.server 8090
```

Then open:

- `http://localhost:8090`

## Notes

- Backend must be running for telemetry polling.
- If your backend starts returning real GPS coordinates in telemetry, map marker will switch automatically to direct coordinate mode.
