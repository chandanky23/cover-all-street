# DUPPY MAP — Implementation Plan for Claude Development Team

Version: 4.0 (V1 + V2 + V3 + orchestration) | Target: Android shareable APK | Product: Personal gift, Berlin-first | Platform: Android initially; iOS/web later

## Mission and non-negotiables
Build **Duppy Map**, a delightful, privacy-first Android app that quietly records a person's travels around Berlin, paints visited street segments and neighbourhoods, and shows simple exploration analytics. It must work while the screen is locked and the user switches apps, within Android's background-location and battery constraints. This is a personal gift, not a marketplace or startup platform.

- No account, login, cloud location database, ads, analytics SDK, subscriptions, social feed, AI, or backend API.
- All personal travel data stored locally on the phone. Map/street base data may be distributed as bundled files or static downloads.
- App must build as a **signed, installable Android APK**, shareable directly (e.g. via a file link), without Google Play.
- No automatic upload of location points, street visits, or analytics.
- iOS/web are future considerations; do not implement them in v1. Preserve platform-neutral calculation logic.
- Do not falsely infer routes through GPS gaps or count stationary GPS jitter as street coverage.
- Do not silently track before informed consent. Include visible tracking controls, location status, and delete-all-data control.
- Prioritize polish, reliability and battery life over feature breadth.

## Technical decision
Use **Expo + React Native + TypeScript**, **Expo Router**, **expo-sqlite**, **expo-location**, **expo-task-manager**, **react-native-reanimated**, and SVG for decorative illustrations. Evaluate `@maplibre/maplibre-react-native` compatibility with the chosen Expo SDK and Android build before committing; it needs a development/native build, not Expo Go. For map data, use OpenStreetMap-derived street geometries and administrative polygons with correct attribution and ODbL compliance. Use an appropriate legal tile source or self-hosted/static tiles; **do not bulk-download from public OSM tile servers**. Prefer a light offline-first Berlin vector dataset if feasible, otherwise a reliable tile provider for basemap with no user-location upload. Verify all library versions and native requirements at project creation.

**Avoid Next.js**: wrapping a Next.js site introduces webview/plugin complexity for the central native background GPS feature. React Native is the simpler long-term foundation. A future web experience can reuse TypeScript calculation code, but should not promise background tracking.

## Design direction
Source reference images: four supplied screenshots showing muted sage green, lavender/lilac, warm cream, wavy checkerboard, oversized daisy/leaf silhouettes, retro botanical poster compositions, and soft editorial styling. Do **not** copy Pinterest interface chrome or recreate copyrighted art directly; create original assets inspired by the mood.

Suggested tokens (adjust after screenshot review):
- cream `#FFF7E9` (main surface)
- sage `#8FA994` (primary brand)
- lavender `#B9A0D8` (accent)
- deep forest `#405E50` (text/buttons)
- blush `#F0D8D9` (secondary accent)
- unvisited road grey `#C8CBC4`
- visited road sage `#6C977E`; frequent road deep green `#386B54`

Typography: friendly rounded sans for interface, optional expressive display type for title; use licensed/open fonts only. Rounded corners ~18–28dp, spacious padding, low-contrast soft surfaces, gentle elevation, touch targets >=44–48dp, readable text contrast. Decorative flowers should appear in onboarding/empty states/headers, never obscure roads or important labels.

Animation: soft splash bloom, map reveal on first load, restrained bottom-sheet spring, number count-up when coverage changes, subtle street highlight on selection. Respect reduced-motion settings. Avoid heavy continuous animation while tracking.

## User journeys and screens
1. **First launch / welcome**: Duppy Map logo, short personal message, original botanical illustration; `Start exploring Berlin`.
2. **Permission education**: explain foreground vs background location, why tracking is needed when locked, local-only data, battery tradeoff. Request permissions progressively. Android 11+ generally requires guiding user to Settings for `Allow all the time` after foreground permission; do not assume an OS dialog always offers it. Handle approximate location, denied, revoked and permanent denial gracefully. Explain foreground-service notification.
3. **Home map**: Berlin overview with district polygons and coverage shading, total Berlin coverage, tracking status, one-tap recenter; tap district to zoom; zoom into neighbourhoods then street network. Map remains functional with no observations (grey/empty state).
4. **Area detail bottom sheet**: area name, coverage %, covered/eligible street length, visited streets, distinct visit-days; tap to zoom further.
5. **Street detail bottom sheet**: street name, visited segment length / total eligible length, first/last seen, estimated distinct visits or visit-days, confidence/unknown indication. Never pretend unobserved routes were visited.
6. **Insights**: simple overall totals, district breakdown, visited street length, areas explored, repeat visits; no arbitrary proprietary 'city familiarity' score in v1.
7. **Settings**: tracking on/off, GPS and permission status, battery-optimization guidance, local-data explanation, export backup (optional if easy), delete all data with confirmation, app version, OSM attribution, privacy notice.

Navigation: home map as primary screen; small bottom nav or compact floating buttons for Map / Insights / Settings. Prefer native bottom sheets and predictable Android back behavior.

## Coverage definitions
- **Eligible street network**: preselected pedestrian-accessible public roads/paths from OSM; exclude private/inaccessible roads and motorway-only segments. Document the chosen OSM tags and include dataset version.
- **Street segments**: split OSM ways at intersections and optionally into manageable lengths; assign stable IDs within the versioned dataset.
- **Visited**: mark only plausible traversed portions supported by GPS samples and map matching; don't infer straight-line routes across gaps.
- **Area coverage**: `sum(visited eligible segment metres) / sum(all eligible segment metres)` within each boundary. For boundary-crossing segments, use clipped lengths or a documented deterministic allocation.
- **Frequency**: distinct traversal events or visit-days, not raw GPS point count; debounce repeated samples and stationary jitter.
- **Mode**: walking/biking/driving classification is uncertain; for v1 label metric as 'streets travelled' and do not claim 'walked' unless movement mode is validated.
- **Accuracy**: persist GPS accuracy, reject poor points, detect impossible speeds/jumps, avoid counting parallel streets from noisy GPS. If map matching is uncertain, don't count the segment.
- **Data gaps**: explicit unknown, not visited; no route reconstruction from distant last/current locations.

