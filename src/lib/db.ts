import * as SQLite from 'expo-sqlite';

import { BACKUP_VERSION, type Backup } from './backup';
import { berlinBezirke, berlinOrtsteile } from './berlinGeo';
import { europeBerlinDateKey } from './geoMath';
import { type ExplorationFilter, type FilterPreset, defaultFilter, dayMatchesFilter } from './explorationFilter';
import { type HeatmapSettings, defaultHeatmapSettings } from './heatmapSettings';
import { type DayStat, mergeDayStat } from './matcher';
import { type JourneyState, type Mode, isWorthShowing, suggestMode, type Suggestion } from './journeys';
import { getDistrictTotalLengthM } from './streetGraph';

// Real schema (plan.md "Local architecture" / "Suggested DB tables"),
// replacing the Phase 0 spike's single `observations` table. Street
// segments themselves are NOT seeded here — plan.md's matcher design
// ("spatial index against versioned Berlin street graph") should decide
// how the eligible street graph gets queried before 99k rows get a
// fixed shape in SQLite; seeding that now would risk locking in the
// wrong access pattern before Phase 4 exists. `areas` (109 rows: 12
// Bezirke + 97 Ortsteile) is cheap and genuinely needed now so
// `area_visits` has something to reference, so it's seeded eagerly.
//
// Migrations: version-numbered steps of idempotent `CREATE TABLE/INDEX
// IF NOT EXISTS` DDL, each bumping `PRAGMA user_version` once its DDL
// has run — not wrapped in explicit BEGIN/COMMIT. That wrapping was
// tried first and caused a real bug: on-device, `user_version` ended up
// at 2 while schema v2's tables never actually got created (confirmed
// by pulling the db file and inspecting it directly) — some interaction
// between the explicit transaction and the `PRAGMA user_version` write
// let the version bump persist without the preceding CREATE TABLE
// statements committing. Since every statement here is already
// `IF NOT EXISTS` (safe to re-run, never destroys data), there's no
// correctness reason to wrap it in a transaction at all; removing that
// wrapping removes the bug instead of chasing the exact SQLite/driver
// interaction that caused it.
const SCHEMA_VERSION = 5;
const GEO_DATASET_VERSION = 'berlin-v1';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('duppy-map.db').then(async (db) => {
      await migrate(db);
      await seedAreasIfNeeded(db);
      return db;
    });
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  const { user_version: currentVersion } = (await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;'
  )) ?? { user_version: 0 };

  if (currentVersion < 1) {
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT
        );

        CREATE TABLE IF NOT EXISTS geo_dataset (
          version TEXT PRIMARY KEY NOT NULL,
          installed_at INTEGER NOT NULL,
          checksum TEXT
        );

        CREATE TABLE IF NOT EXISTS areas (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          parent_id TEXT,
          eligible_length_m REAL
        );
        CREATE INDEX IF NOT EXISTS idx_areas_parent_id ON areas(parent_id);

        -- Short retention only (plan.md): raw fixes are purged by
        -- purgeOldObservations() well before they'd accumulate
        -- indefinitely. processed marks whether Phase 4's matcher has
        -- consumed a point yet.
        CREATE TABLE IF NOT EXISTS observations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          accuracy_m REAL,
          speed_mps REAL,
          processed INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_observations_ts ON observations(ts);
        CREATE INDEX IF NOT EXISTS idx_observations_processed ON observations(processed);

        CREATE TABLE IF NOT EXISTS segment_visits (
          segment_id TEXT PRIMARY KEY NOT NULL,
          first_seen INTEGER,
          last_seen INTEGER,
          covered_length_m REAL,
          visit_days INTEGER,
          traversal_count INTEGER,
          confidence REAL
        );

        CREATE TABLE IF NOT EXISTS area_visits (
          area_id TEXT PRIMARY KEY NOT NULL REFERENCES areas(id),
          first_seen INTEGER,
          last_seen INTEGER,
          distinct_visit_days INTEGER
        );
      `);
    await db.execAsync('PRAGMA user_version = 1;');
  }

  if (currentVersion < 2) {
    // Phase 4: observations are short-retention (purged after 7 days),
    // so segment_visits/area_visits must be able to dedupe visit-days
    // incrementally across many matcher runs without ever re-reading
    // purged raw data. These small tables (one row per segment/area per
    // day it was ever visited) are what makes that possible —
    // visit_days/traversal_count are COUNT(*)s against them, recomputed
    // each upsert, not accumulated counters that could double-count a
    // day the matcher happens to touch twice.
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS segment_visit_days (
          segment_id TEXT NOT NULL,
          visit_day TEXT NOT NULL,
          PRIMARY KEY (segment_id, visit_day)
        );

        CREATE TABLE IF NOT EXISTS area_visit_days (
          area_id TEXT NOT NULL,
          visit_day TEXT NOT NULL,
          PRIMARY KEY (area_id, visit_day)
        );
      `);
    await db.execAsync('PRAGMA user_version = 2;');
  }

  if (currentVersion < 3) {
    // Real (not mock) UI needs two things segment_visits didn't carry:
    // a human-readable name/highway type to show in Insights' top-streets
    // list without re-loading per-district GeoJSON at read time, and the
    // Bezirk it belongs to so real district coverage % can be a plain
    // SQL SUM/GROUP BY instead of re-deriving segment→area membership on
    // every read. The matcher already knows both at match time (it loaded
    // that district's street file to find the segment), so this just
    // carries that knowledge forward into storage instead of discarding it.
    await db.execAsync(`
        ALTER TABLE segment_visits ADD COLUMN name TEXT;
        ALTER TABLE segment_visits ADD COLUMN highway TEXT;
        ALTER TABLE segment_visits ADD COLUMN area_id TEXT;
      `);
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_segment_visits_area_id ON segment_visits(area_id);');
    await db.execAsync('PRAGMA user_version = 3;');
  }

  if (currentVersion < 4) {
    // v4: per-day pass counts + covered metres for each street, and
    // activity by hour of day — what "how many times on a date" and the
    // hourly analytics are computed from.
    await db.execAsync(`
        ALTER TABLE segment_visit_days ADD COLUMN passes INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE segment_visit_days ADD COLUMN last_ts INTEGER;
        ALTER TABLE segment_visit_days ADD COLUMN covered_m REAL NOT NULL DEFAULT 0;
      `);
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS activity_hours (
          visit_day TEXT NOT NULL,
          hour INTEGER NOT NULL,
          points INTEGER NOT NULL,
          PRIMARY KEY (visit_day, hour)
        );
      `);
    await db.execAsync('PRAGMA user_version = 4;');
  }

  if (currentVersion < 5) {
    // v5: journeys (runs of movement) that the user can tag with how they
    // travelled. `path` is a thinned [lat,lon] list for a route preview,
    // kept because the raw points are purged after 7 days.
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS journeys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          start_ts INTEGER NOT NULL,
          end_ts INTEGER NOT NULL,
          distance_m REAL NOT NULL,
          medium_m REAL NOT NULL,
          fast_m REAL NOT NULL,
          point_count INTEGER NOT NULL,
          last_lat REAL NOT NULL,
          last_lon REAL NOT NULL,
          path TEXT NOT NULL,
          mode TEXT
        );
      `);
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_journeys_start ON journeys(start_ts);');
    await db.execAsync('PRAGMA user_version = 5;');
  }
}

