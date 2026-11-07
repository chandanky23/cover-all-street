import { haversineMeters } from './geoMath';

// A journey is a run of recorded fixes with no pause of JOURNEY_GAP_MS or
// more. Stationary fixes are never stored (fixFilter.ts), so a long stop
// naturally ends one journey and the next movement starts another.
export const JOURNEY_GAP_MS = 10 * 60 * 1000;
export const MIN_SHOWN_DISTANCE_M = 300;
export const MIN_SHOWN_DURATION_MS = 3 * 60 * 1000;
const MEDIUM_SPEED_MPS = 2.2; // ~8 km/h: faster than a walk
const FAST_SPEED_MPS = 6; // ~22 km/h: faster than most cycling
const PATH_POINT_SPACING_M = 40;
const MAX_PATH_POINTS = 400;

export type Mode = 'walk' | 'bike' | 'bus' | 'tram' | 'metro' | 'train' | 'car' | 'other';

export const MODES: { mode: Mode; label: string }[] = [
  { mode: 'walk', label: 'Walking' },
  { mode: 'bike', label: 'Cycling' },
  { mode: 'bus', label: 'Bus' },
  { mode: 'tram', label: 'Tram' },
  { mode: 'metro', label: 'U-Bahn / S-Bahn' },
  { mode: 'train', label: 'Train' },
  { mode: 'car', label: 'Car / taxi' },
  { mode: 'other', label: 'Other' },
];

export function modeLabel(mode: Mode | string | null): string {
  return MODES.find((m) => m.mode === mode)?.label ?? 'Not tagged';
}

export type JourneyState = {
  startTs: number;
  endTs: number;
  distanceM: number;
  mediumM: number;
  fastM: number;
  pointCount: number;
  lastLat: number;
  lastLon: number;
  path: [number, number][]; // [lat, lon], thinned for a route preview
};

export type Fix = { ts: number; lat: number; lon: number };

function newJourney(p: Fix): JourneyState {
  return {
    startTs: p.ts,
    endTs: p.ts,
    distanceM: 0,
    mediumM: 0,
    fastM: 0,
    pointCount: 1,
    lastLat: p.lat,
    lastLon: p.lon,
    path: [[p.lat, p.lon]],
  };
}

// Folds time-ordered fixes into journeys. If `last` is given and the first
// fix continues it, that journey is extended (states[0], extendedFirst =
// true) so a journey spanning two matcher runs is not split or doubled.
export function foldIntoJourneys(
  last: JourneyState | null,
  fixes: Fix[]
): { states: JourneyState[]; extendedFirst: boolean } {
  const sorted = [...fixes].sort((a, b) => a.ts - b.ts);
  const states: JourneyState[] = [];
  let cur: JourneyState | null = null;
  let extendedFirst = false;

  for (const p of sorted) {
    if (!cur && last && p.ts - last.endTs < JOURNEY_GAP_MS && p.ts >= last.endTs) {
      cur = { ...last, path: [...last.path] };
      states.push(cur);
      extendedFirst = true;
    }
    if (!cur || p.ts - cur.endTs >= JOURNEY_GAP_MS) {
      cur = newJourney(p);
      states.push(cur);
      continue;
    }
    const d = haversineMeters({ lat: cur.lastLat, lon: cur.lastLon }, { lat: p.lat, lon: p.lon });
    const dt = (p.ts - cur.endTs) / 1000;
    if (dt > 0) {
      const speed = d / dt;
      if (speed >= FAST_SPEED_MPS) cur.fastM += d;
      else if (speed >= MEDIUM_SPEED_MPS) cur.mediumM += d;
    }
    cur.distanceM += d;
    cur.endTs = p.ts;
    cur.pointCount += 1;
    cur.lastLat = p.lat;
    cur.lastLon = p.lon;
    const tail = cur.path[cur.path.length - 1];
    if (
      cur.path.length < MAX_PATH_POINTS &&
      haversineMeters({ lat: tail[0], lon: tail[1] }, { lat: p.lat, lon: p.lon }) >= PATH_POINT_SPACING_M
    ) {
      cur.path.push([p.lat, p.lon]);
    }
  }
  return { states, extendedFirst };
}

export function isWorthShowing(j: { distanceM: number; startTs: number; endTs: number }): boolean {
  return j.distanceM >= MIN_SHOWN_DISTANCE_M && j.endTs - j.startTs >= MIN_SHOWN_DURATION_MS;
}

// A speed-based hint only: the app cannot tell a bus from a train from a
// car, so it suggests walking, cycling, or "a vehicle" and lets the person
// choose the exact mode.
export type Suggestion = 'walk' | 'bike' | 'vehicle';
export function suggestMode(j: { distanceM: number; mediumM: number; fastM: number }): Suggestion {
  if (j.distanceM <= 0) return 'walk';
  if (j.fastM / j.distanceM >= 0.4) return 'vehicle';
  if ((j.mediumM + j.fastM) / j.distanceM >= 0.5) return 'bike';
  return 'walk';
}

export function suggestionLabel(s: Suggestion): string {
  return s === 'walk' ? 'Looks like walking' : s === 'bike' ? 'Looks like cycling' : 'Looks like a vehicle';
}
