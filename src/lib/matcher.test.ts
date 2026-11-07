import { describe, expect, it } from 'vitest';

import { europeBerlinDateKey, polylineLengthMeters } from './geoMath';
import {
  PASS_GAP_MS,
  decideMatch,
  foldDayStats,
  foldMatchedObservations,
  mergeDayStat,
  type MatchCandidate,
} from './matcher';
import type { StreetFeature } from './streetGraph';

function makeStreet(id: string, coords: [number, number][]): StreetFeature {
  return { id, name: `Test Street ${id}`, highway: 'residential', coords };
}

// A straight ~220m street running east along lat 52.520.
const mainStreet = makeStreet('way/1', [
  [13.400, 52.520],
  [13.401, 52.520],
  [13.402, 52.520],
  [13.403, 52.520],
]);

// A parallel street only ~5m north — close enough that a noisy GPS fix
// right between them genuinely can't tell which one the walker is on.
const parallelStreet = makeStreet('way/2', [
  [13.400, 52.52005],
  [13.401, 52.52005],
  [13.402, 52.52005],
  [13.403, 52.52005],
]);

describe('decideMatch', () => {
  it('matches a point sitting right on the street', () => {
    const candidate: MatchCandidate = { segment: mainStreet, distanceM: 1, secondDistanceM: 40 };
    const decision = decideMatch({ lat: 52.520, lon: 13.4015 }, candidate);
    expect(decision.matched).toBe(true);
    if (decision.matched) {
      expect(decision.segmentId).toBe('way/1');
      expect(decision.t).toBeGreaterThan(0.4);
      expect(decision.t).toBeLessThan(0.6);
    }
  });

  it('rejects a point too far from anything (open park, GPS drift)', () => {
    const candidate: MatchCandidate = { segment: mainStreet, distanceM: 60, secondDistanceM: 120 };
    const decision = decideMatch({ lat: 52.5215, lon: 13.4015 }, candidate);
    expect(decision).toEqual({ matched: false, reason: 'too_far' });
  });

  it('rejects an ambiguous point between two close parallel streets rather than guessing', () => {
    // Genuinely between mainStreet and parallelStreet, ~2.5m from each.
    const candidate: MatchCandidate = { segment: mainStreet, distanceM: 2.8, secondDistanceM: 2.9 };
    const decision = decideMatch({ lat: 52.520025, lon: 13.4015 }, candidate);
    expect(decision).toEqual({ matched: false, reason: 'ambiguous' });
  });

  it('confidently matches when the second-best candidate is clearly a different, farther street', () => {
    const candidate: MatchCandidate = { segment: mainStreet, distanceM: 3, secondDistanceM: 45 };
    const decision = decideMatch({ lat: 52.520025, lon: 13.4015 }, candidate);
    expect(decision.matched).toBe(true);
  });

  it('clamps t to the segment bounds for a point beyond the last vertex', () => {
    const candidate: MatchCandidate = { segment: mainStreet, distanceM: 2, secondDistanceM: 50 };
    const decision = decideMatch({ lat: 52.52, lon: 13.41 }, candidate);
    expect(decision.matched).toBe(true);
    if (decision.matched) expect(decision.t).toBeLessThanOrEqual(1);
  });
});

