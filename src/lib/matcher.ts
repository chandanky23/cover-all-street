// Phase 4: conservative map matching (plan.md "Matching and analytics").
// Pure decision logic lives here and is unit-tested with synthetic
// routes; the only impure parts are the DB reads/writes at the edges.
import {
  europeBerlinDateKey,
  europeBerlinHour,
  pointToPolylineMeters,
  pointToSegmentMeters,
  type LatLon,
} from './geoMath';
import type { StreetFeature } from './streetGraph';

export type MatchCandidate = {
  segment: StreetFeature;
  distanceM: number;
  secondDistanceM: number;
};

// Best street for a point, plus how far the nearest *different* street is.
// Another piece of the same street (OSM splits streets at junctions, and
// dual carriageways share a name) is not a competing answer, so it does
// not make the match "ambiguous".
export function nearestCandidate(streets: StreetFeature[], p: LatLon): MatchCandidate | null {
  let best: StreetFeature | null = null;
  let bestDist = Infinity;
  const dists = new Array<number>(streets.length);
  for (let i = 0; i < streets.length; i++) {
    const d = pointToPolylineMeters(p, streets[i].coords);
    dists[i] = d;
    if (d < bestDist) {
      bestDist = d;
      best = streets[i];
    }
  }
  if (!best) return null;
  let secondDist = Infinity;
  for (let i = 0; i < streets.length; i++) {
    const s = streets[i];
    if (s === best) continue;
    if (best.name !== null && s.name === best.name) continue;
    if (dists[i] < secondDist) secondDist = dists[i];
  }
  return { segment: best, distanceM: bestDist, secondDistanceM: secondDist };
}

export type MatchDecision =
  | { matched: true; segmentId: string; distanceM: number; t: number }
  | { matched: false; reason: 'too_far' | 'ambiguous' };

// plan.md: "If map matching is uncertain, don't count the segment" and
// "avoid counting parallel streets from noisy GPS." Two independent
// conservative checks:
//  - too_far: nothing is close enough to plausibly be the street the
//    user is actually on (GPS accuracy at pedestrian scale is commonly
//    5-20m; 25m gives headroom without being so loose it snaps a point
//    on one street onto a different one two streets over).
//  - ambiguous: the best and second-best candidates are nearly tied,
//    e.g. two parallel residential streets a GPS fix can't distinguish —
//    guessing which one is exactly the kind of invented-connector
//    mistake plan.md says not to make.
const MAX_MATCH_DISTANCE_M = 25;
const AMBIGUITY_MARGIN_M = 8;

export function decideMatch(point: LatLon, candidate: MatchCandidate | null): MatchDecision {
  if (!candidate || candidate.distanceM > MAX_MATCH_DISTANCE_M) {
    return { matched: false, reason: 'too_far' };
  }
  if (candidate.secondDistanceM - candidate.distanceM < AMBIGUITY_MARGIN_M) {
    return { matched: false, reason: 'ambiguous' };
  }
  const coords = candidate.segment.coords;
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = { lon: coords[i][0], lat: coords[i][1] };
    const p2 = { lon: coords[i + 1][0], lat: coords[i + 1][1] };
    const { distanceM, t } = pointToSegmentMeters(point, p1, p2);
    if (distanceM < bestD) {
      bestD = distanceM;
      // t is local to this sub-segment; approximate the whole-polyline
      // fraction by blending in which sub-segment index this is.
      bestT = (i + t) / (coords.length - 1);
    }
  }
  return { matched: true, segmentId: candidate.segment.id, distanceM: candidate.distanceM, t: bestT };
}

export type SegmentVisitUpdate = {
  segmentId: string;
  firstSeen: number;
  lastSeen: number;
  coveredLengthM: number;
  visitDays: Set<string>;
  traversalCount: number;
};