async function seedAreasIfNeeded(db: SQLite.SQLiteDatabase) {
  const installed = await db.getFirstAsync<{ version: string }>(
    'SELECT version FROM geo_dataset WHERE version = ?;',
    GEO_DATASET_VERSION
  );
  if (installed) return;

  // Real (not guessed) eligible length per Bezirk, for real coverage %
  // (src/lib/coverage.ts) — summed from the same bundled per-district
  // street files the matcher uses, once, here, rather than computed on
  // every map render. Ortsteile don't get one: no per-Ortsteil street
  // breakdown exists (streets are only split by Bezirk), so their
  // eligible_length_m stays NULL rather than a guessed number — see
  // docs/STATUS.md for why Ortsteil coverage is shown as a simpler
  // visited/not-visited signal instead of a %.
  const bezirkLengths = new Map<string, number>();
  for (const f of berlinBezirke.features) {
    const name = String(f.properties?.name ?? '');
    if (name) bezirkLengths.set(name, await getDistrictTotalLengthM(name));
  }

  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (const f of berlinBezirke.features) {
      const name = String(f.properties?.name ?? 'Unknown');
      await db.runAsync(
        'INSERT OR REPLACE INTO areas (id, name, type, parent_id, eligible_length_m) VALUES (?, ?, ?, NULL, ?);',
        String(f.properties?.id ?? f.id),
        name,
        'bezirk',
        bezirkLengths.get(name) ?? null
      );
    }
    for (const f of berlinOrtsteile.features) {
      // Real parent Bezirk linkage isn't in the bundled boundary data
      // (no administrative relation captured during the Phase 2 fetch) —
      // left null rather than guessed. Point-in-polygon against the
      // Bezirke set would fix this; tracked as a Phase 4 follow-up if
      // area rollups turn out to need it.
      await db.runAsync(
        'INSERT OR REPLACE INTO areas (id, name, type, parent_id, eligible_length_m) VALUES (?, ?, ?, NULL, NULL);',
        String(f.properties?.id ?? f.id),
        String(f.properties?.name ?? 'Unknown'),
        'ortsteil'
      );
    }
    await db.runAsync(
      'INSERT OR REPLACE INTO geo_dataset (version, installed_at, checksum) VALUES (?, ?, NULL);',
      GEO_DATASET_VERSION,
      Date.now()
    );
    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  }
}