## Local architecture
```
Android OS location callbacks / foreground service
  -> expo-task-manager background task (registered at module top-level)
  -> validate GPS accuracy/time/speed
  -> bounded batch of points / candidate trajectory
  -> local map matcher (spatial index against versioned Berlin street graph)
  -> update visited segment intervals and visit-day aggregates
  -> expo-sqlite
  -> MapLibre layers + district aggregates + insights
```

For Android, configure background location permission and appropriate foreground service type/notification. Verify actual behavior on a **physical device** while locked, after app switch, and after OS battery optimization. A user force-stop can stop tracking; do not promise uninterrupted tracking under every condition. Use adaptive location accuracy/intervals and battery-aware batching. Tracking must be visible, user-controlled and clearly disclosed.

Suggested DB tables:
- `app_settings(key, value)`
- `geo_dataset(version, installed_at, checksum)`
- `areas(id, name, type, parent_id, eligible_length_m)`
- `street_segments(id, street_id, name, geometry_ref, eligible_length_m, area_ids)`
- `observations(id, ts, lat, lon, accuracy_m, speed_mps, processed)` **short retention only**
- `segment_visits(segment_id, first_seen, last_seen, covered_length_m, visit_days, traversal_count, confidence)`
- `area_visits(area_id, first_seen, last_seen, distinct_visit_days)`

Implement transactional migrations and indexes. Do not store detailed raw traces indefinitely by default. Use deterministic geometry IDs and migration strategy when map data changes. Avoid overbuilding a general-purpose spatial server.

## Dataset preparation
Create a reproducible build-time script to obtain Berlin boundary, 12 Bezirke, neighbourhood polygons where licensing/definitions are consistent, and OSM street network. Beware Berlin's Ortsteile vs informal Kieze; v1 should use official Bezirke and Ortsteile rather than inventing a universal 'neighbourhood' taxonomy. Generate compact versioned GeoJSON/PMTiles/MBTiles/SQLite artifacts as appropriate; evaluate app size, offline performance and legal attribution. Only ship what v1 needs. Keep user data separate from immutable public map geometry.

## Delivery phases and gates

### Phase 0 — Repo and feasibility spike (0.5–1.5 days)
- Initialize Expo TypeScript app and dev build configuration.
- Confirm MapLibre renders Berlin on a physical Android phone.
- Confirm expo-location + task-manager can capture background points into SQLite with screen locked; run a 20–30 minute real walk.
- Verify signing/build path to shareable APK.
**Gate:** working spike APK, permission flow, background samples persisted, map visible. If failure, diagnose native module/Android limitations before UI build.

### Phase 1 — Design system and prototype (1–2 days)
- Inspect the four uploaded references; create original botanical illustrations, logo, app icon and theme tokens.
- Build polished static welcome, map shell, area/street sheets, insights, settings using mock data.
- Define motion and accessible interaction behavior.
**Gate:** screenshots/video accepted, no GPS dependencies for UI review.

### Phase 2 — Berlin geographic data (1–3 days)
- Build deterministic dataset pipeline; create Berlin/Bezirk/Ortsteil geometries and eligible street segments.
- Implement viewport-aware rendering, tap hit-testing, zoom transitions and OSM attribution.
- Add unit tests for segment lengths and area coverage.
**Gate:** tapping a street/area displays correct names and geometry; acceptable map FPS and package size.

### Phase 3 — Native location and permissions (1–3 days)
- Implement staged permissions, tracking controls, foreground service notification, background task, adaptive sampling.
- Save observations locally and recover after app restarts where OS permits.
- Test locked screen, app switch, denied/revoked permission, low battery, GPS off.
**Gate:** 30–60 minute physical walk captures useful points with phone locked and no silent permission failures.

### Phase 4 — Matching and analytics (2–4 days)
- Implement conservative map matching, jitter filtering, GPS gap handling, visited segment intervals, visit-day deduplication.
- Compute area rollups and street/area details; support no-data and low-confidence cases.
- Write unit tests with synthetic routes and at least two recorded real-world walks.
**Gate:** routes paint correct streets without inventing connectors; stats reconcile with visited segments.

### Phase 5 — Gift-quality polish (1–2 days)
- Add subtle original floral motion, delightful transitions, warm copy, refined empty/loading/error states, optional personalized greeting.
- Tune map readability and color accessibility; ensure reduced motion.
- Fix UI edge cases, touch behavior, performance and battery regressions.
**Gate:** polished on a typical Android device, no obvious stutter or visual clipping.

### Phase 6 — APK release and handoff (0.5–1.5 days)
- Configure package name `com.duppymap.app` (or user-selected unique identifier), version, icons, permissions and release signing.
- Build a **release APK** (`.apk`, not `.ipk` or Play Store `.aab`), verify on clean Android install.
- Smoke test: install, grant permissions, lock phone, walk, reopen, see updated map, view details, stop tracking, delete data.
- Deliver APK, checksum, source repo, build instructions, privacy/permissions explanation, known limitations.
**Gate:** recipient can install APK without Google Play and use core features.

**Estimate:** ~7–17 focused developer-days for a functional polished gift, depending heavily on map matching and offline map complexity. These are planning ranges, not promises. Do not compress quality gates to meet a date.

