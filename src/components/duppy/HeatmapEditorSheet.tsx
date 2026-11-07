import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { brand, radius, space, touchTarget, type } from '@/constants/duppyTheme';
import {
  CoverageBandKey,
  HeatmapSettings,
  PalettePreset,
  VisitBandKey,
  defaultHeatmapSettings,
  isValidHex,
  namedSwatches,
  palettePresets,
  validateCoverageThresholds,
  validateVisitThresholds,
} from '@/lib/heatmapSettings';

import { getSavedHeatmapSettings, saveHeatmapSettings } from '@/lib/db';
import { Chip, DuppyButton } from './primitives';
import { Sheet } from './Sheet';

const presetOrder: { preset: PalettePreset; label: string }[] = [
  { preset: 'duppyGarden', label: 'Duppy Garden' },
  { preset: 'lavenderDream', label: 'Lavender Dream' },
  { preset: 'forestWalk', label: 'Forest Walk' },
  { preset: 'highContrast', label: 'High Contrast' },
  { preset: 'custom', label: 'Custom' },
];

type Mode = 'streets' | 'districts';
type BandKey = VisitBandKey | CoverageBandKey;

const streetBands: { key: VisitBandKey; label: string }[] = [
  { key: 'zero', label: 'Not walked (fixed)' },
  { key: 'one', label: '1 pass' },
  { key: 'twoToFour', label: 'Up to' },
  { key: 'fiveToNine', label: 'Up to' },
  { key: 'tenPlus', label: 'More (open-ended)' },
];

const districtBands: { key: CoverageBandKey; label: string }[] = [
  { key: 'zero', label: '0% (fixed)' },
  { key: 'upTo25', label: 'Up to' },
  { key: 'upTo50', label: 'Up to' },
  { key: 'upTo75', label: 'Up to' },
  { key: 'upTo100', label: 'More (up to 100%)' },
];

// Presets colour both views the same way, so picking one changes streets
// and districts together (plan.md: coverage mode reuses the same five).
function coverageFromFrequency(f: HeatmapSettings['frequencyColors']): HeatmapSettings['coverageColors'] {
  return { zero: f.zero, upTo25: f.one, upTo50: f.twoToFour, upTo75: f.fiveToNine, upTo100: f.tenPlus };
}

