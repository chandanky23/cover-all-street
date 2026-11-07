import { describe, expect, it } from 'vitest';

import { formatClock, formatDuration, formatMeters, formatPct } from './format';

describe('formatPct', () => {
  it('shows tiny real progress instead of 0%', () => {
    expect(formatPct(0)).toBe('0%');
    expect(formatPct(0.004)).toBe('<0.01%');
    expect(formatPct(0.08)).toBe('0.08%');
    expect(formatPct(0.9)).toBe('0.90%');
    expect(formatPct(3.456)).toBe('3.5%');
    expect(formatPct(42.4)).toBe('42%');
    expect(formatPct(100)).toBe('100%');
  });
});

describe('formatMeters', () => {
  it('uses m below 1 km and km above', () => {
    expect(formatMeters(86.4)).toBe('86 m');
    expect(formatMeters(1250)).toBe('1.3 km');
    expect(formatMeters(15000)).toBe('15 km');
  });
});

describe('formatDuration / formatClock', () => {
  it('formats durations', () => {
    expect(formatDuration(20_000)).toBe('1 min');
    expect(formatDuration(25 * 60_000)).toBe('25 min');
    expect(formatDuration(62 * 60_000)).toBe('1 h 2 min');
    expect(formatDuration(120 * 60_000)).toBe('2 h');
  });
  it('shows Berlin wall-clock time (CET in winter, CEST in summer)', () => {
    expect(formatClock(Date.UTC(2026, 10, 7, 16, 5))).toBe('17:05');
    expect(formatClock(Date.UTC(2026, 5, 7, 16, 5))).toBe('18:05');
  });
});
