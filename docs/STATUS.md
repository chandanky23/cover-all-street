# Duppy Map — Status Dashboard

Source of truth for requirements: `plan.md`. Phase definitions and gates:
`plan.md` "Delivery phases" + V2/V3/V5 revisions, summarized in `CLAUDE.md`.

## Phase checklist

| Phase | Status | Owner | Notes |
|---|---|---|---|
| 0 — Feasibility spike | IN_PROGRESS | orchestrator | build+launch+MapLibre render+location/task plumbing proven on emulator; real-device background-GPS walk still BLOCKED |
| 1 — Design system | DONE | orchestrator | `docs/DESIGN.md` written; all 9 screens implemented + screenshotted; icon/palette/empty-state/typeface open items closed and signed off |
| 2 — Geographic data | IN_PROGRESS (feature-complete for emulator scope) | orchestrator | real Bezirke+Ortsteile+street network fetched, converted, bundled, rendering, tap-to-select and mock coverage shading all verified on-device; vector-tile memory question remains open pending physical-device testing |
| 3 — Native location & permissions | IN_PROGRESS | orchestrator | staged permissions, real DB schema, foreground service, point validation all implemented and verified on emulator; physical-device 30-60min walk gate BLOCKED |
| 4 — Matching & temporal analytics | IN_PROGRESS | orchestrator | matcher/rollup pipeline built, unit-tested, and verified via direct DB inspection; Insights still mock, Ortsteil-level matching missing, real-walk tuning BLOCKED |
| 5 — Gift-quality polish | NOT_STARTED | — | |
| 6 — Signed APK & handoff | COMPLETE (emulator) | orchestrator | clean-built signed release APK, offline, no INTERNET permission, real icons; see docs/RELEASE.md. Physical-device locked-screen walk still open (docs/QA.md) |

## Current phase detail — Phase 0

**Started:** 2026-11-06

**Implemented:**
- Repo initialized (`git init`); `plan.md` and `CLAUDE.md` in place.
- Expo TypeScript project scaffolded (`create-expo-app@latest`, SDK 58
  default template, Expo Router).
- Core native deps installed via `npx expo install`: `expo-dev-client`,
  `expo-sqlite`, `expo-location`, `expo-task-manager`,
  `@maplibre/maplibre-react-native@^11.5.1`.
- `app.json` configured: app name "Duppy Map", package/bundle id
  `com.duppymap.app`, scheme `duppymap`, cream (`#FFF7E9`) splash/adaptive-
  icon background, `expo-location` plugin configured for Android background
  location + foreground service, `@maplibre/maplibre-react-native` and
  `expo-sqlite` config plugins added.
- `npx expo-doctor`: 20/20 checks passed.
- `npx expo prebuild --platform android`: succeeded, generated `android/`.
- `android/local.properties` pointed at the installed SDK
  (`~/Library/Android/sdk`); SDK licenses already accepted on this machine.
- Debug build (`./gradlew assembleDebug`) succeeded — full native
  toolchain (Gradle, Kotlin, MapLibre native linking) builds cleanly.
- User chose to proceed with the `Pixel_2_XL_API_30` emulator for now
  rather than wait on physical-device access.
- Installed the debug APK on the emulator, started Metro, and confirmed
  the dev-client app launches and renders JS (screenshot:
  `docs/evidence/phase0/01-app-launch-dev-template.png`).
- Replaced the template home screen with a temporary MapLibre smoke test
  (`@maplibre/maplibre-react-native` `Map` + `Camera`, centered on Berlin,
  using the public MapLibre demo style purely as a placeholder tile
  source). Confirmed real vector-tile rendering and correct camera
  positioning on-device (screenshot:
  `docs/evidence/phase0/02-maplibre-berlin-render.png`). This is **emulator**
  evidence, not physical-device evidence.

**Files changed:** `package.json`, `app.json`, `android/` (generated),
`src/app/index.tsx` (temporary Phase 0 map smoke test — will be replaced by
real Phase 1/2 UI), `docs/DECISIONS.md`, `docs/QA.md`, `docs/RELEASE.md`,
`docs/STATUS.md` (this file), `docs/evidence/phase0/*.png`.

**Tests run and results:** `expo-doctor` 20/20 passed. `./gradlew
assembleDebug` succeeded. App installs, launches, and MapLibre renders on
the `Pixel_2_XL_API_30` emulator — see `docs/QA.md` for the full checklist.

**Android device evidence:** emulator only (see above). No physical
device has been used yet. This still blocks the Phase 0 hard gate item
that requires a real 20–30 minute locked-screen background-location walk
on physical hardware — that cannot be meaningfully simulated on an
emulator.

- Wrote and ran an interim background-location + task-manager + SQLite
  smoke test (`src/lib/locationTask.ts`, `src/lib/db.ts`), registered at
  module top-level per plan.md. On the emulator: foreground permission
  dialog, Android-11-style background-permission redirect to system
  Settings (exactly as plan.md predicts), and OS-level task registration
  all confirmed via screenshots/logcat. Simulated GPS fixes
  (`adb emu geo fix`) did not propagate to the app — `dumpsys location`
  showed null on both `gps` and `fused` providers — which looks like a
  limitation of this AVD's `google_apis` (non-Play-Store) system image
  rather than an app defect. Full detail in `docs/QA.md`.

**Known issues / risks:**
- Phase 0 cannot be marked fully PASSED until the background-GPS,
  locked-screen walk is run on a **physical** Android device — currently
  BLOCKED, by the user's own choice to proceed with an emulator for now.
  The interim test above de-risks the permission/task/storage plumbing but
  does not substitute for that real walk.
- Basemap/tile source for MapLibre is still undecided (plan.md explicitly
  forbids bulk use of public OSM tile servers); the demo style used here
  is a smoke-test placeholder only, deferred properly to Phase 2.
- Whether to commit the generated `android/` directory to git is undecided
  (see `docs/DECISIONS.md` open items).
- If a physical device remains unavailable, consider recreating the AVD
  from a `google_apis_playstore` system image, which tends to have more
  reliable simulated-GPS-to-Fused-provider bridging, as a better (but
  still not equivalent to real-device) interim option.

