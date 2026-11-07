# Duppy Map — Design Specification (Phase 1)

Required before full UI implementation per `plan.md` V5-B. This document is
the screen-by-screen spec; reviewable mockups are **implemented mock
screens** (not static comps) under `src/app/`, captured as screenshots in
`docs/evidence/phase1/` as each one is built — matching plan.md's own
guidance that mockups may be "local image files or implemented mock
screens." Sign-off for each screen is recorded in `docs/STATUS.md`, not
here.

## Brand system

- **Tokens** (`src/constants/duppyTheme.ts`): cream `#FFF7E9` (surface),
  sage `#8FA994` (primary), lavender `#B9A0D8` (accent), forest `#405E50`
  (text/buttons), blush `#F0D8D9` (secondary accent), unvisited-road grey
  `#C8CBC4`. App chrome always uses these regardless of the user's chosen
  heatmap palette (V5-B).
- **Heatmap defaults** ("Duppy Garden" preset): 0 grey `#C8CBC4`, 1 light
  lavender `#DCC6ED`, 2–4 lavender `#B9A0D8`, 5–9 sage `#8FA994`, 10+
  forest `#405E50`. Coverage mode reuses the same five colors over
  `0% / (0,25] / (25,50] / (50,75] / (75,100]`.
- **Spacing:** 8pt scale — 4/8/16/24/32/48 (`space.xs…xxl`).
- **Radius:** sheets 28dp, cards 20dp, buttons 16dp, chips fully rounded.
  Falls inside plan.md's "rounded corners ~18–28dp" guidance.
- **Touch targets:** 48dp minimum everywhere.
- **Typography scale:** display 32/40/700, title 24/30/700, heading
  18/24/600, body 16/22/400, label 14/18/600, caption 12/16/400. Friendly
  rounded sans for UI; family TBD to a licensed/open rounded sans (e.g.
  Quicksand, Comfortaa, or similar) — not yet bundled, tracked as an open
  item below.
- **Motion:** spring sheets (`motion.sheetSpring`), 150ms quick fades for
  palette/filter cross-fades, 600ms count-up for numbers. All motion must
  check `useReducedMotion()` / `AccessibilityInfo.isReduceMotionEnabled`
  and skip non-essential animation when enabled.
- **Logo:** `src/components/duppy-logo.tsx` — winding street resolving
  into a map pin wrapped by one botanical leaf, flat sage/lavender/forest
  fill on a cream disc. Legible at launcher-icon size (simple shapes, no
  fine detail). Original composition, not derived from the reference
  screenshots' artwork.

## Screen-by-screen spec

### 1. Native splash + logo
- Cream (`#FFF7E9`) background, centered `DuppyLogo` mark + "Duppy Map"
  wordmark beneath it in forest green, friendly rounded sans.
- Must appear immediately (native splash, not JS-rendered) and hand off to
  the first interactive frame without blocking on network/map data.
- Optional: a brief leaf/route-reveal cross-fade after native launch,
  capped short, skipped entirely under reduced motion.
- Implementation: `app.json`'s `expo-splash-screen` plugin
  (`backgroundColor: #FFF7E9`) is already wired; the image asset itself
  (exported from `DuppyLogo`) is an open item — see below.

### 2. Welcome / permission education
- **Welcome:** full-bleed cream background, `DuppyLogo`, short warm
  personal message, primary button "Start exploring Berlin" (sage fill,
  cream text, 16dp radius, 48dp+ height).
- **Permission education (separate step):** plain-language explanation of
  foreground vs. background location, why tracking continues when locked,
  that data stays on-device, and the battery tradeoff. Progressive
  request: foreground permission first; if background is needed and the
  OS doesn't offer "Allow all the time" inline (confirmed exactly this
  happens on Android 11+ in Phase 0 testing — see `docs/QA.md`), show a
  short explainer screen with a button that deep-links to system Settings.
  Must gracefully handle approximate-only, denied, and permanently-denied
  states with a clear retry/settings path, never a dead end.

### 3. Berlin map — district zoom
- Map fills the viewport. Top: compact filter chip (active `ExplorationFilter`
  summary) + tracking status dot. Floating controls: recenter/locate,
  palette/legend, one Insights entry — all ≥48dp targets, positioned to
  avoid gesture conflicts with map pan/pinch.
- Bezirke/Ortsteile shaded by the active **area metric** (default: coverage
  %), with a clearly labeled legend distinguishing this from street-level
  visit-frequency bands (V3/V5 requirement — district fill is never to be
  mistaken for street frequency).
