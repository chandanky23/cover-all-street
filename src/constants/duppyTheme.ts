// Duppy Map brand + data tokens (plan.md "Design direction", V5-B).
// App chrome always uses the brand tokens; heatmap tokens are the
// user-editable defaults (V5-A) — never read brand colors for data overlays
// or vice versa.

export const brand = {
  cream: '#FFF7E9',
  sage: '#8FA994',
  lavender: '#B9A0D8',
  forest: '#405E50',
  blush: '#F0D8D9',
  unvisitedRoad: '#C8CBC4',
} as const;

export const heatmapDefaults = {
  visits: {
    zero: '#C8CBC4',
    one: '#DCC6ED',
    twoToFour: '#B9A0D8',
    fiveToNine: '#8FA994',
    tenPlus: '#405E50',
  },
  coverage: {
    zero: '#C8CBC4',
    upTo25: '#DCC6ED',
    upTo50: '#B9A0D8',
    upTo75: '#8FA994',
    upTo100: '#405E50',
  },
} as const;

// 8pt spacing scale (plan.md V5-B "consistent 8pt spacing").
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sheet: 28,
  card: 20,
  button: 16,
  chip: 999,
} as const;

export const touchTarget = 48;

// Typography scale — plan.md's "friendly rounded sans for UI": Quicksand
// (OFL-licensed, assets/fonts/, loaded via useFonts in src/app/_layout.tsx),
// sized for an Android phone. Each weight is its own named font family
// rather than fontFamily+fontWeight — Android doesn't reliably synthesize
// weights for a custom typeface, so picking the matching static instance
// per level (and omitting fontWeight) avoids a double-bolded look.
export const type = {
  display: { fontFamily: 'Quicksand-Bold', fontSize: 32, lineHeight: 40 },
  title: { fontFamily: 'Quicksand-Bold', fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: 'Quicksand-SemiBold', fontSize: 18, lineHeight: 24 },
  body: { fontFamily: 'Quicksand-Regular', fontSize: 16, lineHeight: 22 },
  label: { fontFamily: 'Quicksand-SemiBold', fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: 'Quicksand-Regular', fontSize: 12, lineHeight: 16 },
};

export const motion = {
  sheetSpring: { damping: 18, stiffness: 180, mass: 0.9 },
  quickFadeMs: 150,
  countUpMs: 600,
};
