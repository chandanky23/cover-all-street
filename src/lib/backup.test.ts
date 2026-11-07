import { describe, expect, it } from 'vitest';

import { BACKUP_VERSION, backupFileName, parseBackup } from './backup';

const good = {
  app: 'duppy-map',
  version: BACKUP_VERSION,
  exportedAt: 1,
  segments: [
    { segment_id: 'way/1', first_seen: 1, last_seen: 2, covered_length_m: 50, visit_days: 1, traversal_count: 2, name: 'A', highway: 'residential', area_id: '3' },
  ],
  segmentDays: [{ segment_id: 'way/1', visit_day: '2026-11-07', passes: 2, last_ts: 5, covered_m: 50 }],
  areaVisits: [{ area_id: '3', first_seen: 1, last_seen: 2, distinct_visit_days: 1 }],
  areaDays: [{ area_id: '3', visit_day: '2026-11-07' }],
  hours: [{ visit_day: '2026-11-07', hour: 10, points: 4 }],
};

describe('parseBackup', () => {
  it('accepts a valid backup', () => {
    expect(parseBackup(JSON.stringify(good)).ok).toBe(true);
  });
  it('rejects non-JSON and foreign JSON', () => {
    expect(parseBackup('hello').ok).toBe(false);
    expect(parseBackup('{"app":"other"}').ok).toBe(false);
  });
  it('rejects another version', () => {
    expect(parseBackup(JSON.stringify({ ...good, version: 99 })).ok).toBe(false);
  });
  it('rejects malformed rows (bad day, bad hour, missing field)', () => {
    expect(parseBackup(JSON.stringify({ ...good, segmentDays: [{ ...good.segmentDays[0], visit_day: 'yesterday' }] })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...good, hours: [{ visit_day: '2026-11-07', hour: 30, points: 1 }] })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...good, segments: [{ segment_id: 'x' }] })).ok).toBe(false);
  });
  it('accepts journeys and rejects malformed ones; older backups without journeys still load', () => {
    const j = { id: 1, start_ts: 1, end_ts: 2, distance_m: 900, medium_m: 0, fast_m: 0, point_count: 5, last_lat: 52.5, last_lon: 13.4, path: '[[52.5,13.4]]', mode: 'bike' };
    expect(parseBackup(JSON.stringify({ ...good, journeys: [j] })).ok).toBe(true);
    expect(parseBackup(JSON.stringify({ ...good, journeys: [{ ...j, path: 5 }] })).ok).toBe(false);
    expect(parseBackup(JSON.stringify(good)).ok).toBe(true);
  });
  it('rejects missing arrays', () => {
    const { hours, ...rest } = good;
    expect(parseBackup(JSON.stringify(rest)).ok).toBe(false);
  });
});

describe('backupFileName', () => {
  it('is dated', () => {
    expect(backupFileName(new Date(2026, 10, 7).getTime())).toBe('duppy-map-backup-2026-11-07.json');
  });
});