- Empty state (no observations yet): grey/neutral district fill, map still
  fully pannable/zoomable, short friendly copy inviting first tracking.

### 4. Map — street zoom with heatmap bands + legend
- Transition from district polygons to street-segment vector lines as the
  user zooms in; never render all of Berlin at full street resolution on
  first frame (viewport/tile-scoped rendering).
- Streets colored by visit-frequency (or coverage, per the mode toggle)
  band using the active palette. Compact floating legend, expandable to
  show exact numeric ranges + colors for the current metric; legend
  content changes with metric/palette (V5-A).
- Selected street keeps a visible halo/outline regardless of surrounding
  colors so it's never lost against the heatmap.

### 5. Selected-street bottom sheet
- Spring-in native-feeling bottom sheet: street name, active filter chip,
  frequency band + exact traversal count, distinct visit-days, covered
  metres, and an "All time" comparison line. Confidence/unknown indication
  for low-confidence matches — never implies a visit that wasn't observed.
- Dismiss by swipe-down or scrim tap; reopening preserves map camera and
  selection highlight (no remount).

### 6. Date-range / weekday filter sheet
- Bottom sheet: preset list (All time, Today, Yesterday, Last 7 days,
  Specific date, Custom range, Every <weekday>), native-feeling calendar
  for custom ranges, weekday chips combinable with a date range. Inclusive
  end dates. Visible "Reset to All time." Empty-match state: themed,
  friendly "nothing recorded in this window" — never a blank crash-looking
  screen.
- Applying a filter updates map, legend, street sheet, and Insights
  atomically from one shared `ExplorationFilter` — no screen shows a stale
  value.

### 7. Heatmap appearance editor ("Customize heatmap")
- Reachable from the map's palette/legend icon and from Settings. Mode
  toggle: Visits | Coverage. Preset selector: Duppy Garden (default),
  Lavender Dream, Forest Walk, High Contrast, Custom.
- Five band rows per metric: editable numeric boundary (except the fixed
  `0` band and the open-ended top band) + color swatch → small picker
  (preset swatches + HEX input). Live preview on a small sample road
  diagram and the real map simultaneously.
- Inline validation: contiguous/ordered/exhaustive boundaries, no
  overlaps/gaps, nonnegative integers (visits) or 0–100 (coverage); Save
  disabled until valid, with inline error text — never silently
  reordered/reinterpreted (V5-A). "Reset to Duppy defaults" with
  confirmation only if there are unsaved edits.
- Changing colors/thresholds must never remount the map, lose camera
  position, or recompute GPS history — only reclassifies cached per-segment
  aggregates and updates MapLibre paint expressions.

### 8. Most-visited streets + Insights
- Overall totals (streets travelled, length covered, areas explored,
  repeat visits) using the active filter. **Top streets** list ranked by
  deduplicated traversal count, with distinct visit-days shown per row;
  optional covered-length. Tap a row → focuses map + opens the street
  sheet (screen 5).
- No arbitrary proprietary "city familiarity" score (explicitly out of
  scope per plan.md). Compact weekday distribution allowed; no elaborate
  charting.

### 9. Tracking / Settings / empty states
- Settings: tracking on/off switch, live GPS + permission status,
  battery-optimization guidance copy, plain-language local-data
  explanation, "Export backup" (optional/if easy), "Delete all data" with
  a confirmation step, app version, OSM attribution, privacy notice link
  to the heatmap editor and filter sheet.
- Empty states throughout (no observations, no match for filter, map
  without geo dataset yet) share one friendly, on-brand visual language —
  never a bare system default "no data" screen.

## Accessibility & environmental checks (apply to every screen above)
- Minimum 48dp touch targets; text contrast checked against both the cream
  surface and any heatmap-colored overlay text sits on.
- Reduced-motion: every spring/cross-fade/count-up has a static fallback.
- Legible at common Android phone widths (360–420dp); no horizontal
  scroll; safe-area aware (status bar, gesture nav bar).
- Color is never the only signal — legend text, tap-revealed exact values,
  and (where useful) line-pattern/width differences back up every
  color-coded state (V3 requirement).

## Open items before this gate can be marked PASSED in `docs/STATUS.md`
- [ ] Final rounded sans + optional display typeface selected and bundled
      (open-source/licensed only) — system default used for now.
