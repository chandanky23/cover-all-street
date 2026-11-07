import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DuppyLogo } from '@/components/duppy-logo';
import { DuppyButton } from '@/components/duppy/primitives';
import { brand, space, type } from '@/constants/duppyTheme';
import { setSetting } from '@/lib/db';
import {
  requestBackgroundPermission,
  requestForegroundPermission,
  requestNotificationPermission,
  startTrackingAndRemember,
} from '@/lib/locationTask';

// Screens 1–2 (native splash/logo + welcome + permission education).
// Reached via the onboarding gate in src/app/_layout.tsx on first launch
// only; once `onboarding_complete` is set below, later launches skip
// straight to the map.
export default function WelcomeScreen({ onDone }: { onDone?: () => void } = {}) {
  const [step, setStep] = useState<'welcome' | 'permission' | 'requesting' | 'done'>('welcome');
  const [permissionNote, setPermissionNote] = useState<string | null>(null);

  async function finishOnboarding() {
    await setSetting('onboarding_complete', '1');
    // Rendered directly by the root layout's onboarding gate (the normal
    // path) rather than as its own navigator screen — `onDone` swaps it
    // out for the real app in that case. `router.replace` is kept as a
    // fallback for the (currently unused) case of visiting /welcome
    // directly, e.g. a future dev deep link.
    if (onDone) onDone();
    else router.replace('/');
  }

  async function onContinue() {
    setStep('requesting');
    // Staged (plan.md): foreground is asked for on its own first; only
    // once that's granted do we ask for background, since one dialog
    // can't explain two different asks and Android frequently makes
    // background a distinct second flow anyway (on this emulator it's a
    // redirect to system Settings — see docs/QA.md). Whatever the
    // outcome, we land on 'done' with an explanatory note rather than
    // navigating away immediately — a denial message nobody gets to
    // read isn't a real explanation.
    const fg = await requestForegroundPermission();
    if (fg.status !== 'granted') {
      setPermissionNote("Location access wasn't granted, so tracking will stay off — you can turn it on anytime from Settings.");
      setStep('done');
      return;
    }
    // Ask for the notification permission (Android 13+) while the app is
    // still in front, before the background step sends the user to
    // system settings.
    await requestNotificationPermission();
    const bg = await requestBackgroundPermission();
    try {
      await startTrackingAndRemember();
    } catch {
      setPermissionNote("Tracking couldn't start — you can turn it on from Settings.");
      setStep('done');
      return;
    }
    if (bg.status !== 'granted') {
      setPermissionNote('Tracking has started. Background access was skipped, so it may pause when the app is closed — choose "Allow all the time" in Settings for the best results.');
    } else {
      setPermissionNote("You're all set — tracking has started and keeps going in the background, even while your phone is locked.");
    }
    setStep('done');
  }

  function onNotNow() {
    setPermissionNote("Tracking is off for now — you can turn it on anytime from Settings.");
    setStep('done');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {step === 'welcome' && (
        <View style={styles.center}>
          <DuppyLogo size={120} />
          <Text style={styles.wordmark}>Duppy Map</Text>
          <Text style={styles.message}>
            A little gift that quietly remembers every Berlin street you walk, so your map fills in
            as your city gets bigger.
          </Text>
          <DuppyButton label="Start exploring Berlin" onPress={() => setStep('permission')} />
        </View>
      )}
      {(step === 'permission' || step === 'requesting') && (
        <View style={styles.center}>
          <Text style={styles.title}>Before we start</Text>
          <Text style={styles.message}>
            Duppy Map needs your location to paint streets as you walk them — including while your
            phone is locked, so a walk doesn't stop being recorded the moment the screen turns off.
          </Text>
          <Text style={styles.message}>
            Everything stays on this phone. Nothing is uploaded, and there's no account. You can turn
            tracking off, or delete everything, at any time from Settings.
          </Text>
          <Text style={styles.message}>
            You'll see a small notification whenever tracking is active — that's Android letting you
            know, not an ad.
          </Text>
          <DuppyButton
            label={step === 'requesting' ? 'Requesting…' : 'Continue'}
            onPress={onContinue}
          />
          <DuppyButton label="Not now" variant="secondary" onPress={onNotNow} />
        </View>
      )}
      {step === 'done' && (
        <View style={styles.center}>
          <DuppyLogo size={80} />
          <Text style={styles.title}>You're ready</Text>
          {permissionNote && <Text style={styles.message}>{permissionNote}</Text>}
          <DuppyButton label="Enter Duppy Map" onPress={finishOnboarding} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: brand.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  wordmark: { ...type.title, color: brand.forest },
  title: { ...type.title, color: brand.forest, textAlign: 'center' },
  message: { ...type.body, color: brand.forest, textAlign: 'center', opacity: 0.85 },
});