**APK or screenshot artifacts:**
`android/app/build/outputs/apk/debug/app-debug.apk` (debug build);
`docs/evidence/phase0/01-app-launch-dev-template.png` through
`06-tracking-status-active.png`.

## Current phase detail — Phase 1 (Design system)

**Started:** 2026-11-07

**Implemented:**
- `docs/DESIGN.md`: full screen-by-screen spec (brand tokens, spacing,
  typography scale, motion, all 9 required screen/state categories) per
  V5-B.
- Foundational code: `src/constants/duppyTheme.ts` (brand + heatmap
  tokens, spacing, radius, type scale), `src/components/duppy-logo.tsx`
  (original SVG mark — winding street + leaf-wrapped pin), `react-native-svg`
  installed and native-rebuilt.
- Pure heatmap classification/validation module
  `src/lib/heatmapSettings.ts` (V5-A: band boundaries + colors, contiguous/
  ordered/exhaustive validation, preset palettes) — unit tests not yet
  written, tracked as an open item for Phase 2/4.
- Shared UI primitives: `src/components/duppy/{Sheet,primitives,Legend,
  StreetSheet,FilterSheet,HeatmapEditorSheet}.tsx`.
- Implemented + screenshotted mock screens (mock data from
  `src/lib/mockData.ts`), all on the `Pixel_2_XL_API_30` emulator:
  1. Welcome (`src/app/welcome.tsx`) — logo, wordmark, message, CTA.
  2. Permission education (same file, second step) — plain-language
     foreground/background explanation, local-only + revocation note.
  3–4. Map at district/street zoom (`src/app/index.tsx`) — filter chip,
     tracking badge, floating recenter/palette controls, expandable
     legend, tappable street markers (stand-ins for real segments).
  5. Street detail sheet — spring-in, band/traversals/visit-days/covered/
     first-seen/last-seen/all-time note.
  6. Filter sheet — presets + weekday chips; confirmed the active filter
     chip updates live when a preset is tapped (shared state, not a
     stale per-screen copy).
  7. Heatmap editor — Visits/Coverage toggle, preset chips, 5 editable
     bands (boundary + hex), live preview strip, reset/save.
  8. Insights (`src/app/insights.tsx`) — overview totals, district
     coverage bars, ranked top-streets list.
  9. Settings (`src/app/settings.tsx`) — tracking toggle wired to the real
     Phase 0 location-task spike, export/delete-data actions (delete is
     mocked), about/attribution text.
- Tab bar relabeled Map / Insights / Settings (`src/components/app-tabs.tsx`).
- Fixed a real bug found via this process: MapLibre's `Marker` takes
  `lngLat`, not `coordinate` — markers silently failed to render until
  corrected (see commit history / diff for `src/app/index.tsx`).

**Files changed:** see above; full list in git diff for this phase.

**Tests run and results:** manual click-through on-device for all 8
screenshotted screens (listed above); no automated tests yet for
`heatmapSettings.ts` validation functions.

**Android device evidence:** emulator only
(`docs/evidence/phase1/01-...png` through `08-...png`), same caveat as
Phase 0 — not a substitute for physical-device visual QA.

**Known issues / risks (see `docs/DESIGN.md` open items for full list):**
- (Fixed 2026-11-07) Heatmap editor's preset-chip row used to clip at the
  sheet's right edge — root cause was a horizontal `ScrollView` collapsing
  to near-zero height inside the animated sheet; replaced with a wrapping
  flex row. See `docs/DESIGN.md` for detail.

**Update 2026-11-07 — closing the four remaining Phase 1 open items:**

- **Settings tab icon (fixed):** was reusing the Insights tab's icon
  file. Generated a dedicated gear/settings silhouette
  (`assets/images/tabIcons/settings.png` @1x/2x/3x) matching the other
  two icons' style (bold, solid, template-tintable) — drawn with Pillow
  (confirmed a real prebuilt wheel exists for this platform before
  installing, same care as the earlier brew/pip tooling traps) rather
  than hand-authored, since no SVG rasterizer was available without
  risking another from-source compile. Wired into `src/components/
  app-tabs.tsx`. Verified on-device: `docs/evidence/phase1/14-sheet-
  close-animation-frame1.png`'s predecessor screenshots show the old
  shared icon; current state confirmed in `20-22-quicksand-font-*.png`
  (gear is visibly distinct from the Insights stacked-cards icon).
- **Second palette preset verified (High Contrast):** tapped through
  the preset chips on-device rather than just trusting the code —
  confirms the chip highlight, all 5 band swatches, and the live preview
  strip all update correctly together. See `docs/evidence/phase1/17-
  heatmap-high-contrast-preset.png` and `18-...-full-bands.png`.
