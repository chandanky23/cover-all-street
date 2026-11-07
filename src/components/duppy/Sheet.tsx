import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { brand, radius, space } from '@/constants/duppyTheme';

const OFFSCREEN_Y = 500;

// Shared bottom-sheet shell for street detail / filter / heatmap editor
// (plan.md "Prefer native bottom sheets"). Spring-in, scrim-dismiss, swipe-
// down affordance via the drag handle. Respects reduced motion.
export function Sheet({
  visible,
  onDismiss,
  children,
}: {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  // Stays mounted through the close animation — unmounting immediately on
  // `visible: false` (as a plain `if (!visible) return null` would) kills
  // the exit animation before it gets a single frame, which is why the
  // sheet used to just vanish instead of sliding out.
  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(visible ? 0 : OFFSCREEN_Y);
  const scrimOpacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (visible) {
        setMounted(true);
        scrimOpacity.value = withTiming(1, { duration: 180 });
        translateY.value = reduced ? 0 : withSpring(0, { damping: 22, stiffness: 220, mass: 0.8, overshootClamping: true });
      } else if (reduced) {
        scrimOpacity.value = 0;
        translateY.value = OFFSCREEN_Y;
        setMounted(false);
      } else {
        scrimOpacity.value = withTiming(0, { duration: 180 });
        translateY.value = withTiming(OFFSCREEN_Y, { duration: 220 }, (finished) => {
          if (finished) runOnJS(setMounted)(false);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, translateY, scrimOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimOpacity.value }));

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" />
      </Animated.View>
      <Animated.View style={[styles.sheet, sheetStyle]}>
        <View style={styles.handle} />
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(64,94,80,0.35)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: brand.cream,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space.sm,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: brand.unvisitedRoad,
    marginBottom: space.sm,
  },
  scroll: { flexShrink: 1 },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.sm,
  },
});
