import { useFonts } from 'expo-font';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import WelcomeScreen from '@/app/welcome';
import { getSetting } from '@/lib/db';
import { resumeTrackingIfWanted } from '@/lib/locationTask';

SplashScreen.preventAutoHideAsync();

// The whole design is the cream/sage/lavender light palette, so Android's
// dark mode must not recolour native pieces (dialogs, tab bar, status bar).
if (typeof Appearance.setColorScheme === 'function') Appearance.setColorScheme('light');

export default function TabLayout() {
  // plan.md: "friendly rounded sans for interface" — Quicksand (OFL,
  // see assets/fonts/OFL.txt). Rendering nothing until these resolve
  // keeps the native splash up (already held by preventAutoHideAsync
  // above) instead of flashing the system font first.
  const [fontsLoaded] = useFonts({
    'Quicksand-Regular': require('@/assets/fonts/Quicksand-Regular.ttf'),
    'Quicksand-SemiBold': require('@/assets/fonts/Quicksand-SemiBold.ttf'),
    'Quicksand-Bold': require('@/assets/fonts/Quicksand-Bold.ttf'),
  });

  // Onboarding gate (Phase 3): first launch shows src/app/welcome.tsx's
  // staged permission flow before ever reaching the map; `onboarding_
  // complete` in app_settings (set by welcome.tsx) makes every later
  // launch skip straight past it. Rendered directly as a component here
  // (not via router.replace/Redirect) — welcome.tsx isn't one of
  // AppTabs' NativeTabs.Trigger screens, so redirecting to its route by
  // pathname while AppTabs itself always renders fights the tab
  // navigator's own default-route behavior and loops (confirmed
  // on-device: the app flashed constantly between the two).
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  useEffect(() => {
    getSetting('onboarding_complete').then((v) => {
      setNeedsOnboarding(v !== '1');
      if (v === '1') resumeTrackingIfWanted();
    });
  }, []);

  if (!fontsLoaded || needsOnboarding === null) return null;

  return (
    <ThemeProvider value={DefaultTheme}>
      <StatusBar style="dark" />
      <AnimatedSplashOverlay />
      {needsOnboarding ? <WelcomeScreen onDone={() => setNeedsOnboarding(false)} /> : <AppTabs />}
    </ThemeProvider>
  );
}
