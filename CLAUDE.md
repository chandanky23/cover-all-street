# Duppy Map — CLAUDE.md

This file orients any Claude Code session working in this repository. The full,
authoritative spec is **`plan.md`** (copied verbatim from
`DUPPY_MAP_IMPLEMENTATION_PLAN_v5.md`, versions V1–V5). Read `plan.md` in full
before doing substantial work — this file is a condensed map of it, not a
replacement. If this file and `plan.md` ever disagree, `plan.md` wins; update
this file to match rather than the other way around.

## What this is

**Duppy Map** — a personal gift app for one person. It quietly records travel
around Berlin in the background, paints visited street segments and
neighbourhoods on a map, and shows simple exploration analytics (temporal
filters, most-visited streets, customizable heatmap). It ships as a signed,
sideloadable Android APK. No backend, no accounts, no cloud storage of
location data, no ads/analytics SDKs/subscriptions.

## Non-negotiables (see plan.md "Mission" + V5-C for full detail)

- All personal travel data stays on-device (SQLite). Map/street geometry data
  can be bundled static files.
- No login, cloud location DB, ads, analytics SDK, subscriptions, social
  feed, AI, or backend API. No paid infrastructure required.
- Must build as a **signed, installable Android APK**, shareable without
  Google Play.
- Visible tracking controls, location status, and a delete-all-data control.
  No tracking before informed consent.
- Never infer/paint routes across GPS gaps or count stationary jitter as
  coverage. Unvisited means "not recorded in the active filter," not "never
  been there."
- iOS/web are out of scope for v1; keep calculation logic platform-neutral
  so it's reusable later.
- Do not claim a real-device test (background GPS, locked screen, APK
  install) passed without actual device evidence. Mark **BLOCKED** if a
  physical device isn't available — never fake a pass with emulator-only
  evidence.

## Tech stack (plan.md "Technical decision")

Expo + React Native + TypeScript, Expo Router, `expo-sqlite`, `expo-location`,
`expo-task-manager`, `react-native-reanimated`, SVG for illustrations.
MapLibre (`@maplibre/maplibre-react-native`) for the map — needs a dev/native
build, not Expo Go; verify compatibility with the chosen Expo SDK before
committing. OSM-derived street geometry + administrative polygons, correctly
attributed (ODbL). No bulk-downloading from public OSM tile servers — use a
licensed tile source or a bundled offline Berlin dataset. Avoid Next.js (adds
webview complexity around the core native background-GPS feature).

## Design tokens (plan.md "Design direction" + V5-B; verify against the 4 reference screenshots)

| Token | Hex | Use |
|---|---|---|
| cream | `#FFF7E9` | main surface |
| sage | `#8FA994` | primary brand |
| lavender | `#B9A0D8` | accent |
| forest | `#405E50` | text/buttons |
| blush | `#F0D8D9` | secondary accent |

Default heatmap bands (visits): `0` grey `#C8CBC4`, `1` light lavender
`#DCC6ED`, `2–4` lavender `#B9A0D8`, `5–9` sage `#8FA994`, `10+` forest
`#405E50`. Coverage mode uses the same five colours over `0% / (0,25] /
(25,50] / (50,75] / (75,100]`. Both **boundaries and colours are user-editable
per V5** (this overrides the earlier "keep thresholds fixed" language in V3).

Rounded corners ~18–28dp, generous padding, soft low-contrast surfaces,
touch targets ≥44–48dp. Friendly rounded sans UI font, licensed/open fonts
only. Original botanical illustrations inspired by (not copied from) the four
reference screenshots — muted sage/lavender/cream, retro botanical poster
mood. App chrome always uses the brand tokens above, even when the user
customizes heatmap colours.

## Data model (plan.md "Local architecture" + V2 correction + V5-A)

