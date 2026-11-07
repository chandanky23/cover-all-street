import * as Location from 'expo-location';
import { PermissionsAndroid, Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';

import { getSetting, insertObservation, latestObservation, purgeOldObservations, setSetting } from './db';
import { shouldStoreFix } from './fixFilter';
import { maybeRunMatcher } from './matchingPipeline';

// Must be registered at module top-level (outside any component) so the
// OS can relaunch the task even if the JS app isn't running in the
// foreground — this is what lets tracking survive an app restart
// (plan.md Phase 3: "recover after app restarts where OS permits").
export const BACKGROUND_LOCATION_TASK = 'duppy-map-background-location';

// Fix filtering (accuracy, impossible jumps, stationary jitter) lives in
// fixFilter.ts so it is unit-tested.

// Throttles the retention purge (a full table scan + delete) to roughly
// once an hour instead of on every single location callback.
const PURGE_INTERVAL_MS = 60 * 60 * 1000;
async function maybePurgeOldObservations() {
  const lastPurgeRaw = await getSetting('observations_last_purge_ts');
  const lastPurge = lastPurgeRaw ? Number(lastPurgeRaw) : 0;
  const now = Date.now();
  if (now - lastPurge < PURGE_INTERVAL_MS) return;
  await purgeOldObservations(now);
  await setSetting('observations_last_purge_ts', String(now));
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[duppy-map] background location task error', error);
    return;
  }
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  if (!locations?.length) return;

  let prev = await latestObservation();
  for (const loc of locations) {
    const accuracy = loc.coords.accuracy ?? null;
    const next = { lat: loc.coords.latitude, lon: loc.coords.longitude, ts: loc.timestamp };
    if (!shouldStoreFix(prev, next, accuracy, loc.coords.speed ?? null)) continue;

    await insertObservation(loc.timestamp, loc.coords.latitude, loc.coords.longitude, accuracy, loc.coords.speed ?? null);
    prev = { id: -1, ts: next.ts, lat: next.lat, lon: next.lon, accuracy_m: accuracy };
  }

  // Match before purge: purgeOldObservations only ever removes points
  // already marked processed, but running the matcher first here means
  // a point doesn't sit unprocessed for a whole extra cycle before it
  // can be matched.
  await maybeRunMatcher();
  await maybePurgeOldObservations();
});

// Staged permissions (plan.md): foreground is requested first, on its
// own, with its own explanation; background is only asked for once
// foreground is actually granted — asking for both at once is both
// confusing (one system dialog can't explain two different asks) and,
// on Android 10+, often not even how the OS presents it (background
// access is frequently only grantable via a second, separate flow).
// Each stage's result is returned separately so the calling UI can show
// different messaging per stage rather than one pass/fail.
export async function requestForegroundPermission() {
  return Location.requestForegroundPermissionsAsync();
}

export async function requestBackgroundPermission() {
  return Location.requestBackgroundPermissionsAsync();
}

export async function startBackgroundTracking() {
  const already = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (already) return;
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 5000,
    // plan.md: "adaptive location accuracy/intervals and battery-aware
    // batching." The adaptive part here is `distanceInterval` itself,
    // not a custom polling-rate scheduler: expo-location (like the
    // native Android FusedLocationProvider it wraps) simply doesn't
    // deliver a callback at all once the device has been stationary
    // within this radius, so battery cost already scales down
    // automatically when the user isn't moving, without this app
    // needing to stop/restart the subscription itself (which would risk
    // losing updates mid-walk for a battery saving that distanceInterval
    // already provides). 15m balances that against not missing short
    // residential-street segments.
    distanceInterval: 15,
    foregroundService: {
      notificationTitle: 'Duppy Map is tracking',
      notificationBody: 'Recording streets you explore in Berlin.',
      notificationColor: '#8FA994',
    },
  });
}

export async function stopBackgroundTracking() {
  const already = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (!already) return;
  await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}

export async function isTracking() {
  return Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}

// Android 13+ makes the notification itself a runtime permission. Without
// it the tracking service still runs but its "Duppy Map is tracking"
// notice is hidden, which would break the promise made in onboarding.
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

// "Tracking wanted" is the user's intent (set by onboarding / the Settings
// switch). It lets the app resume tracking on its own after the phone
// restarts or the OS ends the service — Android cannot start it without
// the app being opened once.
export async function startTrackingAndRemember() {
  await startBackgroundTracking();
  await setSetting('tracking_wanted', '1');
}

export async function stopTrackingAndRemember() {
  await setSetting('tracking_wanted', '0');
  await stopBackgroundTracking();
}

export async function resumeTrackingIfWanted(): Promise<void> {
  try {
    if ((await getSetting('tracking_wanted')) !== '1') return;
    if (await isTracking()) return;
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return;
    await startBackgroundTracking();
  } catch (e) {
    console.warn('[duppy-map] could not resume tracking', e);
  }
}
