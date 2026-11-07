# Duppy Map — Release / Build Instructions

## Current release

- **Version:** 1.0.0 (versionCode 1)
- **File:** `release/duppy-map-v1.0.0.apk`
- **SHA-256:** `1bfc4b03d28d6212e06b7ed616e372ad5792b9b73f6c2b846f8bd3b11820f450`
  (also in `release/duppy-map-v1.0.0.apk.sha256` next to the APK)
- **Signed with:** the real release keystore described below (confirmed
  via `apksigner verify --print-certs`, not just assumed from the build
  succeeding).
- **Size:** 86.7 MB (phone processors only: arm64-v8a and armeabi-v7a).
- **Built and verified:** 2026-11-07, on the `Pixel_2_XL_API_30` emulator
  — Metro was killed, the debug build fully uninstalled, and the APK
  installed and launched standalone before anything in this file was
  written. See `docs/evidence/phase6/` for screenshots: a clean launch
  straight to the real welcome screen with no dev menu, the full
  onboarding → permission → map flow, a real district tap showing real
  population data, Insights showing all 12 Bezirke with real (zero, for
  a fresh install) coverage %, and the real foreground-service
  notification ("Duppy Map is tracking / Recording streets you explore
  in Berlin").
- **minSdkVersion 24** (Android 7.0, released 2016) — set by Expo/React
  Native's own floor, not something this app configures further. A
  phone bought anywhere in the last 8+ years, including "3–4 years ago
  in Berlin," is already comfortably supported; no action was needed
  here.

## What this build is

- A signed **release** build (not debuggable, minified, Hermes bytecode),
  rebuilt from a fully clean `gradlew clean assembleRelease`.
- **Fully offline:** the map uses an inline background style plus the
  bundled Berlin GeoJSON, and the app declares **no INTERNET permission**
  (removed in `AndroidManifest.xml`). Verified with the emulator's Wi-Fi
  and mobile data switched off. Permissions requested: location
  (foreground, background), foreground service (location), notifications,
  boot-completed, vibrate.
- Real Duppy launcher icon (adaptive + round + monochrome) and splash,
  generated from the in-app logo geometry.

## What the app does for the user

- Background tracking (foreground-service notification), stored only in
  the phone's own SQLite database.
- Streets are matched conservatively and counted as **passes**: leaving a
  street for 10+ minutes and coming back is a new pass.
- Time filter (map and Insights always agree): All time, Today, Yesterday,
  Last 7 days, **a specific day you walked**, or every Mon–Sun.
- Insights: streets travelled, km covered, areas explored, active days,
  street passes, **activity by hour of day**, district coverage, and a
  ranked top-streets list.
- Map: districts and neighbourhoods shaded by coverage; walked streets
  coloured by how many passes (editable bands and colours, saved).
- Settings: tracking on/off, delete all data (verified: everything returns
  to zero).

## Installing it

The recipient's phone needs **"Install unknown apps"** allowed for
whatever app they use to open the APK file (Settings → Apps → Special
access → Install unknown apps, varies by Android version/OEM) — this is
normal for any APK installed outside Google Play, not specific to this
app. Then: open the APK file, confirm the install prompt, done. No
Google account, no Play Store listing, no internet connection needed
for the install or for using the app afterward.

## Rebuilding it yourself

```bash
# one-time per shell session (ANDROID_HOME is not in the default profile)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

npm install
npx expo prebuild --platform android   # regenerates android/ from app.json
cd android
./gradlew assembleRelease              # signed release APK
```

Output: `android/app/build/outputs/apk/release/app-release.apk`. This
only produces a *properly signed* release build if `android/keystore.
properties` exists and points at a real keystore (see below) — without
it, `android/app/build.gradle`'s release build type falls back to the
debug keystore so the Gradle config itself never breaks, but the result
wouldn't be a real release signature. Verify whichever you get:

```bash
"$ANDROID_HOME/build-tools/<version>/apksigner" verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
```

A debug build (`./gradlew assembleDebug`, or `npx expo run:android`
during development) still works as before and is unaffected by any of
this.

## Release signing — keystore details

**The keystore is the single most consequential file in this project.**
Anyone who has it (and its password) can publish updates that Android
will accept as "the same app" as this one; anyone who *loses* it can
never again update this exact app install — a replacement APK signed
with a different key cannot upgrade over this one, only replace it after
the user manually uninstalls (losing all local data, since
`deleteAllUserData`-style uninstall-and-reinstall wipes the on-device
SQLite database).

- **File:** `android/app/duppy-map-release.keystore` (gitignored —
  confirmed via `android/.gitignore`, never committed)
- **Properties file:** `android/keystore.properties` (also gitignored)
  holds the store password, key alias (`duppy-map`), and key password —
  `build.gradle` reads this file rather than hardcoding secrets in a
  tracked file.
- **Validity:** 30 years from 2026-11-07 (until 2056-10-30) — deliberately
  long so this is a one-time decision, not something to redo in a few
  years.
- **Certificate fingerprint (SHA-256):**
  `76:6D:44:8D:33:78:D2:0C:9E:0D:91:90:1A:16:37:4B:D9:AC:49:3D:7D:5A:32:9C:02:B8:B4:14:95:F4:F8:1A`

**You must back up `android/app/duppy-map-release.keystore` and
`android/keystore.properties` yourself, outside this machine and outside
git** (a password manager's file storage, an encrypted drive, etc.) —
neither is committed to version control, and neither can be regenerated
identically if lost. Losing them doesn't break the APK you already have
— it only means you can never build an *update* to it under the same
identity.

## Known limitations

- **No physical Android device has exercised background location yet**
  (tracked since Phase 0, still open — see `docs/QA.md` and
  `docs/STATUS.md`'s Phase 3/4 entries). This release has been verified
  to install and run correctly standalone, including the real permission
  flow and foreground-service notification, but the one thing that
  can't be verified from this machine is whether tracking survives a
  real 30–60 minute locked-screen walk under a real device's battery
  optimization. Treat this as the one open question before fully
  trusting the app's core premise.
- No custom date-*range* picker; single days, weekdays and presets only.
- The hourly chart shows relative walking activity (matched GPS points per
  hour), not exact minutes.
- The first zoom into street level after launch can take a few seconds
  while the bundled street data loads.
- Neighbourhood-level (Ortsteil) coverage is a simple visited/not-visited
  signal, not a numeric %, since no per-Ortsteil street-length breakdown
  exists (see `docs/STATUS.md`).
- Gift-quality polish (Phase 5: motion/transition refinement, a warm
  copy pass, accessibility pass) was not done as a dedicated phase —
  most of its concerns (smooth sheet animations, reduced-motion support,
  a friendly empty-state tone) were already addressed incrementally
  while building each feature, but it was never reviewed as its own
  pass.


## Final release (2026-11-07)

- File: `release/duppy-map-v1.0.0.apk` — 86,728,282 bytes.
- SHA-256: `1bfc4b03d28d6212e06b7ed616e372ad5792b9b73f6c2b846f8bd3b11820f450`
- Built from a clean state, release-signed (certificate SHA-256 `766d448d...f4f81a`),
  minSdk 24, targetSdk 36, not debuggable, no INTERNET permission.
- Fresh-installed and smoke-tested on the Android 11 emulator (onboarding,
  automatic tracking start, all tabs, no crashes). Android 14 onboarding was
  verified earlier on an Android 14 emulator.
- Sharing steps for the sender and the recipient: `release/HOW-TO-SHARE.txt`.