## Agentic Claude execution protocol
Roles can be parallel subagents or sequential responsibilities:
- **Lead/Integrator**: owns scope, architecture, task board, code review, integration, and release gates.
- **Design Agent**: design tokens, original assets, animations, screen implementation.
- **Geo Agent**: OSM processing, map geometry, matching, coverage tests.
- **Android Agent**: permissions, background service, SQLite lifecycle, physical-device QA, APK signing.
- **QA Agent**: acceptance criteria, unit/integration checks, edge-case testing, release smoke checklist.

Avoid parallel edits to shared app entrypoints, package files, and DB schemas. Lead defines interfaces before splitting work. Each phase has a small PR/commit boundary. Agents may not mark a phase complete based only on code compilation: attach evidence (screenshots, logs, device test notes). Where physical device access is unavailable, mark gate **BLOCKED — requires device verification**, not PASSED.

### Mandatory phase status report
At the end of each phase, output:
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
Maintain `docs/STATUS.md` with a phase checklist, latest result, next action and blockers. Update it after every phase. Stop and request approval for scope changes, paid services, data transmission, or any permissions beyond the agreed location functionality. Otherwise progress autonomously through approved phases.

## QA / acceptance checklist
- [ ] Android APK installs without Google Play and launches offline after initial geographic data provision.
- [ ] All user travel data remains on-device; inspect network traffic for unintended telemetry.
- [ ] No location collection before informed permission and tracking enabled.
- [ ] Android background location works with screen locked and app switched on physical test device.
- [ ] Tracking can be stopped; Android notification accurately reflects ongoing tracking.
- [ ] Revoked permissions and GPS-disabled states do not crash app.
- [ ] Street painting is conservative; no invented routes over missing data.
- [ ] Berlin overview, Bezirk, Ortsteil and street tap interactions work.
- [ ] Street/area metrics are consistent and explainable.
- [ ] Smooth animations, proper contrast, readable labels, Android back handling.
- [ ] No account, no remote user DB, no required login.
- [ ] Delete all personal data works; uninstall removes app-private data (subject to OS backup behavior).
- [ ] OSM/data licenses and attribution are correctly handled.
- [ ] Release APK is signed, versioned, checksummed, and verified on clean install.

## Explicitly out of scope
No Apple release, web/PWA tracking, user profiles, sync, notifications unrelated to tracking, recommendations, AI, social comparison, payments, gamification, restaurant listings, routes to unexplored areas, multi-city ingestion, complex trip history, or elaborate analytics. Avoid backend unless a documented blocker proves it necessary.

## Start instruction to Claude team
1. Read this plan and inspect the four reference screenshots.
2. Start with **Phase 0** technical feasibility, not broad UI implementation.
3. Create `docs/STATUS.md`, `docs/DECISIONS.md`, and a concise task board.
4. Choose exact supported package versions after compatibility checks.
5. Implement each phase and report the gate outcome using the mandatory status template.
6. Do not claim physical background tracking is verified without a real device test.
7. Final deliverable is an installable, signed **Duppy Map Android APK**, source code and concise install instructions.

---
# V2 ADDENDUM — Temporal exploration, most-visited streets, brand and performance

**This addendum supersedes any narrower MVP language above. These features are required for the gift release, not optional future enhancements.**

## Temporal filters — core user experience
- The map and Insights share one active filter state. Presets: All time, Today, Yesterday, Last 7 days, Specific date, Custom inclusive date range, Every Monday/Tuesday/Wednesday/Thursday/Friday/Saturday/Sunday. Weekday may optionally be combined with an inclusive date range.
- On changing the filter, update **all** heatmap colours, highlighted visited street segments, district/neighbourhood coverage percentages, street detail metrics, and the most-visited streets list together. Show a visible active filter chip and Reset to All time.
- Examples: “Every Monday” shows the union of street segments traversed on recorded Mondays; “1–15 October” shows only observations from those dates; “Mondays in October” intersects both conditions. Never paint inferred paths between GPS gaps.
- Date handling: store UTC event timestamps; derive calendar dates and weekdays using the selected local timezone (default Europe/Berlin), with DST and midnight-boundary tests. End dates are inclusive. Show an elegant themed no-data state when no observations match.
- Prefer a bottom-sheet filter UI with native-feeling calendar selection, weekday chips, gentle spring transitions, accessible tap targets and no unnecessary steps.

## Most-visited streets and per-street history
- Insights prominently includes **Top streets** ranked by deduplicated traversal events, with distinct visit-days as an additional robust measure. Never count GPS samples as visits or repeatedly count someone stationary on a street.
- Each row shows street name, number of visits, distinct days, and optionally length covered. Tap to focus the map and open a street details bottom sheet.
- Street detail shows metrics within the active filter, and can clearly compare against All time. Include a compact weekday distribution if useful; avoid elaborate charts.
- Distinguish frequency from coverage: walking the same 200m ten times is ten traversals but does not imply ten times the street coverage.

## Local data model correction (mandatory)
All-time `segment_visits` aggregates **alone cannot support historical filters**. Persist compact time-indexed traversal events on-device, even after raw GPS is purged:

```
segment_traversals(
  id, segment_id, started_at_utc, ended_at_utc,
  local_date, local_weekday, covered_from_m, covered_to_m,
  confidence, dataset_version
)
```

Indexes: `(local_date, segment_id)`, `(segment_id, started_at_utc)`. Optional daily rollups for performance: `segment_daily_stats(segment_id, local_date, traversal_count, covered_intervals, first_seen_utc, last_seen_utc)`.

