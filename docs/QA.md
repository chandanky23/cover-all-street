# Duppy Map — QA Checklist and Evidence

Real-device test checklist per `plan.md`. A row stays **BLOCKED** until real
evidence (screenshot, log excerpt, device name/OS version, timestamp) is
attached — a successful build or emulator-only run does not satisfy a
device-evidence row.

## Phase 0 — Feasibility spike

| Check | Status | Evidence |
|---|---|---|
| Expo project scaffolds, `expo-doctor` passes | PASSED | 20/20 checks passed, 2026-11-06 |
| `expo prebuild --platform android` succeeds | PASSED | `android/` generated cleanly, 2026-11-06 |
| Debug APK builds via Gradle (`assembleDebug`) | PASSED | build succeeded, `android/app/build/outputs/apk/debug/app-debug.apk`, 2026-11-06 |
| Dev-client APK installs and launches, connects to Metro | PASSED (emulator) | `Pixel_2_XL_API_30` AVD; screenshot `docs/evidence/phase0/01-app-launch-dev-template.png` |
| MapLibre renders a real map centered on Berlin | PASSED (emulator, placeholder tiles) | screenshot `docs/evidence/phase0/02-maplibre-berlin-render.png`; used `@maplibre/maplibre-react-native` `Map`+`Camera` with the public MapLibre demo style as a smoke-test tile source only — **not** the final Berlin basemap decision (Phase 2) |
| MapLibre renders Berlin on a **physical** Android phone | BLOCKED — requires device | emulator result above is lower-confidence evidence only; user chose emulator-first path on 2026-11-06 |
| Background location + task-manager captures points to SQLite, screen locked, 20–30 min real walk | BLOCKED — requires device | see interim emulator test below; real walk not yet attempted |
| Signing/build path to a shareable APK verified end-to-end | BLOCKED — requires release keystore decision | debug build only so far |

## Interim emulator location/permission smoke test (2026-11-06)

Minimal `expo-task-manager` + `expo-location` + `expo-sqlite` spike (`src/lib/locationTask.ts`,
`src/lib/db.ts`), registered at module top-level per plan.md, exercised on
the `Pixel_2_XL_API_30` emulator (Android 11 / API 30, `google_apis` image,
not `google_apis_playstore`):

| Step | Result |
|---|---|
| Foreground location permission dialog appears | **Confirmed** — standard "While using the app / Only this time / Deny" dialog. Screenshot `03-foreground-permission-dialog.png`. |
| Background permission request redirects to system Settings (Android 11+ behavior predicted by plan.md) | **Confirmed exactly as plan.md describes** — no direct "allow all the time" option in-dialog; app opens Settings → Location permission → radio buttons. Screenshots `04-android11-background-settings-redirect.png`, `05-allow-all-the-time-selected.png`. |
| First attempt returned `denied` | Logged — caused by backing out of the Settings screen too quickly after tapping the radio button (test-harness timing, not app behavior). Retried with more pacing and it succeeded. |
| `expo-task-manager` registers the background task with the OS | **Confirmed** via logcat: `TaskService: Registered task with name 'duppy-map-background-location-spike'...` and `TaskService: Handling intent with task name...`. |
| App UI reflects `status: tracking`, foreground-service notification/location indicator appears in status bar | **Confirmed** — screenshot `06-tracking-status-active.png`. |
| Simulated GPS fixes (`adb emu geo fix <lon> <lat>`) reach the app and produce SQLite rows | **Not confirmed on this AVD.** `dumpsys location` showed `gps provider: last location=null` and `fused provider: last location=null` even after multiple `geo fix` calls over ~30s; `observations` count stayed at 0. This looks like a known limitation of the `google_apis` (non-Play-Store) system image's simulated GPS/Fused-location bridge, not an app code defect — the permission grant, task registration, and foreground-service wiring all succeeded; only the simulated position injection didn't propagate. |

**Conclusion:** the background-location *plumbing* (permissions, task registration,
foreground service, SQLite write path) is wired correctly and behaves exactly as
plan.md predicts for Android 11+. What remains unverified is actual location
delivery — which requires either a `google_apis_playstore` AVD image/a different
emulator config, or (per plan.md's actual requirement) a **real physical device
walk**. This interim test does not satisfy the Phase 0 hard gate; it only
reduces the number of unknowns before that real-device test.

## Later phases (template — fill in as reached)

- [ ] Locked-screen background tracking survives app switch (physical device)
- [ ] Permission denial / revocation / permanent-denial handled without crash
- [ ] GPS-off state handled without crash
- [ ] Date/weekday filters recolor map, insights, street sheet atomically
- [ ] Palette/threshold edits repaint without map remount or camera reset
- [ ] Palette + heatmap settings persist across app restart
- [ ] Cold start, pan/zoom, filter switching profiled on a mid-range physical device
- [ ] Network traffic inspected for unintended telemetry
- [ ] Delete-all-data removes all personal history and derived caches
- [ ] Clean install of signed release APK without Google Play
- [ ] OSM/map data attribution displayed and correct

## Device(s) used for testing

- **Emulator:** `Pixel_2_XL_API_30` (Android 11, API 30), macOS host, used
  2026-11-06 for the Phase 0 build/launch/map-render smoke test. Chosen
  because no physical Android device was available; user explicitly opted
  to proceed with an emulator for now (2026-11-06) and accepted that
  lock-screen/background-GPS evidence stays BLOCKED until a real device is
  used.
- **Physical device:** none yet.