export async function insertObservation(
  ts: number,
  lat: number,
  lon: number,
  accuracyM: number | null,
  speedMps: number | null = null
) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO observations (ts, lat, lon, accuracy_m, speed_mps) VALUES (?, ?, ?, ?, ?);',
    ts,
    lat,
    lon,
    accuracyM,
    speedMps
  );
}

export async function latestObservation() {
  const db = await getDb();
  return db.getFirstAsync<{ id: number; ts: number; lat: number; lon: number; accuracy_m: number | null }>(
    'SELECT * FROM observations ORDER BY id DESC LIMIT 1;'
  );
}

export async function countObservations(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM observations;');
  return row?.count ?? 0;
}

export async function latestObservations(limit: number) {
  const db = await getDb();
  return db.getAllAsync<{ id: number; ts: number; lat: number; lon: number; accuracy_m: number | null }>(
    'SELECT * FROM observations ORDER BY id DESC LIMIT ?;',
    limit
  );
}

// "short retention only" (plan.md) — raw GPS fixes aren't the product,
// the matched segment/area visit rollups are. 7 days is generous enough
// to debug a recent walk without becoming an indefinite location history.
const OBSERVATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function purgeOldObservations(now: number = Date.now()) {
  const db = await getDb();
  // Only ever purges matched (processed=1) points — an observation the
  // matcher hasn't gotten to yet (e.g. tracking was off for a while)
  // must never be deleted before it's had a chance to count, even if
  // it's older than the retention window.
  await db.runAsync('DELETE FROM observations WHERE ts < ? AND processed = 1;', now - OBSERVATION_RETENTION_MS);
}

export async function deleteAllUserData() {
  const db = await getDb();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    await db.execAsync(`
      DELETE FROM observations;
      DELETE FROM segment_visits;
      DELETE FROM area_visits;
      DELETE FROM segment_visit_days;
      DELETE FROM area_visit_days;
      DELETE FROM activity_hours;
      DELETE FROM journeys;
    `);
    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  }
}

export async function getUnprocessedObservations(limit: number) {
  const db = await getDb();
  return db.getAllAsync<{ id: number; ts: number; lat: number; lon: number; accuracy_m: number | null }>(
    'SELECT * FROM observations WHERE processed = 0 ORDER BY ts ASC LIMIT ?;',
    limit
  );
}

export async function markObservationsProcessed(ids: number[]) {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`UPDATE observations SET processed = 1 WHERE id IN (${placeholders});`, ...ids);
}