- A filter's **coverage** is the union of observed intervals per segment within that filter, not the sum of traversal distances; repeated passes must not inflate coverage.
- Retain timestamped traversal records locally as the source of truth; short-retention raw GPS can be removed after reliable processing. Data deletion must remove all personal history and derived caches.
- Use a single typed `ExplorationFilter` model for SQL queries, map layers, insights and street details. Do not maintain conflicting independent screen filters.

## Brand, logo, splash and elegant performance
- Create an **original Duppy Map logo** based on a simple winding-street/map-pin motif combined with an organic botanical leaf or flower. Use the supplied screenshot aesthetic: sage green, lavender, warm cream, soft editorial typography. Ensure legibility at launcher-icon size. Do not copy artwork from Pinterest.
- Deliver adaptive Android launcher icon, app name, small monochrome foreground-service notification icon, and a branded native splash screen. Splash should transition quickly into the first frame; do not force a long animation or block startup for map downloads.
- Consistent theme across welcome, permission education, native/system-bar styling, map controls, filter sheets, date picker, insights, street cards, settings, loading/error/empty states and tracking notification.
- Motion: subtle splash-to-home handoff, responsive spring sheets, smoothly recoloured map layers when filters change, gentle count-up for numbers; respect reduced motion and avoid distracting continuous effects.
- Performance: keep a responsive cached Berlin overview visible immediately; load/render street detail by zoom/viewport, never remount the full map for a filter change. Batch source/layer updates, use indexed SQLite queries and memoized/cached aggregates. Avoid running spatial calculations on the JS UI thread. Test cold start, map pan/zoom and filter switching on a mid-range physical Android device.
- Do not add a server to implement temporal analytics; all querying and aggregation remains on-device.

## Revised agentic phase ownership and gates
- **Phase 0:** verify Android background GPS, map SDK, local SQLite and APK signing on physical hardware; verify intended data/event storage approach.
- **Phase 1 — Design:** original logo, launcher icon, splash, visual system, all main screens, filter sheet and top-streets cards using mocked data. Gate: coherent screenshot/video walkthrough.
- **Phase 2 — Geography:** Berlin boundaries/Ortsteile/street segments, viewport rendering, map tap hit testing. Gate: performant zoom and street selection.
- **Phase 3 — Tracking:** permissions, foreground service, locked-screen tracking, local event capture. Gate: physical-device walk with lock/app switching.
- **Phase 4 — Matching + temporal analytics:** map matching, timestamped traversals, date/weekday filters, all filtered heatmaps/percentages, top streets and street details. Gate: synthetic Monday/Tuesday datasets yield correct distinct maps; date ranges inclusive; visit counts deduplicated; repeat passes do not inflate coverage; DST tests pass.
- **Phase 5 — Polish + performance:** smooth transitions, fast filter switching, accessible controls, branded splash, empty states, battery checks. Gate: no noticeable UI freezes and visual consistency across screens.
- **Phase 6 — Signed APK:** clean-install test, permission test, background walk, filter regression, local-only data audit, release signing and direct-share APK.

At every phase completion, Claude must update `docs/STATUS.md` with **PASSED / BLOCKED / FAILED**, changed files, tests, screenshots/device evidence, known limitations and next action. Never mark native behavior passed without real-device verification.

## Additional acceptance checks
- [ ] Selecting a specific day updates the map, area percentages, top streets and street detail consistently.
- [ ] “Every Monday” includes all recorded Mondays but excludes other weekdays; combined weekday+date-range filters work.
- [ ] A street traversed five times in one day reports five genuine traversals but one visit-day; stationary jitter does not create visits.
- [ ] Multiple traversals of the same segment do not overstate unique covered street length.
- [ ] Time filters work offline without any backend.
- [ ] Original Duppy Map logo, adaptive icon and splash are polished and visually consistent with the reference palette.
- [ ] Filter changes are responsive and do not blank/recreate the entire map.


---

# V3 ADDENDUM — User-configurable street heatmap and map-first interaction

**Priority: core acceptance criteria.** This section supersedes any earlier fixed street-colour guidance. The app must be primarily an interactive street map, not a dashboard with a decorative map.

## User experience: street colour intensity
- At city zoom, display Bezirke/Ortsteile shaded by a clearly labeled **area metric** (default: eligible street-length coverage %, computed using the active time filter). At street zoom, render actual **street segments** as vector line layers coloured by their **visit-frequency band**. This avoids falsely treating an entire named street as uniformly visited.
- Provide a compact floating **legend** on the map, expandable to show each colour, numerical range, and meaning. The legend changes when the selected metric or palette changes.
- Default frequency bands based on **distinct traversals** within the active filter: `0` unvisited, `1`, `2–4`, `5–9`, `10+`. These are editable **colour assignments** in V3; keep thresholds fixed for V3 to avoid adding complex rules editing. Count visits from deduplicated traversal events, not GPS fixes.
- Include a simple toggle in the legend/settings: **Colour by: Visits | Coverage**. Visits uses frequency bands above. Coverage uses `0%, >0–25%, >25–50%, >50–75%, >75–100%` for each segment's observed unique length. Ensure the legend always reflects the selected metric. Area polygons use area coverage bands by default and should not be mistaken for street visit-frequency bands.
- For time-filtered views, calculate frequency and coverage from only matching traversals. The same street may be dark on All time but pale on Mondays. Unvisited means **not recorded within the active filter**, not proof the person has never been there.
- Preserve road names, selected street outline/halo, and tap targets; avoid colouring unrelated basemap road layers. Where roads overlap, selected street must remain identifiable. Map should stay legible with any allowed palette.

