const fs = require('fs');
const osmtogeojson = require('osmtogeojson');

const inFile = process.argv[2];
const outFile = process.argv[3];

const osmJson = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const geojson = osmtogeojson(osmJson);

// Keep only the boundary polygons themselves — Overpass/osmtogeojson also
// emits standalone Point features for admin_centre/label nodes referenced
// by the relation, which aren't part of the boundary shape.
geojson.features = geojson.features.filter(
  (f) => (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') && f.properties.name
);

console.log(`features: ${geojson.features.length}`);
for (const f of geojson.features) {
  console.log(' -', f.geometry.type, f.properties.name, `admin_level=${f.properties.admin_level}`);
}

fs.writeFileSync(outFile, JSON.stringify(geojson));
console.log('wrote', outFile);