Key tables: `app_settings`, `geo_dataset`, `areas`, `street_segments`,
`observations` (short retention, raw GPS only), `segment_visits` (all-time
rollup), `area_visits`, and the **mandatory** time-indexed
`segment_traversals` table (started_at_utc/ended_at_utc, local_date,
local_weekday, covered_from_m/covered_to_m, confidence, dataset_version) —
all-time aggregates alone cannot support the required date/weekday filters.
Heatmap band boundaries + colours persist as versioned settings (SQLite),
separate from and never mutating traversal history.

Coverage = union of observed intervals per segment within the active filter,
never the sum of repeat-traversal distances. Frequency = deduplicated
traversal events / distinct visit-days, never raw GPS point count.

## Required repo artifacts (plan.md V4 "Required repo artifacts")

Create and keep current under `docs/`:
- `docs/STATUS.md` — phase dashboard: `NOT_STARTED | IN_PROGRESS | BLOCKED |
  COMPLETE`, owner, changed files, commands/test results, blockers, next
  action. Update after every phase and meaningful subphase.
- `docs/DECISIONS.md` — architecture decisions and rationale (native module
  versions, location strategy, tile/OSM source, retention, signing).
- `docs/DESIGN.md` — screen-by-screen design spec + reviewable mockups for
  all 9 screen/state categories listed in V5-B, required **before** full UI
  implementation.
- `docs/QA.md` — real-device test checklist and evidence.
- `docs/RELEASE.md` — APK build/signing instructions (never commit secrets).

## Phase order and gates (plan.md "Delivery phases", revised by V2/V3/V5)

0. **Feasibility spike** — Expo init, MapLibre renders Berlin on a physical
   device, background location → SQLite with screen locked (real walk),
   signing path to APK. Hard gate before any real UI work.
1. **Design system** — original logo/splash/icon, theme tokens, static
   screens with mock data, `docs/DESIGN.md` sign-off (V5 mandates this gate
   before full implementation).
2. **Geography** — Berlin/Bezirk/Ortsteil geometry + eligible street
   segments, viewport rendering, tap hit-testing, unit tests for lengths/
   coverage.
3. **Tracking** — permissions, foreground service, background task, locked-
   screen/app-switch device test.
4. **Matching + temporal analytics** — map matching, jitter filtering,
   `segment_traversals`, date/weekday `ExplorationFilter`, heatmap
   classifier module with exact-boundary tests (0,1,3,4,10,11,25,26 /
   0,25,50,75,100%).
5. **Polish + performance** — motion, fast filter/palette switching without
   map remount, battery checks, accessibility.
6. **Signed APK** — clean-install smoke test, full privacy/data audit,
   checksummed release artifact.

Each gate needs **evidence** (screenshots, logs, device notes), not just
"it compiles." Mark a phase **BLOCKED — requires device verification** rather
than PASSED when physical hardware isn't available.

## Status report format (plan.md "Mandatory phase status report")

```
DUPPY MAP — PHASE [N] STATUS
Status: PASSED | BLOCKED | FAILED
Implemented: ...
Files changed: ...
Tests run and results: ...
Android device evidence: ...
Known issues / risks: ...
APK or screenshot artifacts: ...
Next phase: ...
Decision needed from owner: ... (only if blocking)
```

## Working conventions in this repo

- Treat `plan.md` as frozen requirements; don't silently narrow or reinterpret
  it. If a requirement seems to conflict with another part of the plan
  (e.g. V3 "fixed thresholds" vs V5 "editable thresholds"), the later
  version (V5) wins — this is already resolved in the plan text itself.
- Verify actual available package/model versions before committing to them;
  don't assume specific Expo/MapLibre/model-ID strings from the plan still
  exist — check and record the real ones in `docs/DECISIONS.md`.
- No agents should edit the same file simultaneously; keep PR/commit
  boundaries small per phase.
- Stop and ask the user (not just proceed) for: scope changes, paid
  services, any data transmission, permissions beyond location, or
  subjective brand/visual calls the reference screenshots don't settle.
- Never claim a physical-device test, background tracking, or APK install
  was verified without real evidence attached.