// Folds one matcher run's rollup for a single segment into the durable
// segment_visits row — see the schema-v2 comment above for why this is
// an incremental merge (MIN/MAX/day-table COUNT) rather than a replace.
export async function upsertSegmentVisit(
  segmentId: string,
  firstSeen: number,
  lastSeen: number,
  coveredLengthM: number,
  dayStats: Map<string, DayStat>,
  name: string | null,
  highway: string,
  areaId: string | null
) {
  const db = await getDb();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (const [day, incoming] of dayStats) {
      const existing = await db.getFirstAsync<{ passes: number; last_ts: number | null; covered_m: number }>(
        'SELECT passes, last_ts, covered_m FROM segment_visit_days WHERE segment_id = ? AND visit_day = ?;',
        segmentId,
        day
      );
      const merged = mergeDayStat(
        existing ? { passes: existing.passes, lastTs: existing.last_ts ?? 0, coveredM: existing.covered_m } : null,
        incoming
      );
      await db.runAsync(
        `INSERT INTO segment_visit_days (segment_id, visit_day, passes, last_ts, covered_m)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(segment_id, visit_day) DO UPDATE SET
           passes = excluded.passes, last_ts = excluded.last_ts, covered_m = excluded.covered_m;`,
        segmentId,
        day,
        merged.passes,
        merged.lastTs,
        merged.coveredM
      );
    }
    const totals = (await db.getFirstAsync<{ days: number; passes: number }>(
      'SELECT COUNT(*) as days, COALESCE(SUM(passes), 0) as passes FROM segment_visit_days WHERE segment_id = ?;',
      segmentId
    )) ?? { days: 0, passes: 0 };

    await db.runAsync(
      `INSERT INTO segment_visits (segment_id, first_seen, last_seen, covered_length_m, visit_days, traversal_count, confidence, name, highway, area_id)
       VALUES (?, ?, ?, ?, ?, ?, 1.0, ?, ?, ?)
       ON CONFLICT(segment_id) DO UPDATE SET
         first_seen = MIN(first_seen, excluded.first_seen),
         last_seen = MAX(last_seen, excluded.last_seen),
         covered_length_m = MAX(covered_length_m, excluded.covered_length_m),
         visit_days = excluded.visit_days,
         traversal_count = excluded.traversal_count,
         name = excluded.name,
         highway = excluded.highway,
         area_id = excluded.area_id;`,
      segmentId,
      firstSeen,
      lastSeen,
      coveredLengthM,
      totals.days,
      totals.passes,
      name,
      highway,
      areaId
    );
    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  }
}

// Adds matched-point counts per (Berlin day, hour). Each observation is
// matched exactly once (processed flag), so plain addition is safe.
export async function addActivityHours(hours: Map<string, number>) {
  if (hours.size === 0) return;
  const db = await getDb();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (const [key, points] of hours) {
      const [day, hour] = key.split('|');
      await db.runAsync(
        `INSERT INTO activity_hours (visit_day, hour, points) VALUES (?, ?, ?)
         ON CONFLICT(visit_day, hour) DO UPDATE SET points = points + excluded.points;`,
        day,
        Number(hour),
        points
      );
    }
    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  }
}

export async function upsertAreaVisit(areaId: string, firstSeen: number, lastSeen: number, visitDayKeys: string[]) {
  const db = await getDb();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (const day of visitDayKeys) {
      await db.runAsync('INSERT OR IGNORE INTO area_visit_days (area_id, visit_day) VALUES (?, ?);', areaId, day);
    }
    const { count } = (await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM area_visit_days WHERE area_id = ?;',
      areaId
    )) ?? { count: 0 };

    await db.runAsync(
      `INSERT INTO area_visits (area_id, first_seen, last_seen, distinct_visit_days)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(area_id) DO UPDATE SET
         first_seen = MIN(first_seen, excluded.first_seen),
         last_seen = MAX(last_seen, excluded.last_seen),
         distinct_visit_days = excluded.distinct_visit_days;`,
      areaId,
      firstSeen,
      lastSeen,
      count
    );
    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  }
}

// Details for one tapped street/area, restricted to the active filter.
export async function getSegmentDetail(segmentId: string, f: FilterArg = ALL_TIME) {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.getAllAsync<{ visit_day: string; passes: number; covered_m: number }>(
    'SELECT visit_day, passes, covered_m FROM segment_visit_days WHERE segment_id = ? ORDER BY visit_day DESC;',
    segmentId
  );
  const days = rows.filter((r) => dayMatchesFilter(r.visit_day, f.preset, now, f.date));
  return {
    days: days.map((r) => ({ day: r.visit_day, passes: r.passes })),
    passes: days.reduce((n, r) => n + r.passes, 0),
    coveredM: days.reduce((m, r) => Math.max(m, r.covered_m), 0),
  };
}