## Heatmap appearance controls
Add a dedicated **Map appearance** screen or bottom sheet reachable from the map legend/paint-palette icon and from Settings. Keep it minimal and native-feeling:
1. **Colour preset**: `Duppy Garden` (default), `Lavender Dream`, `Forest Walk`, `High Contrast`, `Custom`.
2. **Editable swatches**: Unvisited, Once, 2–4, 5–9, 10+ (and separately coverage bands when Coverage mode selected). Tap a swatch to open a small colour picker with preset swatches plus optional HEX input. Live-preview the selected palette on a small sample road diagram and the actual map.
3. **Reset to Duppy defaults**, with confirmation only if there are unsaved edits. Show a visible legend and short explanation of the bands.
4. Persist `heatmap_metric`, `palette_preset`, and per-band hex colours in local SQLite/settings. Load them before the map's first meaningful paint to avoid a visible flash of wrong colours. Palette changes must never mutate traversal records or recalculate underlying visit counts.
5. Validate custom colours for valid HEX and minimum distinguishability from adjacent bands/background. Warn about low contrast and provide a high-contrast preset; do not silently discard custom choices. Ensure selected roads and labels remain legible.
6. Use brand colours for the **app chrome** regardless of the user's map palette. Custom heatmap colours affect **only data overlays, legend, and related charts**, not splash, typography, buttons or navigation. This preserves the sage/lavender/cream identity.

### Initial default: Duppy Garden
| Band | Meaning | Default HEX |
|---|---|---|
| 0 | Not recorded in selected period | `#C8CBC4` soft grey |
| 1 | One traversal | `#DCC6ED` light lavender |
| 2–4 | Occasional | `#B9A0D8` lavender |
| 5–9 | Frequent | `#8FA994` sage |
| 10+ | Very frequent | `#405E50` forest green |

Use a cream/off-white basemap where licensing/style supports it, subdued parks/water, and restrained road labels. Avoid relying on colour alone: legend text, tap details, and optional line pattern/width for selected/unvisited streets. Validate readability on real Android screens.

## Map-first interaction contract
- Map fills most of the viewport. Small unobtrusive controls: current location, tracking indicator, time-filter chip, heatmap legend/palette, and one entry to Insights.
- Pinch zoom/pan should remain responsive during tracking and colour changes. At zoomed-out levels, show smooth area fills; at higher zoom, transition to street-line colours. Do not draw every street in Berlin at full resolution on the initial frame.
- Tap a street segment: highlight only the selected street/segment and open a themed bottom sheet with **street name, active filter, frequency band, traversal count, distinct visit-days, covered metres, and all-time comparison**. Tap a district: show coverage summary and zoom/drill down.
- User changes palette -> visible road colours and legend update **without reloading map, losing camera position, or resetting selected street**. User changes date/weekday -> map, legend values, street sheet and Insights update atomically from the same filter.
- Animate palette changes lightly (short cross-fade/interpolation when feasible), avoid expensive per-feature React rerenders, and respect system reduced-motion preferences. No long animation should block gestures.

## Implementation architecture
- Central typed configuration:
  `HeatmapSettings { metric: 'visits'|'coverage'; preset: string; frequencyColors: Record<'zero'|'one'|'twoToFour'|'fiveToNine'|'tenPlus', string>; coverageColors: Record<string,string> }`.
- Central selector: `(ExplorationFilter, HeatmapSettings, visibleSegmentIds) -> MapFeatureState/GeoJSON properties + legend`. Query/filter aggregates via indexed SQLite. Palette-only changes should reuse cached frequency/coverage aggregates and update style expressions/paint properties only.
- Use MapLibre vector layers or feature-state for segment properties; do **not** regenerate Berlin-wide GeoJSON every time a swatch changes. Render/compute per visible tile/viewport at street zoom, and area-level aggregates at district zoom.
- Ensure each street segment has a stable dataset ID and maps consistently to SQLite traversal events. Include loading and empty states with the same Duppy aesthetic.
- Save settings transactionally on-device. No server is required to store colour choices or GPS history.

## Additional agent responsibilities and phase gates
- **Design agent, Phase 1:** deliver logo/splash, map-first mockups at Berlin/Ortsteil/street zoom, five-band legend, palette editor, default and custom palette states, selected street sheet, light/dark environmental readability checks. **Gate:** screenshots demonstrate coherent botanical theme and legible roads with two contrasting palettes.
- **Map/data agent, Phases 2 and 4:** ensure stable segment IDs, map layer order, per-segment frequency/coverage values, accurate colour classification and area-vs-street zoom switching. **Gate:** fixture of streets with 0/1/3/7/12 traversals renders in five expected bands.
- **UI agent, Phases 1 and 5:** build accessible swatch editor, presets, instant preview, reset, legend, gesture-safe floating controls and smooth bottom sheet. **Gate:** changing all five colours keeps map pan/zoom and selected street intact.
- **Local data agent, Phase 4:** persist and restore palette + metric independently from tracking; reuse the V2 timestamped traversal source for time-filtered counts. **Gate:** app restart preserves palette; Monday filter recolours roads according to Monday-only traversals.
- **QA agent, Phases 5–6:** physical Android profiling and screenshots; check cold launch, gestures, filter switching, palette switching, background tracking, data privacy, and direct-install signed APK. **Gate:** no full map remount or visible long freeze on a mid-range device.

## V3 acceptance checklist
- [ ] Street segments are actually coloured by visit frequency (not merely GPS trace polylines or district polygons).
- [ ] Default Duppy Garden palette is applied and documented.
- [ ] User can customize and save colours for each band; presets and reset work.
- [ ] Colour changes update map + legend instantly without changing underlying history.
- [ ] Time-filtered maps use time-filtered visit ratios and recolour accordingly.
- [ ] Area overview and street-level views are clearly differentiated and visually coherent.
- [ ] Street taps, district taps, zoom, pan, filter controls and bottom sheets remain smooth.
- [ ] Theme stays consistent even when user chooses a radically different data palette.
- [ ] Native splash, adaptive app icon and original Duppy Map logo are included.
- [ ] Signed shareable Android APK is tested on a physical phone; no Play Store required.

