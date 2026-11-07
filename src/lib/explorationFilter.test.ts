import { describe, expect, it } from 'vitest';

import { dayMatchesFilter, formatDayKey } from './explorationFilter';

// 2026-11-07 is a Saturday.
const NOW = Date.UTC(2026, 10, 7, 12, 0);

describe('dayMatchesFilter', () => {
  it('allTime matches anything', () => {
    expect(dayMatchesFilter('2020-01-01', 'allTime', NOW)).toBe(true);
  });
  it('today / yesterday', () => {
    expect(dayMatchesFilter('2026-11-07', 'today', NOW)).toBe(true);
    expect(dayMatchesFilter('2026-11-06', 'today', NOW)).toBe(false);
    expect(dayMatchesFilter('2026-11-06', 'yesterday', NOW)).toBe(true);
    expect(dayMatchesFilter('2026-11-07', 'yesterday', NOW)).toBe(false);
  });
  it('last7Days includes today and 6 days back, not 7', () => {
    expect(dayMatchesFilter('2026-11-07', 'last7Days', NOW)).toBe(true);
    expect(dayMatchesFilter('2026-11-01', 'last7Days', NOW)).toBe(true);
    expect(dayMatchesFilter('2026-10-31', 'last7Days', NOW)).toBe(false);
    expect(dayMatchesFilter('2026-11-08', 'last7Days', NOW)).toBe(false);
  });
  it('weekday presets', () => {
    expect(dayMatchesFilter('2026-11-07', 'weekday:sat', NOW)).toBe(true);
    expect(dayMatchesFilter('2026-11-02', 'weekday:mon', NOW)).toBe(true);
    expect(dayMatchesFilter('2026-11-03', 'weekday:mon', NOW)).toBe(false);
  });
  it('uses the Berlin calendar date for "today" near midnight', () => {
    // 2026-06-10 22:30 UTC is already 2026-06-11 in Berlin (CEST).
    const lateUtc = Date.UTC(2026, 5, 10, 22, 30);
    expect(dayMatchesFilter('2026-06-11', 'today', lateUtc)).toBe(true);
    expect(dayMatchesFilter('2026-06-10', 'today', lateUtc)).toBe(false);
  });
  it('specificDate matches only that exact day', () => {
    expect(dayMatchesFilter('2026-11-03', 'specificDate', NOW, '2026-11-03')).toBe(true);
    expect(dayMatchesFilter('2026-11-04', 'specificDate', NOW, '2026-11-03')).toBe(false);
  });
  it('formats a day key', () => {
    expect(formatDayKey('2026-11-07')).toBe('Sat 7 Nov');
  });
});