// Folds a sequence of (already-validated, already-matched) observations
// into per-segment rollups. Traversal counting is deliberately simple
// for v1: each new visit-day touching a segment counts as one traversal
// — plan.md's "Mode: walking/biking/driving classification is uncertain;
// for v1 label metric as 'streets travelled'" already warns against
// inferring more than the data supports, and the same caution applies to
// counting multiple back-and-forth passes within a single walk as
// several "traversals" when a GPS trace alone can't reliably distinguish
// that from one continuous pass with jitter.
export function foldMatchedObservations(
  observations: { ts: number; segmentId: string; t: number; segmentLengthM: number }[]
): Map<string, SegmentVisitUpdate> {
  const bySegment = new Map<string, SegmentVisitUpdate>();
  const traversalDayBySegment = new Map<string, Set<string>>();

  const sorted = [...observations].sort((a, b) => a.ts - b.ts);
  for (const obs of sorted) {
    const dayKey = europeBerlinDateKey(obs.ts);
    let entry = bySegment.get(obs.segmentId);
    if (!entry) {
      entry = {
        segmentId: obs.segmentId,
        firstSeen: obs.ts,
        lastSeen: obs.ts,
        coveredLengthM: 0,
        visitDays: new Set(),
        traversalCount: 0,
      };
      bySegment.set(obs.segmentId, entry);
    }
    entry.firstSeen = Math.min(entry.firstSeen, obs.ts);
    entry.lastSeen = Math.max(entry.lastSeen, obs.ts);
    entry.visitDays.add(dayKey);

    // Covered length: track the furthest fraction-along-segment reached
    // on each visit-day, conservatively approximated as the max t seen
    // that day times the segment length (never claims more coverage
    // than the matched points actually reached).
    const maxTSoFar = entry.coveredLengthM / obs.segmentLengthM || 0;
    if (obs.t > maxTSoFar) {
      entry.coveredLengthM = obs.t * obs.segmentLengthM;
    }

    let days = traversalDayBySegment.get(obs.segmentId);
    if (!days) {
      days = new Set();
      traversalDayBySegment.set(obs.segmentId, days);
    }
    if (!days.has(dayKey)) {
      days.add(dayKey);
      entry.traversalCount += 1;
    }
  }

  return bySegment;
}

// A new "pass" over a street starts when there is a gap of at least this
// long since the last matched point on it (walked it, left, came back).
// Shorter gaps are the same pass (slow walking, a pause at a light).
export const PASS_GAP_MS = 10 * 60 * 1000;

export type DayStat = {
  passes: number;
  firstTs: number;
  lastTs: number;
  coveredM: number;
};

// One segment's matched points -> per-Berlin-day stats: how many separate
// passes, the furthest point reached, and activity per hour of day.
export function foldDayStats(
  points: { ts: number; t: number; segmentLengthM: number }[],
  gapMs: number = PASS_GAP_MS
): { days: Map<string, DayStat>; hours: Map<string, number> } {
  const days = new Map<string, DayStat>();
  const hours = new Map<string, number>();
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  for (const p of sorted) {
    const day = europeBerlinDateKey(p.ts);
    const hourKey = `${day}|${europeBerlinHour(p.ts)}`;
    hours.set(hourKey, (hours.get(hourKey) ?? 0) + 1);
    const covered = p.t * p.segmentLengthM;
    const cur = days.get(day);
    if (!cur) {
      days.set(day, { passes: 1, firstTs: p.ts, lastTs: p.ts, coveredM: covered });
    } else {
      if (p.ts - cur.lastTs >= gapMs) cur.passes += 1;
      cur.lastTs = p.ts;
      cur.coveredM = Math.max(cur.coveredM, covered);
    }
  }
  return { days, hours };
}

// Merge a new batch's stat for a day into what is already stored, so a
// pass that straddles two matcher runs is not double counted.
export function mergeDayStat(
  existing: { passes: number; lastTs: number; coveredM: number } | null,
  incoming: DayStat,
  gapMs: number = PASS_GAP_MS
): { passes: number; lastTs: number; coveredM: number } {
  if (!existing) return { passes: incoming.passes, lastTs: incoming.lastTs, coveredM: incoming.coveredM };
  const continues = incoming.firstTs - existing.lastTs < gapMs;
  return {
    passes: existing.passes + incoming.passes - (continues ? 1 : 0),
    lastTs: Math.max(existing.lastTs, incoming.lastTs),
    coveredM: Math.max(existing.coveredM, incoming.coveredM),
  };
}
