// Pure geometry helpers shared by the street graph and matcher (Phase 4).
// No React Native / Expo imports — kept runnable under plain Node so
// these can be unit-tested with vitest without any native environment.

export type LatLon = { lat: number; lon: number };

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Distance from a point to a single line segment [p1, p2], via equirectangular
// projection local to the segment's latitude — accurate enough at Berlin's
// scale (segments are street-length, not continental) and much cheaper than
// true great-circle point-to-line math. Returns both the distance and the
// fraction (0-1) along the segment where the closest point falls, which the
// matcher uses to accumulate covered length.
export function pointToSegmentMeters(p: LatLon, p1: LatLon, p2: LatLon): { distanceM: number; t: number } {
  const latRef = toRad((p1.lat + p2.lat) / 2);
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(latRef);

  const toXY = (pt: LatLon) => ({ x: pt.lon * mPerDegLon, y: pt.lat * mPerDegLat });
  const a = toXY(p1);
  const b = toXY(p2);
  const pt = toXY(p);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  let t = lenSq === 0 ? 0 : ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;
  const distanceM = Math.hypot(pt.x - closestX, pt.y - closestY);
  return { distanceM, t };
}

// Nearest-point-on-polyline distance, scanning every segment of a
// LineString (brute force) — fine at the per-district scale (hundreds to
// a few thousand ways) this is always called at; see docs/DECISIONS.md
// for why that scale, not the full 99k-feature city-wide dataset, is
// what the matcher ever loads into memory.
export function pointToPolylineMeters(p: LatLon, coords: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = { lon: coords[i][0], lat: coords[i][1] };
    const p2 = { lon: coords[i + 1][0], lat: coords[i + 1][1] };
    const { distanceM } = pointToSegmentMeters(p, p1, p2);
    if (distanceM < best) best = distanceM;
  }
  return best;
}

export function polylineLengthMeters(coords: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineMeters({ lat: coords[i][1], lon: coords[i][0] }, { lat: coords[i + 1][1], lon: coords[i + 1][0] });
  }
  return total;
}

// Ray-casting point-in-polygon, handling GeoJSON Polygon (outer ring +
// optional holes) and MultiPolygon. Good enough for "which Bezirk is this
// point in" — Bezirke are simple, non-overlapping administrative areas,
// not a case needing a geodesic-exact library.
export function pointInGeoJSONGeometry(p: LatLon, geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygonRings(p, geometry.coordinates as number[][][]);
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).some((polygon) => pointInPolygonRings(p, polygon));
  }
  return false;
}

function pointInPolygonRings(p: LatLon, rings: number[][][]): boolean {
  if (rings.length === 0) return false;
  const inOuter = pointInRing(p, rings[0]);
  if (!inOuter) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(p, rings[i])) return false; // inside a hole
  }
  return true;
}

function pointInRing(p: LatLon, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Europe/Berlin local calendar date (YYYY-MM-DD) for a UTC timestamp,
// computed manually (CET = UTC+1, CEST = UTC+2, EU rule: last Sunday of
// March 01:00 UTC to last Sunday of October 01:00 UTC) rather than via
// Intl/ICU — plan.md explicitly calls for DST/midnight-boundary
// correctness, and depending on whatever ICU data happens to be compiled
// into this Hermes build is a less testable, less explicit way to get
// there than a small rule this module owns and unit-tests directly.
export function europeBerlinDateKey(utcMs: number): string {
  const offsetHours = isEuropeBerlinDST(utcMs) ? 2 : 1;
  const local = new Date(utcMs + offsetHours * 60 * 60 * 1000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function europeBerlinHour(utcMs: number): number {
  const offsetHours = isEuropeBerlinDST(utcMs) ? 2 : 1;
  return new Date(utcMs + offsetHours * 60 * 60 * 1000).getUTCHours();
}

function lastSundayOfMonthUTC(year: number, month: number): Date {
  // month: 0-indexed (2 = March, 9 = October)
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  const weekday = lastDay.getUTCDay(); // 0 = Sunday
  lastDay.setUTCDate(lastDay.getUTCDate() - weekday);
  return lastDay;
}

function isEuropeBerlinDST(utcMs: number): boolean {
  const year = new Date(utcMs).getUTCFullYear();
  const dstStart = lastSundayOfMonthUTC(year, 2); // last Sunday of March
  dstStart.setUTCHours(1, 0, 0, 0);
  const dstEnd = lastSundayOfMonthUTC(year, 9); // last Sunday of October
  dstEnd.setUTCHours(1, 0, 0, 0);
  return utcMs >= dstStart.getTime() && utcMs < dstEnd.getTime();
}