export function HeatmapEditorSheet({
  visible,
  onDismiss,
  onSaved,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSaved?: () => void;
}) {
  const d = defaultHeatmapSettings;
  const [mode, setMode] = useState<Mode>('streets');
  const [settings, setSettings] = useState<HeatmapSettings>(d);
  const [t1, setT1] = useState(String(d.visitThresholds.twoToFourMax));
  const [t2, setT2] = useState(String(d.visitThresholds.fiveToNineMax));
  const [c1, setC1] = useState(String(d.coverageThresholds.upTo25Max));
  const [c2, setC2] = useState(String(d.coverageThresholds.upTo50Max));
  const [c3, setC3] = useState(String(d.coverageThresholds.upTo75Max));
  const [editingBand, setEditingBand] = useState<BandKey | null>(null);
  const [customHexOpen, setCustomHexOpen] = useState(false);
  const [customHexText, setCustomHexText] = useState('');

  function loadInto(saved: HeatmapSettings) {
    setSettings(saved);
    setT1(String(saved.visitThresholds.twoToFourMax));
    setT2(String(saved.visitThresholds.fiveToNineMax));
    setC1(String(saved.coverageThresholds.upTo25Max));
    setC2(String(saved.coverageThresholds.upTo50Max));
    setC3(String(saved.coverageThresholds.upTo75Max));
  }

  // Load what the user last saved each time the sheet opens, so the
  // editor always starts from the colours actually on the map.
  useEffect(() => {
    if (!visible) return;
    setEditingBand(null);
    getSavedHeatmapSettings().then(loadInto);
  }, [visible]);

  const visitThresholds = useMemo(
    () => ({ oneMax: settings.visitThresholds.oneMax, twoToFourMax: Number(t1), fiveToNineMax: Number(t2) }),
    [settings.visitThresholds.oneMax, t1, t2]
  );
  const coverageThresholds = useMemo(
    () => ({ upTo25Max: Number(c1), upTo50Max: Number(c2), upTo75Max: Number(c3) }),
    [c1, c2, c3]
  );
  const validation = mode === 'streets' ? validateVisitThresholds(visitThresholds) : validateCoverageThresholds(coverageThresholds);

  const colors: Record<string, string> = mode === 'streets' ? settings.frequencyColors : settings.coverageColors;
  const bands: { key: BandKey; label: string }[] = mode === 'streets' ? streetBands : districtBands;
  const inputs: Record<string, [string, (v: string) => void, string]> =
    mode === 'streets'
      ? { twoToFour: [t1, setT1, ''], fiveToNine: [t2, setT2, ''] }
      : { upTo25: [c1, setC1, '%'], upTo50: [c2, setC2, '%'], upTo75: [c3, setC3, '%'] };

  function applyPreset(preset: PalettePreset) {
    if (preset === 'custom') {
      setSettings((s) => ({ ...s, preset }));
      return;
    }
    const f = { ...palettePresets[preset] };
    setSettings((s) => ({ ...s, preset, frequencyColors: f, coverageColors: coverageFromFrequency(f) }));
  }

  function setColor(key: BandKey, hex: string) {
    setSettings((s) =>
      mode === 'streets'
        ? { ...s, preset: 'custom', frequencyColors: { ...s.frequencyColors, [key]: hex } }
        : { ...s, preset: 'custom', coverageColors: { ...s.coverageColors, [key]: hex } }
    );
  }

  function toggleEditing(key: BandKey) {
    const opening = editingBand !== key;
    setEditingBand(opening ? key : null);
    setCustomHexOpen(false);
    setCustomHexText(opening ? colors[key] : '');
  }

  function pickSwatch(key: BandKey, hex: string) {
    setColor(key, hex);
    setEditingBand(null);
    setCustomHexOpen(false);
  }

  function applyCustomHex(key: BandKey) {
    if (!isValidHex(customHexText)) return;
    setColor(key, customHexText);
    setEditingBand(null);
    setCustomHexOpen(false);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setEditingBand(null);
    setCustomHexOpen(false);
  }

  async function save() {
    // Both sets of boundaries must be valid, whichever tab is showing.
    if (!validateVisitThresholds(visitThresholds).valid || !validateCoverageThresholds(coverageThresholds).valid) {
      return;
    }
    await saveHeatmapSettings({ ...settings, visitThresholds, coverageThresholds });
    onSaved?.();
    onDismiss();
  }

  function resetToDefaults() {
    loadInto(defaultHeatmapSettings);
    setEditingBand(null);
    setCustomHexOpen(false);
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      <Text style={styles.title}>Customize colours</Text>
      <View style={styles.modeRow}>
        <Chip label="Streets" active={mode === 'streets'} onPress={() => switchMode('streets')} />
        <Chip label="Districts" active={mode === 'districts'} onPress={() => switchMode('districts')} />
      </View>
      <Text style={styles.helperText}>
        {mode === 'streets'
          ? 'Walked streets are coloured by how many times you passed along them.'
          : 'Districts and neighbourhoods are coloured by how much of their streets you have walked.'}
      </Text>

      <Text style={styles.sectionLabel}>Preset</Text>
      <View style={styles.chipRow}>
        {presetOrder.map((p) => (
          <Chip key={p.preset} label={p.label} active={settings.preset === p.preset} onPress={() => applyPreset(p.preset)} />
        ))}
      </View>

      <Text style={styles.sectionLabel}>{mode === 'streets' ? 'Pass bands' : 'Coverage bands'}</Text>
      <Text style={styles.helperText}>Tap a colour to change it.</Text>
      {bands.map((b) => {
        const input = inputs[b.key];
        return (
          <View key={b.key}>
            <View style={styles.bandRow}>
              <Pressable
                style={styles.bandTapArea}
                onPress={() => toggleEditing(b.key)}
                accessibilityRole="button"
                accessibilityLabel={`Change colour for band ${b.label}`}>
                <View style={[styles.swatch, { backgroundColor: colors[b.key] }]} />
                <Text style={styles.bandLabel}>{b.label}</Text>
                <Text style={styles.chevron}>{editingBand === b.key ? '▲' : '▼'}</Text>
              </Pressable>
              {input && (
                <>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={input[0]}
                    onChangeText={input[1]}
                    accessibilityLabel={`Upper boundary for ${b.key}`}
                  />
                  {input[2] !== '' && <Text style={styles.bandLabel}>{input[2]}</Text>}
                </>
              )}
            </View>

            {editingBand === b.key && (
              <View style={styles.pickerPanel}>
                <View style={styles.swatchGrid}>
                  {namedSwatches.map((s) => {
                    const selected = colors[b.key].toLowerCase() === s.hex.toLowerCase();
                    return (
                      <Pressable
                        key={s.hex}
                        onPress={() => pickSwatch(b.key, s.hex)}
                        accessibilityRole="button"
                        accessibilityLabel={s.name}
                        style={[styles.gridSwatch, { backgroundColor: s.hex }, selected && styles.gridSwatchSelected]}>
                        {selected && <Text style={styles.checkmark}>✓</Text>}
                      </Pressable>
                    );
                  })}
                </View>

                {!customHexOpen ? (
                  <Pressable onPress={() => setCustomHexOpen(true)}>
                    <Text style={styles.customLink}>Or enter a custom colour code…</Text>
                  </Pressable>
                ) : (
                  <View style={styles.customRow}>
                    <View style={[styles.swatch, { backgroundColor: isValidHex(customHexText) ? customHexText : brand.unvisitedRoad }]} />
                    <TextInput
                      style={[styles.input, styles.hexInput]}
                      value={customHexText}
                      onChangeText={setCustomHexText}
                      placeholder="#RRGGBB"
                      autoCapitalize="none"
                    />
                    <DuppyButton label="Use" variant="secondary" onPress={() => applyCustomHex(b.key)} />
                  </View>
                )}
                {customHexOpen && customHexText.length > 0 && !isValidHex(customHexText) && (
                  <Text style={styles.error}>Enter a 6-digit colour code starting with #, e.g. #8FA994.</Text>
                )}
              </View>
            )}
          </View>
        );
      })}

      {!validation.valid && <Text style={styles.error}>{validation.message}</Text>}

      {/* live preview */}
      <View style={styles.previewRoad}>
        {bands.map((b) => (
          <View key={b.key} style={[styles.previewSegment, { backgroundColor: colors[b.key] }]} />
        ))}
      </View>

      <View style={styles.footerRow}>
        <DuppyButton label="Reset to defaults" variant="secondary" onPress={resetToDefaults} />
        <DuppyButton label="Save" onPress={save} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: brand.forest },
  modeRow: { flexDirection: 'row', gap: space.sm, marginVertical: space.sm },
  sectionLabel: { ...type.label, color: brand.forest, marginTop: space.sm },
  helperText: { ...type.caption, color: brand.forest, opacity: 0.7, marginBottom: space.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.xs },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
    minHeight: touchTarget,
  },
  bandTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget,
  },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: brand.unvisitedRoad },
  bandLabel: { ...type.caption, color: brand.forest, flex: 1 },
  chevron: { ...type.caption, color: brand.forest, opacity: 0.6, width: 18, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: brand.unvisitedRoad,
    borderRadius: 8,
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    minWidth: 44,
    color: brand.forest,
    textAlign: 'center',
  },
  hexInput: { minWidth: 100, textAlign: 'left' },
  error: { ...type.caption, color: '#B3261E' },
  pickerPanel: {
    backgroundColor: brand.unvisitedRoad + '33',
    borderRadius: radius.card,
    padding: space.sm,
    marginBottom: space.sm,
    gap: space.sm,
  },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  gridSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(64,94,80,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridSwatchSelected: { borderWidth: 2, borderColor: brand.forest },
  checkmark: { color: brand.cream, fontFamily: 'Quicksand-Bold', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 2 },
  customLink: { ...type.caption, color: brand.forest, textDecorationLine: 'underline' },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  previewRoad: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', marginTop: space.sm },
  previewSegment: { flex: 1 },
  footerRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
});