- **Empty-state screenshot captured — and a real bug found doing it:**
  temporarily zeroed out the mock coverage/marker data to render "zero
  observations" (exactly plan.md's required empty state: "map remains
  functional with no observations"). First attempt crashed to solid
  black fill with a native `MapLibre Native [ERROR] [Mbgl]` toast —
  `['match', ['get','name'], fallback]` with **zero** label/output pairs
  is invalid MapLibre style syntax, which the two coverage-fill
  expressions in `src/app/index.tsx` would hit for real the moment a
  genuinely new user (or any future empty district/Ortsteil set) has no
  coverage data at all. Fixed for real, not just for the screenshot: a
  `coverageFillExpression(entries, fallback)` helper now returns a flat
  fallback color when there are no entries, and only builds the `match`
  expression when there's at least one pair. See `docs/evidence/phase1/
  19-map-empty-state.png` for the corrected result (uniform neutral
  fill, no error, fully functional).
- **Rounded sans typeface sourced and bundled:** Quicksand (OFL-licensed,
  Google Fonts) — downloaded the variable font from the googlefonts/fonts
  GitHub repo and instantiated static Regular/SemiBold/Bold weights with
  `fonttools` (confirmed a prebuilt wheel first). Files in `assets/fonts/`
  with `OFL.txt` alongside for attribution. Loaded via `expo-font`'s
  `useFonts` in `src/app/_layout.tsx`, gated behind the existing
  `SplashScreen.preventAutoHideAsync()` so the splash stays up instead of
  flashing the system font first. `src/constants/duppyTheme.ts`'s `type`
  scale now sets `fontFamily` per level (Bold for display/title, SemiBold
  for heading/label, Regular for body/caption) **instead of**
  `fontFamily`+`fontWeight` — Android doesn't reliably synthesize weights
  for a custom typeface, so a handful of components that previously
  layered an extra `fontWeight` on top of a `type.*` spread (`insights.tsx`,
  `Legend.tsx`, `HeatmapEditorSheet.tsx`, `StreetSheet.tsx`) were updated
  to pick the matching named weight file instead, avoiding a double-bolded
  look. Verified on-device across Map, Insights, and Settings screens —
  clearly rounded letterforms throughout, no fallback-to-system-font
  flashes. See `docs/evidence/phase1/20-22-quicksand-font-*.png`.

**APK or screenshot artifacts:** `docs/evidence/phase1/01-map-district-
street-zoom.png` through `22-quicksand-font-settings.png`.

**Phase 1 sign-off:** all nine required design deliverables are
implemented and screenshotted, and all four previously-open polish items
above are closed and verified on-device. Recording sign-off here —
Phase 1 is DONE. The real physical-device background-GPS walk from Phase
0 remains open and will be revisited when a device is available — tracked
as BLOCKED in `docs/QA.md`, not silently dropped, and not a Phase 1 gate.

## Current phase detail — Phase 2 (Geographic data)

**Started:** 2026-11-07

**Implemented:**
- Dataset pipeline (`geo-pipeline/`): `fetch-boundaries.sh` queries the
  public Overpass API for Berlin's 12 Bezirke (`admin_level=9`) and 97
  Ortsteile (`admin_level=10`) relations with inline geometry (`out
  geom`), then `convert.js` (using the pure-JS `osmtogeojson` package)
  converts the result to clean GeoJSON (filtering out the stray
  admin_centre/label Point features Overpass/osmtogeojson also emit).
  Output is copied into `assets/geo/*.json` and loaded via
  `src/lib/berlinGeo.ts`.
- Real Berlin Bezirke boundaries now render on the map
  (`src/app/index.tsx`) as a `GeoJSONSource` + `Layer` (fill + line),
  replacing the flat demo-tile color block from Phase 0/1. Fill color is
  driven by the existing mock coverage %/`classifyCoverage` pipeline from
  `src/lib/heatmapSettings.ts` — same classification module Insights
  uses, so there's already one shared source of truth for band
  boundaries even before real traversal data exists (Phase 4 wires that
  in without needing to touch this classification logic).
- Fixed a real bug while wiring this up: `FillLayer`/`LineLayer` aren't
  actual exported components from `@maplibre/maplibre-react-native` (only
  TypeScript prop-type exports) — the real component is the generic
  `Layer` with a `type: 'fill' | 'line'` prop. Caused an immediate render
  crash until corrected.
- Verified end-to-end on-device: real, recognizable Berlin city shape
  (northern Reinickendorf peninsula, Spandau's western bulge, the
  Treptow-Köpenick southeastern panhandle all visible and correctly
  positioned) — see `docs/evidence/phase2/`.

**Files changed:** `geo-pipeline/` (new: `fetch-boundaries.sh`,
`convert.js`, `package.json`, `.gitignore`), `assets/geo/berlin-bezirke.json`,
`assets/geo/berlin-ortsteile.json`, `src/lib/berlinGeo.ts` (new),
`src/app/index.tsx`, root `.gitignore` (was missing `node_modules/` and
other standard ignores entirely — fixed).

**Tests run and results:** manual visual verification on the
`Pixel_2_XL_API_30` emulator at two zoom levels; no automated tests yet
for the conversion script or the classification wiring.

**Android device evidence:** emulator only, same caveat as every prior
phase — `docs/evidence/phase2/01-...png` through `03-...png`.

**Known issues / risks:**
- (Done 2026-11-07) Ortsteile now render too, zoom-gated via `minzoom`/
  `maxzoom` on the `Layer` components: Bezirke fill below zoom 12,
  Ortsteile fill+line at zoom 12+. Verified on-device at zoom 13 (forest-
  colored Ortsteile outlines visible). Ortsteile fill is currently a flat
  neutral/zero-band color (no per-Ortsteil mock data exists yet, unlike
  Bezirke which reuses the Insights mock %).
- Street-level network (the actual eligible street segments, per plan.md
  "Coverage definitions") is **not** started yet — boundaries were the
  first, smaller increment. This is the bigger remaining Phase 2 piece
  and will need a volume-appropriate approach (Overpass alone may not
  handle Berlin's full street network in one query; likely needs tiling
  by district or a PBF-based extraction once a reliable toolchain is
  confirmed on this machine — see below).
- Tooling friction encountered and worked around: `brew install
  osmium-tool` and `pip install pyrosm` each silently tried to compile
  large C/C++ dependencies from source (no bottle/wheel available for
  this exact platform+version combo) rather than failing fast — both
  were stopped mid-build. The pure-JS `osmtogeojson` + direct Overpass
  queries avoided this entirely for boundaries; the street-network step
  may need to revisit this if query volume becomes too large for
  Overpass.
- District fill currently keys off **mock** coverage % (same numbers
  Insights shows) — correct wiring, placeholder data, clearly not real
  user history yet.
- Real basemap/tile source underneath (currently still MapLibre's public
  demo style) remains undecided — tracked in `docs/DECISIONS.md`.

**APK or screenshot artifacts:** `docs/evidence/phase2/01-berlin-bezirke-
coverage-shading.png`, `02-berlin-full-city-shape.png`,
`03-default-zoom-framing.png`.

**Update 2026-11-07, continued:** the street-segment dataset is now done
and rendering on-device.

- Fetched all 12 districts (99,186 named-street segments, 26MB merged
  GeoJSON) via `geo-pipeline/fetch-streets.sh` — one Overpass query per
  Bezirk, paced 3s apart. One district (Lichtenberg) hit a 429 rate-limit
  on the first pass; the script's `set -e` correctly aborted before
  merging rather than silently proceeding with incomplete data — retried
  individually after a backoff pause and succeeded.
- **Serious bug found and fixed:** importing the 26MB dataset as a normal
  JS/JSON module (same pattern used for the much smaller Bezirke/Ortsteile
  files) got the app **OOM-killed on-device** (~1.2GB resident — confirmed
  via `dumpsys meminfo` and `logcat`'s `oom-kill` entries, not a guess).
  Root cause: Metro inlines `.json` imports as parsed JS object literals,
  and Hermes allocating 99k+ Feature objects from that blew past the
  emulator's memory limit. Fixed by registering `.geojson` as a Metro
  **asset** extension (`metro.config.js`) and resolving it at runtime via
  `expo-asset` to a local `file://` URI, which is what gets passed to
  `GeoJSONSource`'s `data` prop — MapLibre's native side reads and parses
  the file directly, so the JS heap never holds the parsed data at all.
  (Required restarting the already-running Metro server — `metro.config.js`
  is only read at server startup, not hot-reloaded.)
- **Second, subtler memory issue found and fixed:** even with the
  file-URI approach, simply *mounting* the streets `GeoJSONSource`
  unconditionally cost ~650–740MB of **native** heap (confirmed via
  `dumpsys meminfo`), regardless of the `Layer`'s own `minzoom` — zoom
  gating a layer controls rendering, not whether the source's data gets
  parsed into native memory. Fixed by tracking camera zoom in JS state
  (`Map`'s `onRegionDidChange`) and only mounting the `GeoJSONSource`
  itself once the camera is within ~0.5 zoom of street-detail level (with
  hysteresis so hovering at the threshold doesn't thrash). Reduced the
  default/district-overview memory footprint from ~650MB to ~275MB native
  heap — confirmed before/after with `dumpsys meminfo` on identical
  camera position.
- Verified on-device at zoom 15: real Berlin street geometry renders
  correctly (actual intersections, a roundabout, street-level detail) —
  see `docs/evidence/phase2/04-real-street-network-rendering.png`.

**Known risk carried forward:** ~500MB of *additional* native heap when
the user zooms into street level is still a lot for a single GeoJSON
source, especially on a real (lower-RAM) physical device rather than this
emulator. This v1 approach (one big bundled GeoJSON, zoom-gated mounting)
works and is honestly tested, but the architecturally correct long-term
fix is pre-tiled vector tiles (e.g. via `tippecanoe`/PMTiles) so only the
visible viewport's data loads at once — deferred because the tooling
needed for that (`tippecanoe`, `osmium-tool`, `pyrosm`) all hit the same
"silently compiles a huge C/C++ toolchain from source on this machine"
wall documented above. Must be revisited before Phase 6 if real-device
testing shows memory pressure, crashes, or slow zoom transitions.

**Files changed (this update):** `geo-pipeline/fetch-streets.sh`,
`convert-streets.js`, `merge-streets.js` (new), `assets/geo/berlin-
streets.geojson` (26MB, gitignored-candidate — reconsider committing a
dataset this size vs. documenting the regeneration command), `metro.config.js`
(new), `src/lib/berlinGeo.ts`, `src/app/index.tsx`, `package.json`
(`expo-asset` added).

**Update 2026-11-07, continued again — tap-to-select on real data:**
real Bezirke, Ortsteile and street segments are now tappable, each
opening a new `FeatureInfoSheet` (`src/components/duppy/FeatureInfoSheet.tsx`)
built for this — the existing `StreetSheet` is Phase-1-mock-specific
(traversal counts, visit-days, etc. that don't exist for real streets
yet, since location tracking/matching is Phase 3–4), so reusing it for
real taps would have meant fabricating fake stats for 99k street
segments. Instead the new sheet shows only what's honestly known right
now — name, OSM classification (Bezirk/Ortsteil/road type), population
where OSM has it — plus an explicit "not tracked yet, lands in Phase
3–4" note and the OpenStreetMap attribution. Implemented via each
`GeoJSONSource`'s own `onPress` (confirmed via the library's type defs
that `GeoJSONSource`/`PressableSourceProps` supports this directly,
returning the tapped `GeoJSON.Feature[]` — no extra hit-testing needed).
Verified on-device: tapping "Pankow" shows its real OSM population
(410,716); tapping a line shows "Spandauer Straße · Tertiary road." See
`docs/evidence/phase2/05-tap-district-real-data.png` and `06-tap-street-
real-data.png`. The Phase 1 mock markers/`StreetSheet` are left as-is —
they'll be retired once Phase 4 gives real streets real traversal data
to show.

**Update 2026-11-07, final — per-Ortsteil mock coverage shading:**
Ortsteile now shade by coverage just like Bezirke do, closing the last
open Phase 2 item that wasn't conditional on a real device. Added
`mockOrtsteileCoverage` to `src/lib/mockData.ts` — a hand-picked set of
real Ortsteil names (Friedrichshain 55%, Kreuzberg 48%, Mitte 22%,
Prenzlauer Berg 15%, etc., everything else 0%) continuing the same
"mostly explored Friedrichshain-Kreuzberg" story `mockDistricts`/
`mockStreets` already tell, just one zoom level more granular. Wired
through the same `classifyCoverage` → `coverageColors` pipeline as
Bezirke via a new `ortsteileFillColorExpression` in `src/app/index.tsx`,
so there's still exactly one source of truth for band-color mapping.
Deliberately **not** surfaced as a number in `FeatureInfoSheet` — the
sheet only states real OSM facts (name, classification, population); the
map fill communicates the mock coverage visually without the sheet
asserting a fake percentage as if it were tracked data. Verified
on-device: zooming into Friedrichshain-Kreuzberg at neighbourhood level
shows visibly different shading per Ortsteil, and tapping the
darkest-shaded polygon there confirms it's really "Kreuzberg" — see
`docs/evidence/phase2/07-ortsteile-coverage-shading.png` and
`08-tap-ortsteil-covered.png`.

**Phase 2 status:** everything testable on this emulator is done —
boundaries, streets, tap-to-select, and coverage shading at both
granularities. The one item left is **not** a code task: whether the
zoom-gated single-GeoJSON approach holds up on a real (lower-RAM)
physical device, or needs the vector-tile rework discussed above. That
can only be answered by testing on physical hardware, which is already
tracked as BLOCKED (by the user's own choice to proceed on emulator for
now) in Phase 0's entry and `docs/QA.md` — not a new gap, the same open
question. No further Phase 2 code work is planned until that signal
exists.

## Current phase detail — Phase 3 (Native location & permissions)

**Started:** 2026-11-07

**Implemented:**
- **Real DB schema** (`src/lib/db.ts`, replacing the Phase 0 spike's
  single-table version): `app_settings`, `geo_dataset`, `areas`,
  `observations` (short retention), `segment_visits`, `area_visits` —
  plan.md's suggested tables, with `PRAGMA user_version`-gated
  migrations (simple, one step today, rather than a general migration
  framework this app doesn't need yet) and indexes on `observations.ts`/
  `.processed` and `areas.parent_id`. `areas` is eagerly seeded from the
  bundled Bezirke/Ortsteile GeoJSON (109 rows) since `area_visits` needs
  something to reference now; `street_segments` is deliberately **not**
  seeded yet — plan.md's matcher design ("spatial index against
  versioned Berlin street graph") should decide how 99k rows actually
  get queried before that shape gets locked in, and that's Phase 4's
  call, not this one's.
- **Point validation** (`src/lib/locationTask.ts`): rejects fixes with
  `accuracy_m > 100` outright, and rejects any point implying >50 m/s
  (~180 km/h) of travel from the previous accepted point (haversine
  distance / elapsed time) — plan.md's "reject poor points, detect
  impossible speeds/jumps." Verified the math standalone (walking pace
  accepted, a simulated GPS teleport rejected, zero-elapsed-time handled
  without a divide-by-zero crash) since this emulator's GPS simulation
  can't exercise the real callback path (see known issue below).
- **Short retention** (`purgeOldObservations`, 7 days), throttled to run
  at most once an hour via an `app_settings` timestamp rather than on
  every single location callback.
- **Staged permissions, for real** (`requestForegroundPermission` /
  `requestBackgroundPermission` in `locationTask.ts`, used by both
  `welcome.tsx` and `settings.tsx`): foreground is requested and
  explained on its own; background is only requested once that's
  granted. Verified on-device that this is not just a code-level
  distinction — Android actually presents them differently: foreground
  shows the familiar system dialog, background redirects to a system
  Settings screen ("Allow all the time" / "Allow only while using the
  app" / "Deny"), exactly as Phase 0 first documented. See
  `docs/evidence/phase3/03-foreground-permission-dialog.png` and
  `04-background-permission-system-settings.png`.
- **Real onboarding flow** (`welcome.tsx`, rewritten from a non-functional
  mock — the old "Continue" button was a no-op): walks through both
  permission stages, shows an honest outcome message whichever way each
  stage went (granted / declined / skipped via "Not now"), and only then
  lets the user into the app. First launch only — `onboarding_complete`
  in `app_settings` makes every later launch skip straight to the map;
  verified by force-stopping and relaunching. See
  `docs/evidence/phase3/01-...png` through `07-restart-skips-onboarding.png`.
- **Real foreground-service notification** confirmed in the actual
  notification shade (not just configured in code): "Duppy Map is
  tracking / Recording streets you explore in Berlin." See
  `docs/evidence/phase3/09-foreground-service-notification.png`.
- **Adaptive sampling, scoped honestly:** implemented as `distanceInterval:
  15` (meters) rather than a custom polling-rate scheduler — this is the
  standard mechanism (native FusedLocationProvider, which expo-location
  wraps) for the exact battery-saving behavior plan.md asks for: no
  callback fires at all while the device hasn't moved, so cost already
  scales down when the user is stationary without this app needing to
  stop/restart the location subscription itself (which would risk
  missed updates mid-walk for a battery saving `distanceInterval`
  already provides for free). Documented in `docs/DECISIONS.md` as the
  interpretation chosen, since plan.md doesn't mandate a specific
  mechanism.
- `settings.tsx`'s "Delete all data" now actually deletes
  (`deleteAllUserData()` — observations/segment_visits/area_visits)
  instead of just setting a mock status string.

**A real bug found and fixed while building this:** the first version
of the onboarding gate used `expo-router`'s `Redirect` + `usePathname()`
to send a first-time user to `/welcome`. Because `welcome.tsx` isn't one
of `AppTabs`' `NativeTabs.Trigger` screens, and the root layout always
renders `<AppTabs/>` unconditionally, the two fought each other:
redirect to `/welcome` → `AppTabs` renders its own default tab →
pathname flips back → redirect to `/welcome` again → ... The user caught
this live on-device ("the app is constantly flashing (as if constant
rendering)") before I'd finished characterizing it myself. Fixed by not
routing to it at all — `_layout.tsx` now renders the `WelcomeScreen`
component directly (passing it an `onDone` callback) when onboarding
isn't complete, bypassing the tab navigator entirely for that case,
rather than asking the router to navigate to a route the tab navigator
doesn't know about.

**Tests run and results:** manual click-through of the full onboarding
→ permission → map flow, restart-persistence check, tracking on/off
toggle, notification content — all on the `Pixel_2_XL_API_30` emulator.
Standalone Node script for the speed-validation math (not emulator-
dependent). No automated test suite yet for `db.ts`'s migration/seeding
logic.

**Android device evidence:** emulator only —
`docs/evidence/phase3/01-...png` through `10-tracking-toggle-off.png`.

**Known issues / risks:**
- **Phase 3's hard gate — "30–60 minute physical walk captures useful
  points with phone locked" — is BLOCKED**, same root cause as Phase
  0's walk test: no physical device in use this session, by the user's
  own choice. Everything gated behind *having* a physical walk (actual
  point capture during a real walk, actual locked-screen/app-switch/
  battery-optimization behavior, actual adaptive-sampling behavior under
  real movement) is unverified. What's been verified is everything that
  doesn't require one: the permission UX, the schema, the notification,
  the validation math, and the on/off toggle plumbing.
- Reconfirmed (Phase 0 already found this): this AVD's `google_apis`
  (non-Play-Store) system image does not propagate `adb emu geo fix`
  simulated GPS fixes to the fused/gps location providers
  (`dumpsys location` shows null on both after a fix). This blocks
  exercising the actual `TaskManager` callback → validation → SQLite
  insert path on this emulator specifically; a `google_apis_playstore`
  AVD or a physical device would be needed to test that live.
- Real parent-Bezirk linkage for each seeded Ortsteil isn't in the
  `areas` table (`parent_id` is `NULL` for all 97) — the bundled OSM
  boundary data doesn't carry that relation. Noted in code; a
  point-in-polygon pass against the Bezirke set would fix it if area
  rollups turn out to need it in Phase 4.
- `street_segments` is intentionally unseeded (see above) — Phase 4
  needs to decide this, not inherit an unexamined decision from Phase 3.

**APK or screenshot artifacts:** `docs/evidence/phase3/01-welcome.png`
through `10-tracking-toggle-off.png`.

**Next phase:** Phase 4 (matching & analytics) needs the real street
graph queryable (the `street_segments` seeding question above), the
actual map-matching algorithm, and real recorded walks (physical device)
to tune the validation thresholds against — all currently blocked on
physical-device access for the last part. Code-level matching work
(spatial index design, segment interval logic, visit-day dedup) can
start without a device; tuning against real noisy GPS can't.

## Current phase detail — Phase 4 (Matching & analytics)

**Started:** 2026-11-07

**Implemented:**
- **Per-district street graph for matching** (`src/lib/streetGraph.ts`):
  deliberately *not* the full 99k-feature city-wide dataset used for map
  rendering — loads one Bezirk's streets (a few hundred to ~4,500 ways,
  under 5MB) at a time from the per-district files the original fetch
  pipeline already produced before merging them for the map
  (`geo-pipeline/output/streets/`, now also bundled per-district under
  `assets/geo/streets-by-district/`). Which Bezirk a point is in is
  found via `findDistrictForPoint` (ray-casting point-in-polygon against
  the already-bundled Bezirke boundaries). A known v1 limitation: a
  point very near a Bezirk border can miss a nearer segment that's just
  across that border in a different district's file — narrow edge case,
  documented rather than solved by loading multiple districts per point.
- **Pure geometry/decision modules, unit-tested** (`src/lib/geoMath.ts`,
  `src/lib/matcher.ts`): haversine distance, point-to-polyline distance,
  point-in-polygon, and a hand-rolled Europe/Berlin DST-aware date-key
  function (not `Intl`/ICU — plan.md calls for DST/midnight-boundary
  correctness specifically, so this owns and tests that rule directly
  rather than depending on whatever ICU data happens to be in this
  Hermes build). 26 vitest tests across both files, including explicit
  spring/autumn DST-transition and local-midnight-boundary cases.
  `npm test` added (`vitest run`).
- **Conservative matching** (`decideMatch` in `matcher.ts`): rejects a
  point if nothing is within 25m (`too_far`), and rejects it as
  `ambiguous` if the best and second-best candidate segments are within
  8m of each other — plan.md: "if map matching is uncertain, don't count
  the segment" and "avoid counting parallel streets from noisy GPS."
  Unit-tested with synthetic parallel-street geometry specifically
  constructed to be ambiguous.
- **Segment/area rollups** (`foldMatchedObservations` in `matcher.ts`,
  `upsertSegmentVisit`/`upsertAreaVisit` in `db.ts`): traversal count is
  one per distinct visit-day touching a segment (not one per GPS point),
  covered length is the furthest fraction-along-segment ever reached
  (never decreases if a later walk only covers less of it), consistent
  with plan.md's caution against inferring more from a GPS trace than it
  actually supports (the same "label as 'streets travelled', don't claim
  'walked'" caution applied to traversal counting).
- **Orchestration** (`src/lib/matchingPipeline.ts`): batches unprocessed
  observations, matches each, folds results, upserts rollups, marks
  observations processed — called from the background location task
  (`maybeRunMatcher`, throttled to once per 2 minutes) right before the
  existing purge step, so a point doesn't sit unprocessed for an extra
  cycle. `purgeOldObservations` was also tightened to only ever delete
  `processed=1` rows — an unmatched point (e.g. tracking was off for a
  while) can never be purged before it's had a chance to count, even if
  older than the 7-day retention window.
- **Real data surfaced in the UI**: `FeatureInfoSheet` now queries
  `getSegmentVisit`/`getAreaVisit` and shows real traversal/visit-day/
  covered-length stats when they exist, falling back to an honest "no
  visits recorded here yet" otherwise — replacing the Phase 2/3 sheets'
  permanent "lands once Phase 4 exists" placeholder text now that Phase
  4 actually exists.

**A real migration bug found and fixed:** wrapping the schema-v2
migration's `CREATE TABLE` statements in an explicit `BEGIN`/`COMMIT`
transaction (alongside a `PRAGMA user_version = 2` write) left the
on-device database with `user_version` bumped to 2 while the new
`segment_visit_days`/`area_visit_days` tables never actually existed —
confirmed by pulling the db file off the emulator and inspecting it
directly with `sqlite3`. Every statement in these migration steps is
already `CREATE TABLE/INDEX IF NOT EXISTS` (idempotent, safe to re-run),
so there was no correctness reason to wrap them in a transaction at all;
removing that wrapping removed the bug without needing to fully
root-cause the exact SQLite/driver interaction that caused it. See
`docs/DECISIONS.md`.

**Verification without a physical device:** since this emulator can't
produce real GPS (confirmed again this phase — see Phase 3's note),
the full pipeline was verified by inserting synthetic observations along
a real street's actual bundled geometry (Frankfurter Allee, Friedrichshain-
Kreuzberg) through a temporary dev-only button, running the matcher, then
**pulling the on-device SQLite file and inspecting it directly** — the
gold-standard check, stronger than eyeballing a screenshot. Confirmed:
`segment_visits` correctly populated for the right street
(`way/4045243`, 1 visit-day, 1 traversal, ~54m covered), `area_visits`
correctly populated for the right Bezirk (`relation/55764` =
Friedrichshain-Kreuzberg, independently cross-checked against the
bundled boundary data), all 5 synthetic observations marked `processed`,
and the day-tracking tables correctly recording the visit-day. The
temporary test button and its imports were removed afterward — see
`docs/evidence/phase4/01-synthetic-walk-matched-no-error.png` for the
on-device confirmation (no crash, "observations recorded: 5").

**Tests run and results:** `npm test` (vitest) — 26/26 passing across
`geoMath.test.ts` and `matcher.test.ts`. On-device: full onboarding →
synthetic walk → direct SQLite inspection as described above. UI-level
visual confirmation of the *specific* matched street/Bezirk's info sheet
was attempted but not completed — repeatedly mis-tapped neighbouring
streets/districts at the zoom level needed (a tap-precision issue, not
a pipeline issue); the same `getSegmentVisit`/`getAreaVisit` → sheet
code path was already confirmed working for the "no data" case across
several other districts this session, and the data itself was verified
correct at the database level, so this isn't tracked as an open risk.

**Android device evidence:** emulator only —
`docs/evidence/phase4/01-synthetic-walk-matched-no-error.png`.

**Known issues / risks:**
- **Everything that needs real GPS is still unverified**, same root
  cause as Phases 0 and 3: no physical device this session. The
  distance/ambiguity thresholds (25m / 8m) are reasoned estimates against
  typical pedestrian GPS accuracy, not tuned against any real walk —
  plan.md's own Phase 4 gate calls for "at least two recorded real-world
  walks," which is BLOCKED pending physical-device access, same as the
  Phase 0/3 walk tests.
- Area-level matching only resolves Bezirke, not Ortsteile —
  `matchingPipeline.ts`'s `resolveAreaId` only looks up the Bezirke
  boundary set. Tapping an Ortsteil will always show "no visits recorded"
  even where its parent Bezirk has real data, until Ortsteil-level area
  matching is added (a small, scoped follow-up, not a redesign).
  Mirrors the already-documented "Ortsteile don't have real parent-Bezirk
  linkage in the `areas` table" limitation from Phase 3.
- `street_segments` table remains unseeded (by design, see Phase 3) —
  the matcher works entirely off the bundled per-district GeoJSON files,
  never touching that table. Fine for now; worth revisiting only if a
  future need (e.g. an `eligible_length_m` rollup across all segments)
  actually requires querying segments independent of a GPS point.
- Insights screen still shows entirely Phase 1 mock data
  (`mockInsightsTotals`, `mockDistricts`, `mockStreets`) — it was not
  wired to the new real rollups this phase. The map's tap-to-select
  sheets now show real (if currently empty) data; Insights doesn't yet.
  Worth closing before calling Phase 4 fully done.

**APK or screenshot artifacts:**
`docs/evidence/phase4/01-synthetic-walk-matched-no-error.png`.

**Next phase:** wire Insights to real rollup queries (top streets by
traversal count, total covered length, areas with any visits, etc.)
instead of mock data; add Ortsteil-level area matching; then Phase 5
(gift-quality polish) and Phase 6 (signed release build) remain, plus
the physical-device walk tests this and every prior phase have
deferred.

## Update 2026-11-07 — Real-data cleanup pass (closing the Phase 4 gaps above)

**Context:** before building a release APK, every remaining mock/fake
surface was removed and replaced with real (if currently empty, for a
fresh install) data — the user's explicit instruction was "no fake or
mock and 100% clean" before touching the build/release flow. Also
confirmed: `minSdkVersion` is already 24 (Android 7.0, 2016), set by
Expo/React Native's own floor, not something this app configures — a
phone bought 3–4 years ago is already comfortably supported, no change
needed.

**Implemented:**
- **Ortsteil-level area matching added** (closing a Phase 4 gap):
  `matchingPipeline.ts` now does a second point-in-polygon check per
  observation (`findOrtsteilForPoint` in `streetGraph.ts`, reusing the
  already-bundled Ortsteile boundaries) alongside the existing Bezirk
  check, so `area_visits` gets real rows at both granularities.
- **Real per-Bezirk coverage %** (`getBezirkCoverage()` in `db.ts`):
  `areas.eligible_length_m` is now a real number, computed once at seed
  time by summing actual street lengths from the same bundled
  per-district files the matcher uses (`getDistrictTotalLengthM` in
  `streetGraph.ts`) — not a guess. Coverage % = real covered length ÷
  this real eligible length. Ortsteile don't get a numeric % (no
  per-Ortsteil street breakdown exists to compute one against) — they
  get a simpler, still-real "visited at all" treatment instead
  (`getVisitedOrtsteilNames()`, backed by `area_visits.distinct_visit_days
  > 0`), clearly a coarser signal than the Bezirke's gradient, not a
  faked equivalent of it.
- **Schema v3**: `segment_visits` gained `name`, `highway`, `area_id`
  columns, populated at match time (the matcher already knows all three
  when it finds a segment) so Insights' top-streets list and the real
  coverage query never need to re-load per-district GeoJSON at read
  time.
- **`src/app/index.tsx` fully real now:**
  - The 5 hardcoded colored-dot "street" markers are gone; real streets
    (already tappable since Phase 2) are the only tappable streets now.
    `selectedStreet`/`openStreet`/`MockStreet` state and the now-fully-
    dead `StreetSheet.tsx` component were removed with them.
  - District/Ortsteile fill color is computed from `getBezirkCoverage()`/
    `getVisitedOrtsteilNames()` (refreshed every 4s, same cadence as
    Settings' own refresh) instead of `mockDistricts`/
    `mockOrtsteileCoverage` — correctly flat/neutral for a fresh install,
    exactly the already-verified Phase 1 empty state, not a separate
    code path that happens to look similar.
  - The "Tracking/Idle" badge now reads real `isTracking()` state instead
    of a local toggle disconnected from Settings' actual tracking state
    — previously the map could say "Tracking" while Settings said
    tracking was off, or vice versa.
  - The "Recenter" FAB now actually recenters: requests real foreground
    permission, fetches a real GPS fix (`expo-location`), and flies the
    camera there — it previously just toggled the same fake tracking
    flag and did nothing to the camera. Bounded with a 10s timeout and
    an honest `Alert` on failure (a GPS fix can genuinely fail — indoors,
    location services off — and a recenter button that silently does
    nothing forever on that is a dead end for the user). Verified
    on-device: this emulator's known GPS-simulation limitation (Phase 3)
    correctly surfaces as the real "Couldn't get your location" alert
    after 10s, not a hang or a crash.
- **`src/app/insights.tsx` fully real now:** totals, district breakdown,
  and top-streets all query `getInsightsTotals()`/`getBezirkCoverage()`/
  `getTopStreets()` — correctly all-zero/empty with honest copy
  ("No streets recorded yet — once you walk somewhere with tracking on
  …") for a fresh install, not Phase 1's fixed placeholder numbers.
- **`src/lib/mockData.ts` renamed to `src/lib/explorationFilter.ts`**
  and stripped to only what was never actually fake: the time-range
  filter preset types (`ExplorationFilter`/`FilterPreset`/`defaultFilter`)
  the filter chip and `FilterSheet` genuinely use. Every hardcoded
  street/district/totals export (`mockStreets`, `mockDistricts`,
  `mockOrtsteileCoverage`, `mockInsightsTotals`, `MockStreet`,
  `MockDistrict`, `FrequencyBand`) is gone — even the old filename
  implied mock content the file no longer has.
- **Settings' "Export backup" button removed, not fixed-later:** it was
  a no-op (`onPress={() => {}}`) — a button that does nothing when
  pressed is exactly the kind of fake affordance this cleanup pass was
  for. plan.md marks export as "optional if easy"; implementing it for
  real needs two new native modules (`expo-file-system`, `expo-sharing`)
  and a rebuild, which is a bigger lift than this cleanup pass — removing
  the fake button now and revisiting a real implementation later (tracked
  below) was the honest choice over shipping a dead button or
  half-building a new feature mid-cleanup.
- Stale copy fixed: Settings' About text no longer says "(Phase 1 design
  mock)".

**Tests run and results:** `npx tsc --noEmit` — same 4 pre-existing,
unrelated errors as every prior phase (two `unknown[]`-typed MapLibre
style-expression lines, two in the unused `app-tabs.web.tsx` template
leftover), zero new errors. `npm test` — 26/26 passing, unaffected by
this pass (pure-logic modules weren't touched). On-device: fresh install
(`pm clear`) → onboarding → map shows uniform neutral fill with zero
markers → Insights shows all zeros with honest empty-state copy →
recenter FAB correctly requests permission and times out honestly on
this emulator's GPS limitation. See `docs/evidence/phase5/`.

**Known issues / risks:**
- Filter chip ("All time") still doesn't narrow any real query by date
  — it's a real, user-facing UI control (not fake data), but choosing a
  different preset doesn't yet change what Map/Insights show. Flagged to
  the user as an explicit, honestly-scoped remaining gap, not silently
  left inconsistent.
- Export backup is gone, not deferred-and-hidden — if wanted later, it
  needs `expo-file-system` + `expo-sharing` added and a native rebuild.
- Everything else already tracked as open in Phase 3/4 (physical-device
  walk tests, Bezirk-border matching edge case, Ortsteil eligible-length
  gap) still stands — this pass didn't touch any of that.

**APK or screenshot artifacts:** `docs/evidence/phase5/01-real-empty-
state-map.png` through `03-real-recenter-timeout-feedback.png`.

**Next:** Phase 6 — signed release build. The user's explicit sequencing
was: finish this real-data cleanup first (done above), only then start
the build/release flow.


## Update 2026-11-07 — Pre-release hardening pass (no release build made)

Implemented and emulator-tested (Android 11; Android 14 where noted):
- Filter-aware everything: Map, legend, Insights and tapped street/area sheets
  follow one saved filter (All time / Today / Yesterday / Last 7 days /
  a specific recorded day / each weekday).
- Passes per street per day, activity by hour, top streets by street name,
  districts vs neighbourhoods counted separately, decimal percentages.
- GPS fix filtering and same-street-aware matching, with a real-street walk
  simulation test.
- Onboarding now starts tracking; tracking resumes on app open; notification
  permission (Android 13+) requested; battery-optimisation guidance card.
- Backup to a file and restore from a file (validated, all-or-nothing).
- Palette editor covers streets and districts, thresholds and colours.
- Branded tab bar and icons, Duppy notification icon, light-only theme, dark
  status-bar text, loading indicator for the street layer, tappable tracking
  badge, accessibility labels on new controls.
- Unit tests: 60 passing.

Not done / needs a physical phone: locked-screen walk, OEM battery behaviour,
reboot resume on real hardware.

## Update 2026-11-07 — Journey tagging v1
Journeys detected from recorded movement, shown in Insights with a route
preview and a speed-based suggestion; whole-journey tags; per-mode distance
totals; backup/restore and delete support. Emulator-verified (Android 11,
including the database upgrade). 71 unit tests passing. Splitting a journey
into fragments is planned for v2. No release build has been made since.

## Update 2026-11-07 — Final validation before release
Fixed: with the phone in system dark mode, Insights/Settings showed a black
status-bar strip. The native theme is now light-only (Theme.AppCompat.Light,
forceDark off). Re-verified on the Android 11 emulator in dark mode.
Validation: 71 unit tests pass; clean build is release-signed, minSdk 24, no
INTERNET permission, not debuggable; fresh install + onboarding + all tabs OK.