export async function getAreaDetail(areaId: string, f: FilterArg = ALL_TIME) {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.getAllAsync<{ visit_day: string }>(
    'SELECT visit_day FROM area_visit_days WHERE area_id = ? ORDER BY visit_day DESC;',
    areaId
  );
  const days = rows.map((r) => r.visit_day).filter((d) => dayMatchesFilter(d, f.preset, now, f.date));
  const area = await db.getFirstAsync<{ type: string; eligible_length_m: number | null }>(
    'SELECT type, eligible_length_m FROM areas WHERE id = ?;',
    areaId
  );
  let coveredM = 0;
  let streets = 0;
  if (area?.type === 'bezirk') {
    const a = await loadActivity(f);
    for (const seg of a.segments.values()) {
      if (seg.areaId === areaId) {
        coveredM += seg.coveredM;
        streets++;
      }
    }
  }
  const eligible = area?.eligible_length_m ?? 0;
  return {
    isBezirk: area?.type === 'bezirk',
    days,
    streets,
    coveredM,
    coveragePct: eligible > 0 ? Math.min(100, (coveredM / eligible) * 100) : 0,
  };
}

export async function getSegmentVisit(segmentId: string) {
  const db = await getDb();
  return db.getFirstAsync<{
    segment_id: string;
    first_seen: number;
    last_seen: number;
    covered_length_m: number;
    visit_days: number;
    traversal_count: number;
    confidence: number;
  }>('SELECT * FROM segment_visits WHERE segment_id = ?;', segmentId);
}

export async function getAreaVisit(areaId: string) {
  const db = await getDb();
  return db.getFirstAsync<{
    area_id: string;
    first_seen: number;
    last_seen: number;
    distinct_visit_days: number;
  }>('SELECT * FROM area_visits WHERE area_id = ?;', areaId);
}

// ---- Real, filter-aware activity queries -------------------------------
// Every visit is stored per calendar day (segment_visit_days /
// area_visit_days), so the time filter can be applied exactly: load the
// day rows, keep the ones matching the filter, and derive everything
// (Insights totals, top streets, district coverage, map painting) from
// that one filtered view so screens can never disagree. Row counts are
// bounded by how many (street, day) pairs a person has actually walked.
type Activity = {
  segments: Map<
    string,
    { name: string | null; highway: string; coveredM: number; areaId: string | null; days: Map<string, number> }
  >;
  areaIds: Set<string>;
  activeDays: Set<string>;
};

type FilterArg = { preset: FilterPreset; date?: string };
const ALL_TIME: FilterArg = { preset: 'allTime' };

async function loadActivity(f: FilterArg): Promise<Activity> {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.getAllAsync<{
    segment_id: string;
    visit_day: string;
    passes: number;
    covered_m: number;
    name: string | null;
    highway: string | null;
    area_id: string | null;
  }>(
    `SELECT d.segment_id, d.visit_day, d.passes, d.covered_m, v.name, v.highway, v.area_id
     FROM segment_visit_days d JOIN segment_visits v ON v.segment_id = d.segment_id;`
  );
  const segments: Activity['segments'] = new Map();
  const activeDays = new Set<string>();
  for (const r of rows) {
    if (!dayMatchesFilter(r.visit_day, f.preset, now, f.date)) continue;
    activeDays.add(r.visit_day);
    let seg = segments.get(r.segment_id);
    if (!seg) {
      seg = { name: r.name, highway: r.highway ?? 'unclassified', coveredM: 0, areaId: r.area_id, days: new Map() };
      segments.set(r.segment_id, seg);
    }
    // coverage within the filter is the furthest reached on any matching
    // day (a union-style bound), never the sum of repeat passes.
    seg.coveredM = Math.max(seg.coveredM, r.covered_m);
    seg.days.set(r.visit_day, r.passes);
  }
  const areaRows = await db.getAllAsync<{ area_id: string; visit_day: string }>(
    'SELECT area_id, visit_day FROM area_visit_days;'
  );
  const areaIds = new Set<string>();
  for (const r of areaRows) if (dayMatchesFilter(r.visit_day, f.preset, now, f.date)) areaIds.add(r.area_id);
  return { segments, areaIds, activeDays };
}

const sumPasses = (days: Map<string, number>) => {
  let n = 0;
  for (const p of days.values()) n += p;
  return n;
};

export async function getInsightsTotals(f: FilterArg = ALL_TIME) {
  const a = await loadActivity(f);
  let lengthM = 0;
  let passes = 0;
  for (const seg of a.segments.values()) {
    lengthM += seg.coveredM;
    passes += sumPasses(seg.days);
  }
  const db = await getDb();
  const typeRows = await db.getAllAsync<{ id: string; type: string }>('SELECT id, type FROM areas;');
  let districts = 0;
  let neighbourhoods = 0;
  for (const r of typeRows) {
    if (!a.areaIds.has(r.id)) continue;
    if (r.type === 'bezirk') districts++;
    else if (r.type === 'ortsteil') neighbourhoods++;
  }
  return {
    streetsTravelled: a.segments.size,
    lengthCoveredKm: lengthM / 1000,
    districtsVisited: districts,
    neighbourhoodsVisited: neighbourhoods,
    activeDays: a.activeDays.size,
    totalPasses: passes,
  };
}

