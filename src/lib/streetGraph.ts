// Lazy, per-district street graph for Phase 4 matching. Deliberately
// NOT the full 99,186-feature `assets/geo/berlin-streets.geojson` used
// for map rendering — parsing that whole file into JS once already
// OOM-killed the app (see docs/DECISIONS.md, Phase 2). The matcher only
// ever needs streets near the user's current position, so it loads one
// Bezirk's streets (a few hundred to ~4,500 ways, under 5MB) at a time
// from the same per-district files the original fetch pipeline produced
// before merging them for the map — see geo-pipeline/output/streets/.
import { Asset } from 'expo-asset';

import { berlinBezirke, berlinOrtsteile } from './berlinGeo';
import { pointInGeoJSONGeometry, polylineLengthMeters, type LatLon } from './geoMath';
import { nearestCandidate } from './matcher';

export type StreetFeature = {
  id: string;
  name: string | null;
  highway: string;
  coords: [number, number][];
};

// Static, enumerable require() calls — Metro needs the literal path at
// each call site to include these in the bundle; a dynamically built
// path string (e.g. `require(`.../${district}.geojson`)`) will not work.
const districtStreetModules: Record<string, number> = {
  'Charlottenburg-Wilmersdorf': require('../../assets/geo/streets-by-district/Charlottenburg-Wilmersdorf.geojson'),
  'Friedrichshain-Kreuzberg': require('../../assets/geo/streets-by-district/Friedrichshain-Kreuzberg.geojson'),
  Lichtenberg: require('../../assets/geo/streets-by-district/Lichtenberg.geojson'),
  'Marzahn-Hellersdorf': require('../../assets/geo/streets-by-district/Marzahn-Hellersdorf.geojson'),
  Mitte: require('../../assets/geo/streets-by-district/Mitte.geojson'),
  Neukölln: require('../../assets/geo/streets-by-district/Neukölln.geojson'),
  Pankow: require('../../assets/geo/streets-by-district/Pankow.geojson'),
  Reinickendorf: require('../../assets/geo/streets-by-district/Reinickendorf.geojson'),
  Spandau: require('../../assets/geo/streets-by-district/Spandau.geojson'),
  'Steglitz-Zehlendorf': require('../../assets/geo/streets-by-district/Steglitz-Zehlendorf.geojson'),
  'Tempelhof-Schöneberg': require('../../assets/geo/streets-by-district/Tempelhof-Schöneberg.geojson'),
  'Treptow-Köpenick': require('../../assets/geo/streets-by-district/Treptow-Köpenick.geojson'),
};

const districtCache = new Map<string, Promise<StreetFeature[]>>();

async function loadDistrictStreets(district: string): Promise<StreetFeature[]> {
  const cached = districtCache.get(district);
  if (cached) return cached;

  const moduleRef = districtStreetModules[district];
  const promise = (async () => {
    if (!moduleRef) return [];
    const asset = Asset.fromModule(moduleRef);
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error(`Failed to resolve local URI for ${district} streets`);
    const response = await fetch(asset.localUri);
    const geojson: GeoJSON.FeatureCollection = await response.json();
    const features: StreetFeature[] = [];
    for (const f of geojson.features) {
      if (f.geometry.type !== 'LineString') continue;
      features.push({
        id: String(f.properties?.id ?? f.id),
        name: f.properties?.name ?? null,
        highway: f.properties?.highway ?? 'unclassified',
        coords: f.geometry.coordinates as [number, number][],
      });
    }
    return features;
  })();
  districtCache.set(district, promise);
  return promise;
}

// Which Bezirk (by name, matching assets/geo/berlin-bezirke.json) a point
// falls in, or null if it's outside all 12 (e.g. a lake, or just outside
// the city boundary — a real GPS point can land there).
export function findDistrictForPoint(p: LatLon): string | null {
  for (const f of berlinBezirke.features) {
    if (pointInGeoJSONGeometry(p, f.geometry)) {
      return String(f.properties?.name ?? '');
    }
  }
  return null;
}

// Same idea one level more granular, for Ortsteil-level area_visits —
// Ortsteile don't have their own street-length breakdown (see
// getDistrictTotalLengthM below), but "was the user ever here at all"
// is still real, useful, and cheap: just another point-in-polygon check
// against boundaries already bundled for map rendering.
export function findOrtsteilForPoint(p: LatLon): string | null {
  for (const f of berlinOrtsteile.features) {
    if (pointInGeoJSONGeometry(p, f.geometry)) {
      return String(f.properties?.name ?? '');
    }
  }
  return null;
}

// Real eligible length for a Bezirk (plan.md's coverage % denominator),
// summed once at seed time from the same bundled per-district file the
// matcher itself loads — not a guessed or hardcoded number. Ortsteile
// have no equivalent (no per-Ortsteil street breakdown exists), which is
// why only Bezirke get a real numeric coverage % — see docs/STATUS.md.
export async function getDistrictTotalLengthM(district: string): Promise<number> {
  const streets = await loadDistrictStreets(district);
  let total = 0;
  for (const street of streets) total += polylineLengthMeters(street.coords);
  return total;
}

export type NearestSegmentResult = {
  segment: StreetFeature;
  distanceM: number;
  // Distance of the second-closest candidate — the matcher uses the gap
  // between best and second-best to decide whether the match is
  // confident or too ambiguous to count (plan.md: "avoid counting
  // parallel streets from noisy GPS").
  secondDistanceM: number;
};

// Loads the point's own district plus its immediate neighbours isn't
// done here (v1 simplification, documented in docs/STATUS.md): a point
// very close to a Bezirk border can miss a nearer segment that happens
// to sit just across that border in a different district's file. Streets
// are typically hundreds of meters to kilometers from a border relative
// to their own length, so this is a narrow edge case, not a systematic
// error — tracked as a known limitation rather than solved by loading
// multiple districts per point and multiplying memory cost.
export async function findNearestSegment(p: LatLon, maxDistanceM: number): Promise<NearestSegmentResult | null> {
  const district = findDistrictForPoint(p);
  if (!district) return null;
  const streets = await loadDistrictStreets(district);

  const candidate = nearestCandidate(streets, p);
  if (!candidate || candidate.distanceM > maxDistanceM) return null;
  return candidate;
}
