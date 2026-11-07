import { heatmapDefaults } from '@/constants/duppyTheme';

// Pure classification + validation module (plan.md V5-A: "Define interval
// semantics explicitly in one shared pure classification module and test
// exact boundary values"). Phase 1: types + validation only; persistence
// and real aggregate wiring land in Phase 4.

export type HeatmapMetric = 'visits' | 'coverage';
export type PalettePreset = 'duppyGarden' | 'lavenderDream' | 'forestWalk' | 'highContrast' | 'custom';

export type VisitBandKey = 'zero' | 'one' | 'twoToFour' | 'fiveToNine' | 'tenPlus';
export type CoverageBandKey = 'zero' | 'upTo25' | 'upTo50' | 'upTo75' | 'upTo100';

export type VisitThresholds = {
  // boundaries are the inclusive upper edge of 'one' / 'twoToFour' / 'fiveToNine';
  // zero is always exactly 0, tenPlus is always open-ended above fiveToNineMax.
  oneMax: number; // always 1 (fixed single-traversal band) but kept explicit
  twoToFourMax: number; // default 4
  fiveToNineMax: number; // default 9
};

export type CoverageThresholds = {
  upTo25Max: number; // default 25
  upTo50Max: number; // default 50
  upTo75Max: number; // default 75
};

export const defaultVisitThresholds: VisitThresholds = { oneMax: 1, twoToFourMax: 4, fiveToNineMax: 9 };
export const defaultCoverageThresholds: CoverageThresholds = { upTo25Max: 25, upTo50Max: 50, upTo75Max: 75 };

export type HeatmapSettings = {
  metric: HeatmapMetric;
  preset: PalettePreset;
  frequencyColors: Record<VisitBandKey, string>;
  coverageColors: Record<CoverageBandKey, string>;
  visitThresholds: VisitThresholds;
  coverageThresholds: CoverageThresholds;
};

export const defaultHeatmapSettings: HeatmapSettings = {
  metric: 'visits',
  preset: 'duppyGarden',
  frequencyColors: { ...heatmapDefaults.visits },
  coverageColors: { ...heatmapDefaults.coverage },
  visitThresholds: defaultVisitThresholds,
  coverageThresholds: defaultCoverageThresholds,
};

export function classifyVisits(traversals: number, t: VisitThresholds = defaultVisitThresholds): VisitBandKey {
  if (traversals <= 0) return 'zero';
  if (traversals <= t.oneMax) return 'one';
  if (traversals <= t.twoToFourMax) return 'twoToFour';
  if (traversals <= t.fiveToNineMax) return 'fiveToNine';
  return 'tenPlus';
}

export function classifyCoverage(pct: number, t: CoverageThresholds = defaultCoverageThresholds): CoverageBandKey {
  if (pct <= 0) return 'zero';
  if (pct <= t.upTo25Max) return 'upTo25';
  if (pct <= t.upTo50Max) return 'upTo50';
  if (pct <= t.upTo75Max) return 'upTo75';
  return 'upTo100';
}

export type ValidationResult = { valid: true } | { valid: false; message: string };

// "contiguous/ordered/exhaustive... no overlaps/gaps" (plan.md V5-A).
export function validateVisitThresholds(t: VisitThresholds): ValidationResult {
  if (!Number.isInteger(t.oneMax) || !Number.isInteger(t.twoToFourMax) || !Number.isInteger(t.fiveToNineMax)) {
    return { valid: false, message: 'Visit thresholds must be whole numbers.' };
  }
  if (t.oneMax < 1) return { valid: false, message: 'The "one" band must include at least 1 traversal.' };
  if (t.twoToFourMax <= t.oneMax) return { valid: false, message: 'Each boundary must be strictly greater than the last.' };
  if (t.fiveToNineMax <= t.twoToFourMax) return { valid: false, message: 'Each boundary must be strictly greater than the last.' };
  return { valid: true };
}

export function validateCoverageThresholds(t: CoverageThresholds): ValidationResult {
  if (t.upTo25Max <= 0 || t.upTo25Max > 100) return { valid: false, message: 'Coverage boundaries must be between 0 and 100.' };
  if (t.upTo50Max <= t.upTo25Max || t.upTo50Max > 100) return { valid: false, message: 'Each boundary must be strictly greater than the last, up to 100.' };
  if (t.upTo75Max <= t.upTo50Max || t.upTo75Max >= 100) return { valid: false, message: 'The last editable boundary must stay below 100.' };
  return { valid: true };
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export function isValidHex(hex: string): boolean {
  return HEX_RE.test(hex);
}

// Curated, named swatches for the tap-to-pick color picker (V5-B: "Tap a
// swatch to open a small colour picker with preset swatches plus optional
// HEX input" — people shouldn't need to know what a hex code is to
// customize their map). Spans the brand palette plus enough variety for
// real choice without becoming an overwhelming full color wheel.
export const namedSwatches: { hex: string; name: string }[] = [
  { hex: '#C8CBC4', name: 'Soft grey' },
  { hex: '#DCC6ED', name: 'Light lavender' },
  { hex: '#B9A0D8', name: 'Lavender' },
  { hex: '#8FA994', name: 'Sage' },
  { hex: '#405E50', name: 'Forest' },
  { hex: '#F0D8D9', name: 'Blush' },
  { hex: '#FFF7E9', name: 'Cream' },
  { hex: '#E8B04B', name: 'Honey' },
  { hex: '#D97757', name: 'Terracotta' },
  { hex: '#6B4E8E', name: 'Plum' },
  { hex: '#4A7B8C', name: 'Dusty teal' },
  { hex: '#2E4F3B', name: 'Deep green' },
];

export const palettePresets: Record<Exclude<PalettePreset, 'custom'>, HeatmapSettings['frequencyColors']> = {
  duppyGarden: { ...heatmapDefaults.visits },
  lavenderDream: { zero: '#C8CBC4', one: '#EAD9F7', twoToFour: '#D3B8EE', fiveToNine: '#B9A0D8', tenPlus: '#6B4E8E' },
  forestWalk: { zero: '#C8CBC4', one: '#CFE3D6', twoToFour: '#9FC4AE', fiveToNine: '#5E9272', tenPlus: '#2E4F3B' },
  highContrast: { zero: '#D9D9D9', one: '#FFD166', twoToFour: '#EF476F', fiveToNine: '#118AB2', tenPlus: '#073B4C' },
};
