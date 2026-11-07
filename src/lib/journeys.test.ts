import { describe, expect, it } from 'vitest';

import { foldIntoJourneys, isWorthShowing, modeLabel, suggestMode } from './journeys';

const T0 = Date.UTC(2026, 10, 7, 9, 0, 0);
const M = 1 / 111_000; // ~1 m of latitude
// A straight line north at `speed` m/s sampled every `step` seconds.
function line(startTs: number, n: number, speed: number, step = 10, startLat = 52.5) {
  return Array.from({ length: n }, (_, i) => ({
    ts: startTs + i * step * 1000,
    lat: startLat + i * step * speed * M,
    lon: 13.4,
  }));
}

describe('foldIntoJourneys', () => {
  it('one continuous walk is one journey with sensible distance', () => {
    const { states } = foldIntoJourneys(null, line(T0, 60, 1.3));
    expect(states).toHaveLength(1);
    expect(states[0].distanceM).toBeGreaterThan(740);
    expect(states[0].distanceM).toBeLessThan(790);
  });
  it('a pause of 10+ minutes starts a new journey', () => {
    const a = line(T0, 10, 1.3);
    const b = line(T0 + 40 * 60 * 1000, 10, 1.3);
    expect(foldIntoJourneys(null, [...a, ...b]).states).toHaveLength(2);
  });
  it('extends the previous journey across two runs without doubling it', () => {
    const all = line(T0, 40, 1.3);
    const whole = foldIntoJourneys(null, all).states[0];
    const first = foldIntoJourneys(null, all.slice(0, 20)).states[0];
    const { states, extendedFirst } = foldIntoJourneys(first, all.slice(20));
    expect(extendedFirst).toBe(true);
    expect(states).toHaveLength(1);
    expect(states[0].distanceM).toBeCloseTo(whole.distanceM, 0);
    expect(states[0].startTs).toBe(whole.startTs);
  });
  it('a new run after a long gap does not extend the old journey', () => {
    const first = foldIntoJourneys(null, line(T0, 10, 1.3)).states[0];
    const { states, extendedFirst } = foldIntoJourneys(first, line(T0 + 3600_000, 10, 1.3));
    expect(extendedFirst).toBe(false);
    expect(states).toHaveLength(1);
    expect(states[0].startTs).toBe(T0 + 3600_000);
  });
  it('keeps a thinned route preview', () => {
    const { states } = foldIntoJourneys(null, line(T0, 120, 1.3));
    expect(states[0].path.length).toBeGreaterThan(5);
    expect(states[0].path.length).toBeLessThan(states[0].pointCount);
  });
});

describe('suggestMode', () => {
  it('walk / bike / vehicle by speed', () => {
    expect(suggestMode(foldIntoJourneys(null, line(T0, 60, 1.3)).states[0])).toBe('walk');
    expect(suggestMode(foldIntoJourneys(null, line(T0, 60, 4)).states[0])).toBe('bike');
    expect(suggestMode(foldIntoJourneys(null, line(T0, 60, 12)).states[0])).toBe('vehicle');
  });
});

describe('isWorthShowing / modeLabel', () => {
  it('hides tiny journeys', () => {
    expect(isWorthShowing({ distanceM: 120, startTs: 0, endTs: 600_000 })).toBe(false);
    expect(isWorthShowing({ distanceM: 900, startTs: 0, endTs: 60_000 })).toBe(false);
    expect(isWorthShowing({ distanceM: 900, startTs: 0, endTs: 600_000 })).toBe(true);
  });
  it('labels modes', () => {
    expect(modeLabel('metro')).toBe('U-Bahn / S-Bahn');
    expect(modeLabel(null)).toBe('Not tagged');
  });
});
