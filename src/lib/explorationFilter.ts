import { europeBerlinDateKey } from './geoMath';

export type FilterPreset =
  | 'allTime'
  | 'today'
  | 'yesterday'
  | 'last7Days'
  | 'specificDate'
  | 'customRange'
  | `weekday:${'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'}`;

export type ExplorationFilter = {
  preset: FilterPreset;
  label: string;
  // YYYY-MM-DD (Europe/Berlin), only for preset 'specificDate'.
  date?: string;
};

export const defaultFilter: ExplorationFilter = { preset: 'allTime', label: 'All time' };

const WEEKDAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function dayKeyToUtcMs(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// Whether a recorded visit-day (Europe/Berlin calendar date, YYYY-MM-DD)
// falls inside the chosen filter. "Today"/"Yesterday"/"Last 7 days" are
// relative to the Berlin calendar date of `nowMs`; "Every Monday" etc.
// matches any recorded day that was a Monday (plan.md temporal rules).
// specificDate matches exactly that Berlin calendar date.
export function dayMatchesFilter(dayKey: string, preset: FilterPreset, nowMs: number, date?: string): boolean {
  if (preset === 'specificDate') return date ? dayKey === date : true;
  if (preset === 'allTime' || preset === 'customRange') return true;
  const dayMs = dayKeyToUtcMs(dayKey);
  const todayMs = dayKeyToUtcMs(europeBerlinDateKey(nowMs));
  const DAY = 24 * 60 * 60 * 1000;
  if (preset === 'today') return dayMs === todayMs;
  if (preset === 'yesterday') return dayMs === todayMs - DAY;
  if (preset === 'last7Days') return dayMs <= todayMs && dayMs > todayMs - 7 * DAY;
  if (preset.startsWith('weekday:')) {
    return new Date(dayMs).getUTCDay() === WEEKDAY_INDEX[preset.slice('weekday:'.length)];
  }
  return true;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "2026-11-07" -> "Sat 7 Nov"
export function formatDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]}`;
}
