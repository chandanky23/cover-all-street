#!/bin/bash
# Reproducible build-time script (plan.md "Dataset preparation") for
# Berlin's administrative boundaries. Fetches Bezirke (admin_level=9) and
# Ortsteile (admin_level=10) from the public Overpass API as a one-off,
# human-triggered run — not a live/automated dependency of the app itself.
# Re-run this whenever the dataset needs refreshing; output is copied into
# ../assets/geo/ and bundled into the app at build time.
set -euo pipefail
cd "$(dirname "$0")"

RAW_DIR="data/raw"
OUT_DIR="output"
mkdir -p "$RAW_DIR" "$OUT_DIR"

UA="DuppyMapDevPipeline/0.1 (one-off personal-gift project dataset build)"

echo "Fetching Berlin Bezirke (admin_level=9)..."
curl -sS --fail --max-time 60 -X POST -H "User-Agent: $UA" \
  --data-urlencode 'data=[out:json][timeout:50];
area["name"="Berlin"]["admin_level"="4"]->.berlin;
relation["admin_level"="9"](area.berlin);
out geom;' \
  "https://overpass-api.de/api/interpreter" -o "$RAW_DIR/bezirke.json"

echo "Fetching Berlin Ortsteile (admin_level=10)..."
curl -sS --fail --max-time 90 -X POST -H "User-Agent: $UA" \
  --data-urlencode 'data=[out:json][timeout:80];
area["name"="Berlin"]["admin_level"="4"]->.berlin;
relation["admin_level"="10"](area.berlin);
out geom;' \
  "https://overpass-api.de/api/interpreter" -o "$RAW_DIR/ortsteile.json"

echo "Converting to GeoJSON..."
node convert.js "$RAW_DIR/bezirke.json" "$OUT_DIR/berlin-bezirke.geojson"
node convert.js "$RAW_DIR/ortsteile.json" "$OUT_DIR/berlin-ortsteile.geojson"

echo "Copying into app assets..."
cp "$OUT_DIR/berlin-bezirke.geojson" ../assets/geo/berlin-bezirke.json
cp "$OUT_DIR/berlin-ortsteile.geojson" ../assets/geo/berlin-ortsteile.json

echo "Done. Dataset version/date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Remember: data is © OpenStreetMap contributors, ODbL — attribution required in-app."
