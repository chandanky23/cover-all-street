const fs = require('fs');
const osmtogeojson = require('osmtogeojson');

const inFile = process.argv[2];
const outFile = process.argv[3];
// Optional: round coordinates to this many decimal places to cut size.
// 5 decimals ≈ 1.1m precision — plenty for street-level rendering/matching,
// well under GPS accuracy itself.
const PRECISION = 5;

function round(n) {
  return Math.round(n * 10 ** PRECISION) / 10 ** PRECISION;
}

function roundCoords(coords) {
  if (typeof coords[0] === 'number') return coords.map(round);
  return coords.map(roundCoords);
}

const osmJson = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const geojson = osmtogeojson(osmJson);

geojson.features = geojson.features
  .filter((f) => (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') && f.properties.highway)
  .map((f) => {
    f.geometry.coordinates = roundCoords(f.geometry.coordinates);
    // Keep only the fields the app actually needs — strips a long tail of
    // incidental OSM tags (surface, lit, maxspeed, etc.) that would
    // otherwise bloat the bundled dataset for no product value.
    f.properties = {
      id: f.id,
      name: f.properties.name ?? null,
      highway: f.properties.highway,
    };
    return f;
  });

console.log(`features: ${geojson.features.length}`);
fs.writeFileSync(outFile, JSON.stringify(geojson));
console.log('wrote', outFile);
