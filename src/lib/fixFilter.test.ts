import { describe, expect, it } from 'vitest';

import { shouldStoreFix } from './fixFilter';

const t0 = Date.UTC(2026, 10, 7, 10, 0, 0);
const at = (lat: number, lon: number, sec: number) => ({ lat, lon, ts: t0 + sec * 1000 });
// ~1 m of latitude
const M = 1 / 111_000;

describe('shouldStoreFix', () => {
  it('keeps a normal walking fix', () => {
    expect(shouldStoreFix(at(52.5, 13.4, 0), at(52.5 + 20 * M, 13.4, 15), 10, 1.3)).toBe(true);
  });
  it('rejects poor accuracy', () => {
    expect(shouldStoreFix(null, at(52.5, 13.4, 0), 60, 1.3)).toBe(false);
  });
  it('rejects standing still by device speed', () => {
    expect(shouldStoreFix(at(52.5, 13.4, 0), at(52.5 + 25 * M, 13.4, 5), 8, 0.1)).toBe(false);
  });
  it('rejects slow drift near the last stored point (GPS jitter at home)', () => {
    expect(shouldStoreFix(at(52.5, 13.4, 0), at(52.5 + 9 * M, 13.4, 60), 12, null)).toBe(false);
  });
  it('rejects teleport jumps', () => {
    expect(shouldStoreFix(at(52.5, 13.4, 0), at(52.5 + 5000 * M, 13.4, 5), 10, null)).toBe(false);
  });
  it('treats -1 speed as unknown and falls back to implied speed', () => {
    expect(shouldStoreFix(at(52.5, 13.4, 0), at(52.5 + 20 * M, 13.4, 15), 10, -1)).toBe(true);
  });
  it('accepts the first fix when moving', () => {
    expect(shouldStoreFix(null, at(52.5, 13.4, 0), 10, 1.2)).toBe(true);
  });
  it('rejects non-increasing timestamps', () => {
    expect(shouldStoreFix(at(52.5, 13.4, 10), at(52.5 + 20 * M, 13.4, 10), 10, null)).toBe(false);
  });
});