describe('foldMatchedObservations', () => {
  const segmentLengthM = polylineLengthMeters(mainStreet.coords);

  it('accumulates covered length up to the furthest point reached, not past it', () => {
    const day1 = Date.UTC(2026, 5, 1, 10, 0);
    const result = foldMatchedObservations([
      { ts: day1, segmentId: 'way/1', t: 0.2, segmentLengthM },
      { ts: day1 + 60_000, segmentId: 'way/1', t: 0.8, segmentLengthM },
      { ts: day1 + 120_000, segmentId: 'way/1', t: 0.5, segmentLengthM }, // walked back partway — shouldn't reduce coverage
    ]);
    const entry = result.get('way/1')!;
    expect(entry.coveredLengthM).toBeCloseTo(0.8 * segmentLengthM, 1);
  });

  it('counts one traversal per distinct visit-day touching a segment, not per observation', () => {
    const day1 = Date.UTC(2026, 5, 1, 9, 0);
    const result = foldMatchedObservations([
      { ts: day1, segmentId: 'way/1', t: 0.1, segmentLengthM },
      { ts: day1 + 10_000, segmentId: 'way/1', t: 0.2, segmentLengthM },
      { ts: day1 + 20_000, segmentId: 'way/1', t: 0.3, segmentLengthM },
    ]);
    expect(result.get('way/1')!.traversalCount).toBe(1);
  });

  it('counts a second traversal on a later distinct visit-day', () => {
    const day1 = Date.UTC(2026, 5, 1, 9, 0);
    const day2 = Date.UTC(2026, 5, 3, 9, 0);
    const result = foldMatchedObservations([
      { ts: day1, segmentId: 'way/1', t: 0.1, segmentLengthM },
      { ts: day2, segmentId: 'way/1', t: 0.1, segmentLengthM },
    ]);
    const entry = result.get('way/1')!;
    expect(entry.traversalCount).toBe(2);
    expect(entry.visitDays.size).toBe(2);
    expect(entry.visitDays.has(europeBerlinDateKey(day1))).toBe(true);
    expect(entry.visitDays.has(europeBerlinDateKey(day2))).toBe(true);
  });

  it('tracks first_seen/last_seen across out-of-order input', () => {
    const early = Date.UTC(2026, 5, 1, 9, 0);
    const late = Date.UTC(2026, 5, 5, 9, 0);
    const result = foldMatchedObservations([
      { ts: late, segmentId: 'way/1', t: 0.1, segmentLengthM },
      { ts: early, segmentId: 'way/1', t: 0.1, segmentLengthM },
    ]);
    const entry = result.get('way/1')!;
    expect(entry.firstSeen).toBe(early);
    expect(entry.lastSeen).toBe(late);
  });

  it('keeps separate rollups per segment', () => {
    const ts = Date.UTC(2026, 5, 1, 9, 0);
    const result = foldMatchedObservations([
      { ts, segmentId: 'way/1', t: 0.5, segmentLengthM },
      { ts, segmentId: 'way/2', t: 0.9, segmentLengthM },
    ]);
    expect(result.size).toBe(2);
    expect(result.has('way/1')).toBe(true);
    expect(result.has('way/2')).toBe(true);
  });
});

describe('foldDayStats / mergeDayStat', () => {
  const MIN = 60 * 1000;
  const base = Date.UTC(2026, 10, 7, 9, 0); // 10:00 Berlin (CET)
  const pt = (offsetMin: number, t = 0.5) => ({ ts: base + offsetMin * MIN, t, segmentLengthM: 100 });

  it('one continuous walk is one pass', () => {
    const { days } = foldDayStats([pt(0), pt(1), pt(2), pt(3)]);
    expect([...days.values()][0].passes).toBe(1);
  });
  it('leaving and coming back later the same day is a second pass', () => {
    const { days } = foldDayStats([pt(0), pt(1), pt(45), pt(46)]);
    expect([...days.values()][0].passes).toBe(2);
  });
  it('passes on different Berlin days are tracked separately', () => {
    const next = { ts: base + 24 * 60 * MIN, t: 0.5, segmentLengthM: 100 };
    const { days } = foldDayStats([pt(0), next]);
    expect(days.size).toBe(2);
  });
  it('counts activity by Berlin hour', () => {
    const { hours } = foldDayStats([pt(0), pt(5), pt(70)]);
    expect(hours.get('2026-11-07|10')).toBe(2);
    expect(hours.get('2026-11-07|11')).toBe(1);
  });
  it('merging a continuing pass does not double count', () => {
    const a = foldDayStats([pt(0), pt(1)]).days.values().next().value!;
    const b = foldDayStats([pt(3), pt(4)]).days.values().next().value!;
    const merged = mergeDayStat({ passes: a.passes, lastTs: a.lastTs, coveredM: a.coveredM }, b);
    expect(merged.passes).toBe(1);
  });
  it('merging after a long gap adds a pass', () => {
    const a = foldDayStats([pt(0), pt(1)]).days.values().next().value!;
    const b = foldDayStats([pt(60), pt(61)]).days.values().next().value!;
    const merged = mergeDayStat({ passes: a.passes, lastTs: a.lastTs, coveredM: a.coveredM }, b);
    expect(merged.passes).toBe(2);
  });
  it('gap threshold is 10 minutes', () => {
    expect(PASS_GAP_MS).toBe(10 * 60 * 1000);
  });
});