**Scope discipline:** no backend, login, cloud sync, social features, AI, recommendations, or arbitrary custom scoring. Keep frequency thresholds fixed for now; user-customizable *colours* are the new requirement. iOS/web remain future possibilities, not V3 deliverables.

---

# V4 — Claude Code orchestration, model routing, and execution command

This section is operational guidance for Claude Code. It does not add product features. **The orchestrator must read and follow the entire V1–V3 plan before implementation.**

## Model selection and verification

- **Orchestrator / architectural review:** use the newest **Opus** model actually available in the user's Claude Code environment, for high-impact decisions, Android background tracking diagnosis, security/privacy review and final integration audit.
- **Primary implementation agents:** use the newest available **Sonnet** for React Native UI, MapLibre overlays, SQLite/date filters, map matching, permissions, splash, icons, tests and APK pipeline.
- **Small scoped work:** use an available **Haiku** for isolated tests, documentation and routine cleanup where appropriate. Do not use Haiku for native GPS correctness, map-matching algorithms or architectural changes.
- **Important:** Model names and exact IDs change. Do not assume `claude-opus-5-5`, `claude-sonnet-5-5`, or `claude-haiku-5-5` exist. Check `/model` in Claude Code or the models actually offered by the connected provider. Use valid available IDs or family aliases supported by that installation. If a requested family is unavailable, fall back to Sonnet and log the substitution; never silently claim another model ran.
- Prefer **one coordinator plus at most two concurrent subagents**. Parallelize only disjoint files/modules; no agents should edit the same file simultaneously. Agents must report concise evidence to the coordinator. Avoid redundant full-repository reads and expensive repeated planning.

## Required repo artifacts and source of truth

- `DUPPY_MAP_IMPLEMENTATION_PLAN.md`: this complete plan, copied into repository root; keep requirements stable unless explicitly changed by user.
- `docs/STATUS.md`: phase dashboard (`NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETE`), phase owner, start/finish, changed files, commands and test results, open blockers, next action.
- `docs/DECISIONS.md`: concise architecture decisions and rationale; log native module versions, location strategy, tile/OSM source, local retention and signing strategy.
- `docs/QA.md`: real-device test checklist and evidence, including lock-screen/background GPS, map filters, palette persistence, performance, offline behavior and APK install.
- `docs/RELEASE.md`: APK build instructions, signing/key handling (never commit secrets), install and permission steps, and verified artifact location.
- Update `docs/STATUS.md` **after every phase and meaningful subphase**, including failures; never mark complete without passing its gate. If a task needs a real phone or credentials unavailable to the agent, mark **BLOCKED / NEEDS HUMAN VALIDATION**, not COMPLETE.

## Orchestrator execution contract

1. Read the full plan, inspect repository and environment, verify available Claude models and relevant Expo/Android package compatibility; summarize the implementation order and blockers in `docs/STATUS.md`.
2. Delegate narrowly: Design/UI agent; Geo/map/data agent; Native GPS/storage agent; QA/release agent (sequentially or at most two non-overlapping in parallel). Each delegation must specify **goal, exact files owned, dependencies, acceptance tests, and expected return format**.
3. **Phase 0 hard gate:** before substantial design work, prove that a development APK can run background location on a real Android device when locked and that locally saved samples survive app restart. Build and test on an actual device; if unavailable, stop at a clearly marked human-test checkpoint. Do not fake a pass with emulator-only evidence.
4. Proceed in the existing phase order, applying V2 time filters and V3 custom heatmap requirements as mandatory, not optional. Keep the app map-first and visually consistent with supplied sage/lavender/cream botanical references.
5. After each subphase: run typecheck/lint/tests as relevant, inspect diff, fix regressions, record evidence, update `docs/STATUS.md`, then hand off the next task. Do not repeatedly rewrite the entire plan or regenerate unchanged assets.
6. Require a final integration test: actual Android APK, local-only movement data, no login/backend, screen-off tracking, date/weekday filters, accurate street-frequency bands, palette editor persistence, smooth zoom/selection, logo/splash, and clean install. A build is not equivalent to a validated device test.
7. Deliver signed **shareable `.apk`** (not just `.aab`), reproducible build instructions, local artifact path, completed checklist and explicit remaining limitations. If signing keys/physical-device access are missing, provide a buildable candidate and precise human steps; do not claim release readiness.

## Copy-paste orchestrator command

From a terminal in the repository containing `DUPPY_MAP_IMPLEMENTATION_PLAN.md`:

```bash
claude --model opus "Act as Duppy Map's lead engineering orchestrator. Read DUPPY_MAP_IMPLEMENTATION_PLAN.md fully, including V2, V3 and V4. Verify available model IDs and tool capabilities before delegation; use Opus for architecture/review, Sonnet for primary coding, Haiku only for simple bounded tasks where available. Coordinate no more than two non-overlapping subagents at a time. First inspect the repository, create docs/STATUS.md, docs/DECISIONS.md, docs/QA.md and docs/RELEASE.md, and plan phases with gates. Start Phase 0 immediately: validate Expo native build feasibility, MapLibre compatibility, Android screen-locked background GPS and local SQLite persistence. Do not mark real-device tests complete without real-device evidence. Then implement all approved phases, including date/weekday-filtered street heatmaps, customizable palettes, botanical Duppy Map logo/splash, and a signed directly shareable Android APK. After each phase update docs/STATUS.md with changes, test results, blockers and next steps. Keep implementation minimal, local-first, polished and fast. Ask me only for decisions, credentials, signing keys or physical-device actions that cannot be completed autonomously. Never invent test results or pretend an APK was built if it wasn't."
```

