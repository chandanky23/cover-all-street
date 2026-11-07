import { haversineMeters } from './geoMath';

// Which GPS fixes are worth storing. Poor-accuracy fixes would snap to the
// wrong street, and fixes recorded while standing still (home, a desk, a
// café) are jitter, not travel — plan.md: never count stationary jitter as
// coverage.
export const MAX_ACCURACY_M = 35;
export const MAX_PLAUSIBLE_SPEED_MPS = 50;
export const MIN_MOVING_SPEED_MPS = 0.5;
export const STATIONARY_RADIUS_M = 12;
const STATIONARY_IMPLIED_SPEED_MPS = 0.8;

export type Fix = { lat: number; lon: number; ts: number };

export function shouldStoreFix(
  prev: Fix | null,
  next: Fix,
  accuracyM: number | null,
  deviceSpeedMps: number | null
): boolean {
  if (accuracyM !== null && accuracyM > MAX_ACCURACY_M) return false;
  // Android reports -1 / null when it has no Doppler speed.
  const speed = deviceSpeedMps !== null && deviceSpeedMps >= 0 ? deviceSpeedMps : null;
  if (speed !== null && speed < MIN_MOVING_SPEED_MPS) return false;
  if (!prev) return true;

  const dtSeconds = (next.ts - prev.ts) / 1000;
  if (dtSeconds <= 0) return false;
  const distance = haversineMeters({ lat: prev.lat, lon: prev.lon }, { lat: next.lat, lon: next.lon });
  const implied = distance / dtSeconds;
  if (implied > MAX_PLAUSIBLE_SPEED_MPS) return false;
  if (distance < STATIONARY_RADIUS_M && implied < STATIONARY_IMPLIED_SPEED_MPS) return false;
  return true;
}
