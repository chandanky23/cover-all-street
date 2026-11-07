import { europeBerlinHour } from './geoMath';

// Small numbers must not read as "0%" — a first walk covers a tiny slice
// of a whole Bezirk, and the user needs to see it registered.
export function formatPct(pct: number): string {
  if (!(pct > 0)) return '0%';
  if (pct < 0.01) return '<0.01%';
  if (pct < 1) return `${pct.toFixed(2)}%`;
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

export function formatMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
  return `${Math.round(m)} m`;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Berlin wall-clock time, e.g. "17:05". Berlin's UTC offset is always a
// whole number of hours, so the minutes are the UTC minutes.
export function formatClock(utcMs: number): string {
  const h = String(europeBerlinHour(utcMs)).padStart(2, '0');
  const m = String(new Date(utcMs).getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