**If `opus` is unavailable**, use `claude --model sonnet` and keep the same prompt. The `--model` option chooses the coordinator model; actual subagent model routing depends on the installed Claude Code version, agent configuration and plan entitlements. The coordinator must confirm rather than assume subagents ran on the requested model family.

## Optional dedicated agents (only if supported)

Create scoped Claude Code subagents via the installed agent mechanism (for example project `.claude/agents/` definitions or built-in Agent tool, as supported by the user's version). Each agent gets a short role description, permitted tool/file scope and a model family selected from available models. Suggested names:

| Agent | Model family | Ownership | Exit gate |
|---|---|---|---|
| `duppy-design` | Sonnet | Theme, logo, splash, map controls, colour editor, animations | Visual QA with theme and two palettes |
| `duppy-geo` | Sonnet | OSM segments, stable IDs, tiles, map matching, area aggregates | Fixture tests for 0/1/3/7/12 visits |
| `duppy-native` | Sonnet; Opus escalation | Background location, permissions, SQLite, battery and Android build | Locked-phone device test |
| `duppy-qa` | Haiku for scripted checks; Sonnet for complex QA | Automated checks, performance, APK installation checklist | Evidence-backed release report |

Agents should return: `files changed`, `commands run`, `results`, `risks`, `handoff`. The coordinator alone owns integration, final decisions, and `docs/STATUS.md` updates. Do not create elaborate agent infrastructure if a single Sonnet worker is faster for the current task.

---

# V5 REQUIRED ADDENDUM — Configurable heatmap thresholds and visual design sign-off

**This section overrides V3's instruction to keep heatmap thresholds fixed.** V1–V4 requirements remain mandatory. The product is named **Duppy Map** in all user-facing copy, Android application metadata, splash screen, launcher icon, and release notes.

## A. Editable heatmap bands: both boundaries and colours

The user must be able to customize **numeric ranges AND the corresponding colour** for each heatmap band. Offer two independently configurable modes:

1. **Visit frequency:** deduplicated street-segment traversal counts during the active date/weekday filter. Default bands: `0`, `1`, `2–4`, `5–9`, `10+` traversals. Default colours: `#C8CBC4`, `#DCC6ED`, `#B9A0D8`, `#8FA994`, `#405E50` respectively.
2. **Street-segment coverage:** percentage of the segment's length observed during the active filter, using unique covered intervals rather than summed repeat traversals. Default bands: `0%`, `(0%,25%]`, `(25%,50%]`, `(50%,75%]`, `(75%,100%]`; use the same five theme colours by default. Show a precise legend that explains the intervals. At district zoom, clearly label that polygon colours represent district coverage, not street traversal frequency.

**Editing UI:** Map > floating legend/palette control > **Customize heatmap** bottom sheet (also accessible in Settings). Provide preset selector, a mode toggle (Visits/Coverage), five band rows with numeric editable boundary controls and colour swatches, a small live-preview street diagram, Save, Cancel, and Reset to Duppy defaults. Show a small active legend on the map. Users can choose theme presets or valid custom HEX colours. Avoid a complex gradient editor or unlimited custom bands; five bands per metric is sufficient.

**Boundary validation:** Bands must be mutually exclusive, contiguous, ordered and exhaustive; no overlaps or gaps. Visit thresholds are nonnegative integers; zero is its own immutable band, the last band is open-ended, and the editable positive boundaries must be strictly increasing. Coverage thresholds are finite percentages between 0 and 100, with zero its own band and 100 included in the final band. On invalid input, show inline errors and disable Save. Do not silently reorder or reinterpret user thresholds. Define interval semantics explicitly in one shared pure classification module and test exact boundary values. Provide defaults and a one-tap reset per metric or all settings.

**Persistence and performance:** Save per-metric band boundaries and colours locally in SQLite (versioned settings JSON or normalized settings table); validate and migrate existing V3 colour-only settings. Never upload movement history or preferences. Reclassify from **cached numeric per-segment aggregates** after threshold changes; changing colours should update MapLibre paint expressions only, without recalculating GPS history. Preserve camera, street selection, active time filter and map gestures. Update map, legend, detail sheet and related charts coherently. Ensure changes survive app restart and that defaults are applied before first meaningful map paint.

**Example user preset:** `0 → grey`, `1–3 → lavender`, `4–10 → sage`, `11–25 → purple`, `26+ → deep green`. These are user-defined illustrative values, not new defaults.

## B. Prescriptive best-in-class visual specification and mandatory design gate

**Design goal:** gift-quality, elegant, responsive, map-first Android application with distinctive retro-botanical identity inspired by the provided references, but original artwork and components. This is a quality target, **not a claim that any Play Store benchmark has been met**. Use clean typography, consistent 8pt spacing, rounded sheets, restrained shadows, accessible contrast, tactile feedback and polished micro-interactions. No clutter, stock-looking templates, unnecessary dashboards, ads or monetization.

**Brand tokens:** cream `#FFF7E9`, sage `#8FA994`, lavender `#B9A0D8`, forest `#405E50`, blush `#F0D8D9`. App chrome and branding use these tokens even when the user customizes heatmap colours. Use muted OSM basemap styling, subdued parks/water, clear street labels, and street overlays that remain readable across zoom levels. Create an original minimal **Duppy Map** mark combining a winding route/map pin with a botanical petal or leaf; deliver adaptive Android icon, splash asset, small notification icon and scalable source artwork. Do not use third-party copyrighted illustration directly.

**Required design deliverables BEFORE full implementation:** create a screen-by-screen design specification in `docs/DESIGN.md` and actual reviewable mockups/screenshots (e.g. local image files or implemented mock screens) for: (1) native splash and logo, (2) welcome/permission education, (3) Berlin map at district zoom, (4) map at street zoom with five heatmap bands and compact legend, (5) selected-street bottom sheet, (6) date-range/weekday filter sheet, (7) heatmap appearance editor showing default and customized thresholds/colours, (8) most-visited streets and insights, (9) tracking/settings/empty state. Specify typography scale, spacing, component states, icons, colours, gestures, animations, dark/system-bar behaviour, and accessibility. The lead must review designs for theme consistency, information hierarchy, map legibility and feasibility; record sign-off or actionable issues in `docs/STATUS.md` before proceeding beyond mock UI.

**Splash and startup:** native splash appears immediately with cream background and centered original logo + Duppy Map wordmark; optional subtle leaf/route reveal only after native launch, capped to a brief transition and skipped under reduced-motion. Do not delay map interactivity for decorative animation. Display a coherent loading/skeleton state if local tiles or aggregates are not ready.

**Map-first layout:** map occupies the viewport; compact top filter chip and tracking state, floating locate/palette/legend controls, bottom contextual sheet and unobtrusive Insights entry. Pan/zoom/pinch and tap remain smooth. At lower zoom, show district coverage; at street zoom, actual visited street segments. A user palette edit or date-filter change must not remount the map or reset camera position. Preserve selection and accessibility labels. Use native/UI-thread animations where appropriate and measure on a real mid-range Android phone.

**Design QA gate:** verify mockups at representative Android screen sizes; compare default and radically customized palettes; check text/road contrast, legend clarity, safe areas, loading/empty/error states, gesture conflicts, reduced-motion support, and cold-launch/splash transition. Do not mark the design gate passed without reviewable visual artifacts. The design agent should iterate until approved by the orchestrator; request user feedback if a subjective major brand decision cannot be resolved from the supplied reference images.

## C. Fully free, no paid infrastructure: explicit operating constraints

- **No login, cloud database, tracking backend, subscription, advertising, analytics SDK, or mandatory paid API.** Personal GPS and visit history are stored in on-device SQLite; a local database is still necessary and does **not** mean a paid database service.
- Use open-source software and properly licensed OpenStreetMap geographic data. **Map tiles are not automatically free to serve at scale**: do not rely on public OSM tile servers for unrestricted production/offline bulk downloading. Prefer an appropriately licensed, bundled/offline Berlin map dataset/style for the gift APK if size/performance permits; otherwise document any internet-dependent tile provider and its terms/limits explicitly. Attribute OSM and other map data as required. Do not promise zero network access unless verified.
- Android APK sideloading requires no Play Store developer account; direct APK sharing is free. Device GPS usage and OS battery restrictions still apply. A Play Store release would be a separate decision and may incur developer fees.

## D. Updated orchestrator instructions and acceptance tests

The **lead orchestrator must treat V5 as a mandatory extension** of the existing phased plan. Before coding the full app, commission the design agent to produce `docs/DESIGN.md` and reviewable screen mockups, and commission the map/data agent to define a pure typed heatmap-band classifier with exact-boundary tests. Keep Phase 0 native background-GPS feasibility as the initial technical hard gate; the visual design gate occurs before full UI implementation. Delegate to at most two non-overlapping agents simultaneously. After each gate update `docs/STATUS.md` with files, tests, visual/device evidence, blockers and next steps.

Additional acceptance checks:
- [ ] Both heatmap metrics support user-edited **thresholds and colours** with five bands.
- [ ] Threshold validation rejects overlaps, gaps, unsorted boundaries, negative visit counts and coverage outside 0–100%.
- [ ] Exact-boundary tests pass (0, 1, 3, 4, 10, 11, 25, 26; and 0%, 25%, 50%, 75%, 100%).
- [ ] Changes to thresholds or colours repaint visible streets and legend without resetting map/selection/filter.
- [ ] Date/weekday filters recompute underlying numeric visit/coverage aggregates before applying user-defined bands.
- [ ] Both metric configurations persist after app restart and can be reset to defaults.
- [ ] Reviewable mockups exist for all nine screen/state categories; splash and adaptive launcher icon use the original Duppy Map branding.
- [ ] No paid backend or required subscription exists; map-data attribution and offline/online constraints are documented.
- [ ] Physical Android device tests and signed APK evidence are reported truthfully.

### Updated one-command orchestrator startup (V5)

Save this file as `DUPPY_MAP_IMPLEMENTATION_PLAN.md` in the repository and run:

```bash
claude --model opus "You are the Duppy Map engineering orchestrator. Read DUPPY_MAP_IMPLEMENTATION_PLAN.md completely, especially the V5 addendum overriding fixed heatmap thresholds. Verify available Claude Code model families; use Opus for orchestration and complex reviews, Sonnet for implementation, Haiku for simple bounded tasks when available, and no more than two non-overlapping agents concurrently. Inspect the repo and create docs/STATUS.md, docs/DECISIONS.md, docs/DESIGN.md, docs/QA.md and docs/RELEASE.md. Start with Phase 0 Android background-GPS feasibility; do not claim real-device validation without evidence. Before full UI coding, require reviewable branded mockups for splash, onboarding, map at two zoom levels, street sheet, temporal filter, customizable heatmap ranges AND colours, insights, and settings. Implement five validated editable bands for visits and coverage, persistent local settings, smooth MapLibre repaint without map reload, date/weekday filtering, accurate street traversals, local-only SQLite history, and a free no-backend architecture with compliant map assets. Run tests and update STATUS.md after every gate. Produce a signed shareable Android APK or accurately document signing/device blockers. Avoid overengineering and invented results."
```
