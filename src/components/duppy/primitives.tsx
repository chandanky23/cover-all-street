import { Pressable, StyleSheet, Text, View } from 'react-native';

import { brand, radius, space, touchTarget, type } from '@/constants/duppyTheme';

export function DuppyButton({
  label,
  onPress,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.button,
        { backgroundColor: isPrimary ? brand.forest : brand.cream, borderWidth: isPrimary ? 0 : 1.5, borderColor: brand.forest },
      ]}>
      <Text style={[styles.buttonLabel, { color: isPrimary ? brand.cream : brand.forest }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.chip, { backgroundColor: active ? brand.forest : brand.cream, borderColor: brand.forest }]}>
      <Text style={[styles.chipLabel, { color: active ? brand.cream : brand.forest }]}>{label}</Text>
    </Pressable>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonLabel: { ...type.label, fontSize: 16 },
  chip: {
    minHeight: 36,
    borderRadius: radius.chip,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  chipLabel: type.label,
  heading: { ...type.heading, color: brand.forest, marginBottom: space.xs },
  card: {
    backgroundColor: brand.cream,
    borderRadius: radius.card,
    padding: space.md,
    gap: space.xs,
  },
});
