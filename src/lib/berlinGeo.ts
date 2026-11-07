// Real Berlin administrative boundaries (Phase 2), sourced once from OSM
// via Overpass and bundled statically — see geo-pipeline/ for the fetch +
// convert script and docs/DECISIONS.md for why this is bundled rather than
// served from a live tile/Overpass endpoint. © OpenStreetMap contributors,
// ODbL — attribution is shown in Settings (and must appear on/near the map
// before Phase 6 sign-off).
import { Asset } from 'expo-asset';

import bezirkeGeoJson from '@/assets/geo/berlin-bezirke.json';
import ortsteileGeoJson from '@/assets/geo/berlin-ortsteile.json';

export const berlinBezirke = bezirkeGeoJson as GeoJSON.FeatureCollection;
export const berlinOrtsteile = ortsteileGeoJson as GeoJSON.FeatureCollection;

// v1 eligible street network: named streets only (residential/tertiary/
// secondary/primary/unclassified/living_street/pedestrian) — excludes
// footway/cycleway/path, see docs/DECISIONS.md. 99,186 segments across
// all 12 Bezirke, ~26MB.
//
// Deliberately NOT imported as a JS/JSON module like the two above: at
// this size that OOM-killed the app (Hermes allocating 99k+ Feature
// objects from a parsed JS literal blew past ~1GB resident). Instead it's
// registered as a binary asset (see metro.config.js) and resolved here to
// a local file:// URI, which MapLibre's native GeoJSONSource reads and
// parses directly — the JS side never holds the parsed data at all.
const streetsAssetModule = require('../../assets/geo/berlin-streets.geojson');

export async function getBerlinStreetsUri(): Promise<string> {
  const asset = Asset.fromModule(streetsAssetModule);
  await asset.downloadAsync();
  if (!asset.localUri) {
    throw new Error('Failed to resolve local URI for bundled berlin-streets.geojson');
  }
  return asset.localUri;
}