export async function getTopStreets(limit: number, f: FilterArg = ALL_TIME) {
  const a = await loadActivity(f);
  // OSM splits one street into many ways, so rank by street name: a walk
  // along the whole street is one pass (the most any single piece saw that
  // day), and the metres add up across its pieces.
  type Group = {
    key: string;
    name: string | null;
    highway: string;
    coveredM: number;
    dayPasses: Map<string, number>;
  };
  const groups = new Map<string, Group>();
  for (const [segmentId, s] of a.segments) {
    const key = s.name ? `name:${s.name}` : `id:${segmentId}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, name: s.name, highway: s.highway, coveredM: 0, dayPasses: new Map() };
      groups.set(key, g);
    }
    g.coveredM += s.coveredM;
    for (const [day, passes] of s.days) g.dayPasses.set(day, Math.max(g.dayPasses.get(day) ?? 0, passes));
  }
  return [...groups.values()]
    .map((g) => ({
      segment_id: g.key,
      name: g.name,
      highway: g.highway,
      traversal_count: sumPasses(g.dayPasses),
      visit_days: g.dayPasses.size,
      covered_length_m: g.coveredM,
    }))
    .sort((x, y) => y.traversal_count - x.traversal_count || y.covered_length_m - x.covered_length_m)
    .slice(0, limit);
}

// Per-segment pass counts for painting walked streets on the map.
export async function getSegmentVisitCounts(f: FilterArg = ALL_TIME) {
  const a = await loadActivity(f);
  return [...a.segments.entries()].map(([segment_id, s]) => ({ segment_id, count: sumPasses(s.days) }));
}

// Days that have recorded activity, newest first — the choices for the
// "specific date" filter.
export async function getActiveDays(limit = 60): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ visit_day: string }>(
    'SELECT DISTINCT visit_day FROM segment_visit_days ORDER BY visit_day DESC LIMIT ?;',
    limit
  );
  return rows.map((r) => r.visit_day);
}

// Relative walking activity for each hour of the Berlin day (index 0-23)
// within the filter.
export async function getHourlyActivity(f: FilterArg = ALL_TIME): Promise<number[]> {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.getAllAsync<{ visit_day: string; hour: number; points: number }>(
    'SELECT visit_day, hour, points FROM activity_hours;'
  );
  const out = new Array<number>(24).fill(0);
  for (const r of rows) {
    if (dayMatchesFilter(r.visit_day, f.preset, now, f.date)) out[r.hour] += r.points;
  }
  return out;
}

// Real district coverage: covered length of streets visited in the
// filtered range, summed per Bezirk, over its real eligible length.
export async function getBezirkCoverage(f: FilterArg = ALL_TIME) {
  const db = await getDb();
  const a = await loadActivity(f);
  const covered = new Map<string, number>();
  for (const seg of a.segments.values()) {
    if (seg.areaId) covered.set(seg.areaId, (covered.get(seg.areaId) ?? 0) + seg.coveredM);
  }
  const areas = await db.getAllAsync<{ id: string; name: string; eligible_length_m: number }>(
    "SELECT id, name, eligible_length_m FROM areas WHERE type = 'bezirk';"
  );
  return areas.map((r) => ({
    name: r.name,
    eligible_length_m: r.eligible_length_m,
    covered_length_m: covered.get(r.id) ?? 0,
  }));
}

// Ortsteile visited in the filtered range — real signal, shown as a
// simple visited/not-visited treatment since no per-Ortsteil eligible
// length exists to compute a real % against (docs/STATUS.md).
export async function getVisitedOrtsteilNames(f: FilterArg = ALL_TIME): Promise<string[]> {
  const db = await getDb();
  const a = await loadActivity(f);
  const rows = await db.getAllAsync<{ id: string; name: string }>("SELECT id, name FROM areas WHERE type = 'ortsteil';");
  return rows.filter((r) => a.areaIds.has(r.id)).map((r) => r.name);
}

// Persisted user choices (shared by Map and Insights via app_settings).
export async function getSavedFilter(): Promise<ExplorationFilter> {
  const preset = await getSetting('filter_preset');
  const label = await getSetting('filter_label');
  if (!preset || !label) return defaultFilter;
  const date = await getSetting('filter_date');
  return { preset: preset as FilterPreset, label, date: date || undefined };
}

export async function saveFilter(f: ExplorationFilter) {
  await setSetting('filter_preset', f.preset);
  await setSetting('filter_label', f.label);
  await setSetting('filter_date', f.date ?? '');
}

export async function getSavedHeatmapSettings(): Promise<HeatmapSettings> {
  const raw = await getSetting('heatmap_settings');
  if (!raw) return defaultHeatmapSettings;
  try {
    return { ...defaultHeatmapSettings, ...JSON.parse(raw) } as HeatmapSettings;
  } catch {
    return defaultHeatmapSettings;
  }
}

export async function saveHeatmapSettings(s: HeatmapSettings) {
  await setSetting('heatmap_settings', JSON.stringify(s));
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM app_settings WHERE key = ?;',
    key
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);', key, value);
}

// ---- Backup / restore ---------------------------------------------------
export async function exportBackup(): Promise<Backup> {
  const db = await getDb();
  const [segments, segmentDays, areaVisits, areaDays, hours, journeys] = await Promise.all([
    db.getAllAsync<Backup['segments'][number]>(
      'SELECT segment_id, first_seen, last_seen, covered_length_m, visit_days, traversal_count, name, highway, area_id FROM segment_visits;'
    ),
    db.getAllAsync<Backup['segmentDays'][number]>(
      'SELECT segment_id, visit_day, passes, last_ts, covered_m FROM segment_visit_days;'
    ),
    db.getAllAsync<Backup['areaVisits'][number]>(
      'SELECT area_id, first_seen, last_seen, distinct_visit_days FROM area_visits;'
    ),
    db.getAllAsync<Backup['areaDays'][number]>('SELECT area_id, visit_day FROM area_visit_days;'),
    db.getAllAsync<Backup['hours'][number]>('SELECT visit_day, hour, points FROM activity_hours;'),
    db.getAllAsync<NonNullable<Backup['journeys']>[number]>('SELECT * FROM journeys;'),
  ]);
  return { app: 'duppy-map', version: BACKUP_VERSION, exportedAt: Date.now(), segments, segmentDays, areaVisits, areaDays, hours, journeys };
}

// Replaces the current history with the backup's, all or nothing.
export async function importBackup(b: Backup) {
  const db = await getDb();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    await db.execAsync(`
      DELETE FROM segment_visits;
      DELETE FROM area_visits;
      DELETE FROM segment_visit_days;
      DELETE FROM area_visit_days;
      DELETE FROM activity_hours;
      DELETE FROM journeys;
    `);
    for (const r of b.segments) {
      await db.runAsync(
        `INSERT INTO segment_visits (segment_id, first_seen, last_seen, covered_length_m, visit_days, traversal_count, confidence, name, highway, area_id)
         VALUES (?, ?, ?, ?, ?, ?, 1.0, ?, ?, ?);`,
        r.segment_id, r.first_seen, r.last_seen, r.covered_length_m, r.visit_days, r.traversal_count, r.name, r.highway, r.area_id
      );
    }
    for (const r of b.segmentDays) {
      await db.runAsync(
        'INSERT INTO segment_visit_days (segment_id, visit_day, passes, last_ts, covered_m) VALUES (?, ?, ?, ?, ?);',
        r.segment_id, r.visit_day, r.passes, r.last_ts, r.covered_m
      );
    }
    for (const r of b.areaVisits) {
      await db.runAsync(
        'INSERT INTO area_visits (area_id, first_seen, last_seen, distinct_visit_days) VALUES (?, ?, ?, ?);',
        r.area_id, r.first_seen, r.last_seen, r.distinct_visit_days
      );
    }
    for (const r of b.areaDays) {
      await db.runAsync('INSERT INTO area_visit_days (area_id, visit_day) VALUES (?, ?);', r.area_id, r.visit_day);
    }
    for (const r of b.hours) {
      await db.runAsync('INSERT INTO activity_hours (visit_day, hour, points) VALUES (?, ?, ?);', r.visit_day, r.hour, r.points);
    }
    for (const r of b.journeys ?? []) {
      await db.runAsync(
        'INSERT INTO journeys (id, start_ts, end_ts, distance_m, medium_m, fast_m, point_count, last_lat, last_lon, path, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
        r.id, r.start_ts, r.end_ts, r.distance_m, r.medium_m, r.fast_m, r.point_count, r.last_lat, r.last_lon, r.path, r.mode
      );
    }
    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  }
}

// ---- Journeys and tagging -------------------------------------------------
type JourneyRow = {
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
};

export type Journey = {
  id: number;
  startTs: number;
  endTs: number;
  distanceM: number;
  mode: Mode | null;
  suggestion: Suggestion;
  path: [number, number][];
};

function toJourney(r: JourneyRow): Journey {
  let path: [number, number][] = [];
  try {
    path = JSON.parse(r.path);
  } catch {
    path = [];
  }
  return {
    id: r.id,
    startTs: r.start_ts,
    endTs: r.end_ts,
    distanceM: r.distance_m,
    mode: (r.mode as Mode | null) ?? null,
    suggestion: suggestMode({ distanceM: r.distance_m, mediumM: r.medium_m, fastM: r.fast_m }),
    path,
  };
}

export async function getLatestJourneyState(): Promise<JourneyState | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<JourneyRow>('SELECT * FROM journeys ORDER BY end_ts DESC LIMIT 1;');
  if (!r) return null;
  let path: [number, number][] = [];
  try {
    path = JSON.parse(r.path);
  } catch {
    path = [];
  }
  return {
    startTs: r.start_ts,
    endTs: r.end_ts,
    distanceM: r.distance_m,
    mediumM: r.medium_m,
    fastM: r.fast_m,
    pointCount: r.point_count,
    lastLat: r.last_lat,
    lastLon: r.last_lon,
    path,
  };
}

// Writes the states produced by foldIntoJourneys. When extendedFirst is
// true the first state replaces the latest stored journey (its tag, if
// any, is kept); the rest are new rows.
export async function saveJourneyStates(states: JourneyState[], extendedFirst: boolean) {
  if (states.length === 0) return;
  const db = await getDb();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (let i = 0; i < states.length; i++) {
      const j = states[i];
      const vals = [j.startTs, j.endTs, j.distanceM, j.mediumM, j.fastM, j.pointCount, j.lastLat, j.lastLon, JSON.stringify(j.path)] as const;
      if (i === 0 && extendedFirst) {
        await db.runAsync(
          `UPDATE journeys SET start_ts = ?, end_ts = ?, distance_m = ?, medium_m = ?, fast_m = ?, point_count = ?, last_lat = ?, last_lon = ?, path = ?
           WHERE id = (SELECT id FROM journeys ORDER BY end_ts DESC LIMIT 1);`,
          ...vals
        );
      } else {
        await db.runAsync(
          `INSERT INTO journeys (start_ts, end_ts, distance_m, medium_m, fast_m, point_count, last_lat, last_lon, path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          ...vals
        );
      }
    }
    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  }
}