- [x] Screens 1–8 implemented as mock screens with mock data and
      screenshotted into `docs/evidence/phase1/` (splash/logo, welcome,
      permission education, map w/ markers+legend, street sheet, filter
      sheet, heatmap editor, insights, settings).
- [ ] A dedicated empty-state screenshot (map with zero observations,
      filter with no matches) — implicit in the current mock (no real data
      exists yet) but not separately captured/labeled.
- [ ] Two contrasting heatmap palettes (e.g. Duppy Garden + High Contrast)
      demonstrated side by side on the same street-zoom mock to check
      legibility — only Duppy Garden screenshotted so far.
- [x] Fixed (2026-11-07): preset/weekday chip rows in the heatmap editor
      and filter sheet were rendering almost entirely clipped (only a
      sliver of each pill visible, text unreadable) — root cause was the
      horizontal `ScrollView`'s own height collapsing to near-zero inside
      the animated `Sheet`, regardless of any explicit `style.height` set
      on it (confirmed via `uiautomator` bounds dumps: the ScrollView's
      measured height didn't change at all between two very different
      `height` values). Resolved by replacing both horizontal `ScrollView`
      rows with a wrapping flex `View` (`flexDirection: 'row', flexWrap:
      'wrap'`), and adding `flexShrink: 0` / `alignSelf: 'flex-start'` to
      `Chip` defensively. See `docs/evidence/phase1/09-...png` and
      `10-...png`. Root cause of the ScrollView-height collapse itself
      (RN 0.88 Fabric + Reanimated-animated parent?) was not fully
      diagnosed — worth a closer look if a horizontal scroll row is
      needed again in a later phase (e.g. for a long custom-color list).
- [ ] Settings tab currently reuses the Insights tab icon (no dedicated
      icon asset yet) — placeholder, needs real icon art.
- [x] Sheets (street detail / filter / heatmap editor) consolidated to a
      single mutually-exclusive `ActiveSheet` state in `src/app/index.tsx`
      so two can never render stacked — found while reviewing the heatmap
      editor screenshot; previously `selectedStreet` and `sheet` were
      independent booleans that could in principle both be true at once.
- [x] Verified (2026-11-07) with a screen recording (`adb shell screenrecord`
      + OpenCV frame extraction, since ffmpeg wasn't available): caught the
      sheet mid-close, clearly sliding off the bottom of the screen across
      consecutive frames rather than vanishing in one — see
      `docs/evidence/phase1/14-...png` / `15-...png` / `16-...png` (montage).
      Confirms the `Sheet.tsx` fix below actually animates on this device,
      not just in code review.
- [x] Fixed (2026-11-07): tap-to-pick colour picker
      (`src/components/duppy/HeatmapEditorSheet.tsx`) replaces the raw
      always-visible hex `TextInput` per band, which the user correctly
      flagged as unintuitive (plan.md/V5-B itself calls for "a small
      colour picker with preset swatches plus optional HEX input," not a
      bare hex box). Each band row now shows a swatch + chevron; tapping
      expands an inline grid of 12 named swatches (e.g. "Terracotta",
      "Sage") with a checkmark on the current selection, plus a
      collapsed-by-default "Or enter a custom colour code…" link for the
      hex field. Kept inline (not a nested sheet) to preserve the
      no-modal-in-a-modal fix from earlier. New palette lives in
      `src/lib/heatmapSettings.ts` (`namedSwatches`). Verified end-to-end
      on-device: opened picker for band "1", tapped "Terracotta", band
      updated live and preset auto-switched to "Custom" — see
      `docs/evidence/phase1/12-...png` / `13-...png`.
- [x] Fixed (2026-11-07): the shared `Sheet` shell
      (`src/components/duppy/Sheet.tsx`) never let its content scroll, so
      once the heatmap editor's content grew (after wrapping the preset
      chips to two rows), "Reset to defaults"/"Save" fell past the sheet's
      80% max-height and were completely unreachable — not a visual bug,
      an actual dead end for the user. Wrapped the sheet's children in a
      vertical `ScrollView` (handle stays fixed above it). Verified by
      swiping up inside the heatmap editor — see
      `docs/evidence/phase1/11-heatmap-editor-scrolled-to-save.png`. Any
      future sheet with enough content to exceed 80% of screen height now
      scrolls automatically rather than silently clipping.
- [ ] Orchestrator sign-off recorded in `docs/STATUS.md` (theme
      consistency, information hierarchy, map legibility, feasibility).
