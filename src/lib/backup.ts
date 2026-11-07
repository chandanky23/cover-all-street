// Backup file format + validation. A backup is a plain JSON file the user
// can store anywhere (Files, Drive, email to themselves); the app itself
// never uploads anything.
export const BACKUP_VERSION = 1;

export type Backup = {
  app: 'duppy-map';
  version: number;
  exportedAt: number;
  segments: {
    segment_id: string;
    first_seen: number;
    last_seen: number;
    covered_length_m: number;
    visit_days: number;
    traversal_count: number;
    name: string | null;
    highway: string | null;
    area_id: string | null;
  }[];
  segmentDays: { segment_id: string; visit_day: string; passes: number; last_ts: number | null; covered_m: number }[];
  areaVisits: { area_id: string; first_seen: number; last_seen: number; distinct_visit_days: number }[];
  areaDays: { area_id: string; visit_day: string }[];
  hours: { visit_day: string; hour: number; points: number }[];
  // Added after the first release of the format; older backups lack it.
  journeys?: {
    id: number;
    start_ts: number;
    end_ts: number;
    distance_m: number;
    medium_m: number;
    fast_m: number;
    point_count: number;
    last_lat: number;
    last_lon: number;
    path: string;
    mode: string | null;
  }[];
};

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isNumOrNull = (v: unknown): v is number | null => v === null || isNum(v);

function allValid<T>(list: unknown, check: (row: any) => boolean): list is T[] {
  return Array.isArray(list) && list.every((row) => row && typeof row === 'object' && check(row));
}

export function parseBackup(text: string): ParseResult {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a Duppy Map backup.' };
  }
  if (!data || data.app !== 'duppy-map') return { ok: false, error: 'This file is not a Duppy Map backup.' };
  if (data.version !== BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a different version of Duppy Map.' };
  }
  const ok =
    isNum(data.exportedAt) &&
    allValid(data.segments, (r) =>
      isStr(r.segment_id) && isNum(r.first_seen) && isNum(r.last_seen) && isNum(r.covered_length_m) &&
      isNum(r.visit_days) && isNum(r.traversal_count) && isStrOrNull(r.name) && isStrOrNull(r.highway) && isStrOrNull(r.area_id)
    ) &&
    allValid(data.segmentDays, (r) =>
      isStr(r.segment_id) && isStr(r.visit_day) && DAY_RE.test(r.visit_day) && isNum(r.passes) && isNumOrNull(r.last_ts) && isNum(r.covered_m)
    ) &&
    allValid(data.areaVisits, (r) =>
      isStr(r.area_id) && isNum(r.first_seen) && isNum(r.last_seen) && isNum(r.distinct_visit_days)
    ) &&
    allValid(data.areaDays, (r) => isStr(r.area_id) && isStr(r.visit_day) && DAY_RE.test(r.visit_day)) &&
    (data.journeys === undefined ||
      allValid(data.journeys, (r) =>
        isNum(r.id) && isNum(r.start_ts) && isNum(r.end_ts) && isNum(r.distance_m) && isNum(r.medium_m) &&
        isNum(r.fast_m) && isNum(r.point_count) && isNum(r.last_lat) && isNum(r.last_lon) && isStr(r.path) && isStrOrNull(r.mode)
      )) &&
    allValid(data.hours, (r) =>
      isStr(r.visit_day) && DAY_RE.test(r.visit_day) && Number.isInteger(r.hour) && r.hour >= 0 && r.hour <= 23 && isNum(r.points)
    );
  if (!ok) return { ok: false, error: 'This backup file is damaged or incomplete.' };
  return { ok: true, backup: data as Backup };
}

export function backupFileName(nowMs: number): string {
  const d = new Date(nowMs);
  const p = (n: number) => String(n).padStart(2, '0');
  return `duppy-map-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}
