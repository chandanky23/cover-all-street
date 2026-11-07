import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { brand, space, type } from '@/constants/duppyTheme';
import { getActiveDays } from '@/lib/db';
import { ExplorationFilter, FilterPreset, formatDayKey } from '@/lib/explorationFilter';

import { Chip, DuppyButton } from './primitives';
import { Sheet } from './Sheet';

const presets: { preset: FilterPreset; label: string }[] = [
  { preset: 'allTime', label: 'All time' },
  { preset: 'today', label: 'Today' },
  { preset: 'yesterday', label: 'Yesterday' },
  { preset: 'last7Days', label: 'Last 7 days' },
];

const weekdays: { preset: FilterPreset; label: string }[] = [
  { preset: 'weekday:mon', label: 'Mon' },
  { preset: 'weekday:tue', label: 'Tue' },
  { preset: 'weekday:wed', label: 'Wed' },
  { preset: 'weekday:thu', label: 'Thu' },
  { preset: 'weekday:fri', label: 'Fri' },
  { preset: 'weekday:sat', label: 'Sat' },
  { preset: 'weekday:sun', label: 'Sun' },
];

export function FilterSheet({
  visible,
  filter,
  onDismiss,
  onApply,
}: {
  visible: boolean;
  filter: ExplorationFilter;
  onDismiss: () => void;
  onApply: (f: ExplorationFilter) => void;
}) {
  const [days, setDays] = useState<string[]>([]);
  useEffect(() => {
    if (visible) getActiveDays().then(setDays);
  }, [visible]);

  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      <Text style={styles.title}>Time filter</Text>
      <Text style={styles.subtitle}>Map, legend, street details and Insights all update together.</Text>

      <Text style={styles.sectionLabel}>Presets</Text>
      <View style={styles.chipRow}>
        {presets.map((p) => (
          <Chip key={p.preset} label={p.label} active={filter.preset === p.preset} onPress={() => onApply({ preset: p.preset, label: p.label })} />
        ))}
      </View>

      <Text style={styles.sectionLabel}>A specific day you walked</Text>
      {days.length === 0 ? (
        <Text style={styles.subtitle}>Days with recorded walks will appear here.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
          {days.map((d) => (
            <Chip
              key={d}
              label={formatDayKey(d)}
              active={filter.preset === 'specificDate' && filter.date === d}
              onPress={() => onApply({ preset: 'specificDate', date: d, label: formatDayKey(d) })}
            />
          ))}
        </ScrollView>
      )}

      <Text style={styles.sectionLabel}>Every weekday</Text>
      <View style={styles.chipRow}>
        {weekdays.map((w) => (
          <Chip key={w.preset} label={w.label} active={filter.preset === w.preset} onPress={() => onApply({ preset: w.preset, label: `Every ${w.label}` })} />
        ))}
      </View>

      <View style={styles.footerRow}>
        <DuppyButton label="Reset to all time" variant="secondary" onPress={() => onApply({ preset: 'allTime', label: 'All time' })} />
        <DuppyButton label="Done" onPress={onDismiss} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: brand.forest },
  subtitle: { ...type.caption, color: brand.forest, opacity: 0.7, marginBottom: space.sm },
  sectionLabel: { ...type.label, color: brand.forest, marginTop: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.xs },
  dayRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, paddingRight: 16 },
  footerRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
});
