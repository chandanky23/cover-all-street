// Impure glue between the pure decision logic (matcher.ts, geoMath.ts)
// and SQLite/the street graph. Kept separate from matcher.ts so the
// decision logic itself stays trivially unit-testable with no DB or
// asset loading involved.
import { berlinBezirke, berlinOrtsteile } from './berlinGeo';
import {
  addActivityHours,
  getLatestJourneyState,
  getSetting,
  getUnprocessedObservations,
  markObservationsProcessed,
  saveJourneyStates,
  setSetting,
  upsertAreaVisit,
  upsertSegmentVisit,
} from './db';
import { europeBerlinDateKey, polylineLengthMeters } from './geoMath';
import { foldIntoJourneys } from './journeys';
import { decideMatch, foldDayStats } from './matcher';
import { findDistrictForPoint, findNearestSegment, findOrtsteilForPoint } from './streetGraph';

const MAX_MATCH_DISTANCE_M = 40; // search radius for candidates; decideMatch applies the stricter accept threshold

// Throttled the same way as purgeOldObservations — matching (district
// lookup + per-district polyline scan) is real CPU work, not worth doing
// on every single location callback when a short batching delay costs
// nothing the user would notice.
const MATCH_INTERVAL_MS = 2 * 60 * 1000;

export async function maybeRunMatcher() {
  const lastRunRaw = await getSetting('matcher_last_run_ts');
  const lastRun = lastRunRaw ? Number(lastRunRaw) : 0;
  const now = Date.now();
  if (now - lastRun < MATCH_INTERVAL_MS) return;
  await setSetting('matcher_last_run_ts', String(now));
  await runMatcherBatch();
}

const segmentLengthCache = new Map<string, number>();

type SegmentHit = {
  lengthM: number;
  name: string | null;
  highway: string;
  bezirkAreaId: string | null;
  points: { ts: number; segmentId: string; t: number; segmentLengthM: number }[];
};

export async function runMatcherBatch(batchSize = 500) {
  const observations = await getUnprocessedObservations(batchSize);
  if (observations.length === 0) return;

  const segmentHits = new Map<string, SegmentHit>();
  const areaHits = new Map<string, { ts: number; dayKey: string }[]>();
  const processedIds: number[] = [];

  for (const obs of observations) {
    processedIds.push(obs.id);
    const point = { lat: obs.lat, lon: obs.lon };
    const dayKey = europeBerlinDateKey(obs.ts);

    // Bezirk and Ortsteil are independent point-in-polygon checks (one
    // Bezirk contains several Ortsteile) — both get their own area_visits
    // row so tapping either granularity on the map shows real data.
    const district = findDistrictForPoint(point);
    if (district) {
      const list = areaHits.get(district) ?? [];
      list.push({ ts: obs.ts, dayKey });
      areaHits.set(district, list);
    }
    const ortsteil = findOrtsteilForPoint(point);
    if (ortsteil) {
      const list = areaHits.get(ortsteil) ?? [];
      list.push({ ts: obs.ts, dayKey });
      areaHits.set(ortsteil, list);
    }

    const candidate = await findNearestSegment(point, MAX_MATCH_DISTANCE_M);
    const decision = decideMatch(point, candidate);
    if (!decision.matched || !candidate) continue;

    let lengthM = segmentLengthCache.get(decision.segmentId);
    if (lengthM === undefined) {
      lengthM = polylineLengthMeters(candidate.segment.coords);
      segmentLengthCache.set(decision.segmentId, lengthM);
    }

    const entry =
      segmentHits.get(decision.segmentId) ??
      ({
        lengthM,
        name: candidate.segment.name,
        highway: candidate.segment.highway,
        bezirkAreaId: district ? await resolveAreaId(district) : null,
        points: [],
      } satisfies SegmentHit);
    entry.points.push({ ts: obs.ts, segmentId: decision.segmentId, t: decision.t, segmentLengthM: lengthM });
    segmentHits.set(decision.segmentId, entry);
  }

  const hourTotals = new Map<string, number>();
  for (const [segmentId, hit] of segmentHits) {
    const { days, hours } = foldDayStats(hit.points);
    for (const [k, n] of hours) hourTotals.set(k, (hourTotals.get(k) ?? 0) + n);
    const tss = hit.points.map((p) => p.ts);
    let coveredM = 0;
    for (const d of days.values()) coveredM = Math.max(coveredM, d.coveredM);
    await upsertSegmentVisit(
      segmentId,
      Math.min(...tss),
      Math.max(...tss),
      coveredM,
      days,
      hit.name,
      hit.highway,
      hit.bezirkAreaId
    );
  }
  await addActivityHours(hourTotals);

  for (const [areaName, hits] of areaHits) {
    const areaId = await resolveAreaId(areaName);
    if (!areaId) continue;
    const firstSeen = Math.min(...hits.map((h) => h.ts));
    const lastSeen = Math.max(...hits.map((h) => h.ts));
    const dayKeys = [...new Set(hits.map((h) => h.dayKey))];
    await upsertAreaVisit(areaId, firstSeen, lastSeen, dayKeys);
  }

  // Journeys are built from every stored (moving) fix, matched to a street
  // or not. A failure here must not block marking the batch processed, or
  // the street stats above would be counted twice on the next run.
  try {
    const last = await getLatestJourneyState();
    const { states, extendedFirst } = foldIntoJourneys(
      last,
      observations.map((o) => ({ ts: o.ts, lat: o.lat, lon: o.lon }))
    );
    await saveJourneyStates(states, extendedFirst);
  } catch (e) {
    console.warn('[duppy-map] could not update journeys', e);
  }

  await markObservationsProcessed(processedIds);
}

const areaIdByName = new Map<string, string>();
async function resolveAreaId(name: string): Promise<string | null> {
  if (areaIdByName.size === 0) {
    for (const f of [...berlinBezirke.features, ...berlinOrtsteile.features]) {
      const n = f.properties?.name;
      const id = f.properties?.id ?? f.id;
      if (n && id) areaIdByName.set(String(n), String(id));
    }
  }
  return areaIdByName.get(name) ?? null;
}