// Journeys worth showing (long enough), newest first, within the filter
// (by the Berlin day each one started).
export async function listJourneys(f: FilterArg = ALL_TIME, limit = 200): Promise<Journey[]> {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.getAllAsync<JourneyRow>('SELECT * FROM journeys ORDER BY start_ts DESC LIMIT ?;', limit);
  return rows
    .filter((r) => isWorthShowing({ distanceM: r.distance_m, startTs: r.start_ts, endTs: r.end_ts }))
    .filter((r) => dayMatchesFilter(europeBerlinDateKey(r.start_ts), f.preset, now, f.date))
    .map(toJourney);
}

export async function setJourneyMode(id: number, mode: Mode | null) {
  const db = await getDb();
  await db.runAsync('UPDATE journeys SET mode = ? WHERE id = ?;', mode, id);
}

// Distance per mode within the filter. Untagged journeys are grouped as
// `null` rather than guessed.
export async function getModeTotals(f: FilterArg = ALL_TIME): Promise<{ mode: Mode | null; distanceM: number; count: number }[]> {
  const journeys = await listJourneys(f, 2000);
  const totals = new Map<Mode | null, { distanceM: number; count: number }>();
  for (const j of journeys) {
    const t = totals.get(j.mode) ?? { distanceM: 0, count: 0 };
    t.distanceM += j.distanceM;
    t.count += 1;
    totals.set(j.mode, t);
  }
  return [...totals.entries()]
    .map(([mode, t]) => ({ mode, ...t }))
    .sort((a, b) => b.distanceM - a.distanceM);
}
