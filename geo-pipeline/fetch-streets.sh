#!/bin/bash
# Reproducible build-time script for Berlin's eligible street network
# (plan.md "Coverage definitions" — pedestrian-accessible public roads,
# excluding motorway-only/private segments). Scoped one Bezirk at a time
# to stay well under Overpass's query-size/timeout limits and to be a
# considerate, bounded one-off user of the shared public API (not a
# continuous/automated dependency of the app itself).
#
# v1 scope deliberately excludes footway/cycleway/path: in Berlin OSM data
# these outnumber named streets ~3:1 (every sidewalk and park path is its
# own way) and would bloat the bundled dataset for little product value in
# an app about "streets you've walked." Named/numbered streets
# (residential/tertiary/secondary/primary/unclassified/living_street/
# pedestrian) are the v1 eligible network; see docs/DECISIONS.md.
set -euo pipefail
cd "$(dirname "$0")"

RAW_DIR="data/raw/streets"
OUT_DIR="output/streets"
mkdir -p "$RAW_DIR" "$OUT_DIR"

UA="DuppyMapDevPipeline/0.1 (one-off personal-gift project dataset build)"
HIGHWAY_FILTER='residential|tertiary|secondary|primary|unclassified|living_street|pedestrian'

DISTRICTS=(
  "Reinickendorf" "Spandau" "Mitte" "Steglitz-Zehlendorf" "Treptow-Köpenick"
  "Friedrichshain-Kreuzberg" "Tempelhof-Schöneberg" "Neukölln"
  "Marzahn-Hellersdorf" "Pankow" "Charlottenburg-Wilmersdorf" "Lichtenberg"
)

for district in "${DISTRICTS[@]}"; do
  slug=$(echo "$district" | tr ' ' '_')
  raw_file="$RAW_DIR/$slug.json"
  out_file="$OUT_DIR/$slug.geojson"
  if [ -f "$out_file" ]; then
    echo "skip $district (already converted)"
    continue
  fi
  echo "fetching $district..."
  curl -sS --fail --max-time 70 -X POST -H "User-Agent: $UA" \
    --data-urlencode "data=[out:json][timeout:60];
area[\"name\"=\"$district\"][\"admin_level\"=\"9\"]->.d;
way[\"highway\"~\"^($HIGHWAY_FILTER)\$\"](area.d);
out geom;" \
    "https://overpass-api.de/api/interpreter" -o "$raw_file"
  node convert-streets.js "$raw_file" "$out_file"
  sleep 3 # be a polite, bounded one-off user of the shared public API
done

echo "Merging all districts into one dataset..."
node merge-streets.js "$OUT_DIR" output/berlin-streets.geojson
cp output/berlin-streets.geojson ../assets/geo/berlin-streets.json

echo "Done. Dataset version/date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
ls -la ../assets/geo/berlin-streets.json
