import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { brand, radius, space, type } from '@/constants/duppyTheme';
import type { HeatmapSettings } from '@/lib/heatmapSettings';

export function Legend({ settings }: { settings: HeatmapSettings }) {
  const [expanded, setExpanded] = useState(false);
  const t = settings.visitThresholds;
  const rows: { key: keyof HeatmapSettings['frequencyColors']; range: string }[] = [
    { key: 'zero', range: '0' },
    { key: 'one', range: '1' },
    { key: 'twoToFour', range: `2–${t.twoToFourMax}` },
    { key: 'fiveToNine', range: `${t.twoToFourMax + 1}–${t.fiveToNineMax}` },
    { key: 'tenPlus', range: `${t.fiveToNineMax + 1}+` },
  ];
  const colors = settings.frequencyColors;
  const ct = settings.coverageThresholds;
  const cc = settings.coverageColors;
  const districtRows: { key: keyof typeof cc; range: string }[] = [
    { key: 'zero', range: '0%' },
    { key: 'upTo25', range: `up to ${ct.upTo25Max}%` },
    { key: 'upTo50', range: `up to ${ct.upTo50Max}%` },
    { key: 'upTo75', range: `up to ${ct.upTo75Max}%` },
    { key: 'upTo100', range: 'more' },
  ];
  return (
    <Pressable style={styles.container} onPress={() => setExpanded((e) => !e)} accessibilityRole="button" accessibilityLabel="Colour legend, tap to expand or collapse">
      <Text style={styles.title}>Visit frequency</Text>
      {expanded ? (
        [...rows.map((r) => (
          <View key={r.key} style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: colors[r.key] }]} />
            <Text style={styles.rowLabel}>
              {r.range} {r.range === '1' ? 'pass' : 'passes'}
            </Text>
          </View>
        )),
        <Text key="dt" style={[styles.title, { marginTop: 6 }]}>
          District coverage
        </Text>,
        ...districtRows.map((r) => (
          <View key={`d-${r.key}`} style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: cc[r.key] }]} />
            <Text style={styles.rowLabel}>{r.range}</Text>
          </View>
        ))]
      ) : (
        <View style={styles.rowCollapsed}>
          {rows.map((r) => (
            <View key={r.key} style={[styles.swatchSmall, { backgroundColor: colors[r.key] }]} />
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: brand.cream,
    borderRadius: radius.card,
    padding: space.sm,
    gap: 4,
  },
  title: { ...type.caption, fontFamily: 'Quicksand-Bold', color: brand.forest },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rowLabel: { ...type.caption, color: brand.forest },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  rowCollapsed: { flexDirection: 'row', gap: 4 },
  swatchSmall: { width: 12, height: 12, borderRadius: 6 },
});
