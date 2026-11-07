const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const outFile = process.argv[3];

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.geojson'));
const merged = { type: 'FeatureCollection', features: [] };
const seenIds = new Set();

for (const f of files) {
  const fc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const feature of fc.features) {
    // Ways that sit on a district border can be returned by more than one
    // district query — dedupe by OSM id so we don't double-count them.
    if (seenIds.has(feature.properties.id)) continue;
    seenIds.add(feature.properties.id);
    merged.features.push(feature);
  }
}

fs.writeFileSync(outFile, JSON.stringify(merged));
console.log(`merged ${merged.features.length} unique street features from ${files.length} districts into ${outFile}`);
