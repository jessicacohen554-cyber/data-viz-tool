/**
 * Palette families v2 (docs/PALETTES.md §6; owner ruling D-18). Every family
 * categorical set is constructed in OKLCH from a stated lightness/chroma band
 * so the family reads as one system: the four *band* families (pastel, neon,
 * vibrant, muted) share one 10-hue wheel at different L/C; the *themed*
 * families list named swatches as `[name, L, C, h°]`. Swatch order is a
 * design input: it was chosen (exhaustive search, see §6) to maximise the
 * worst adjacent-pair ΔE under protan/deutan, because the validator and the
 * fixed-order assignment rule (rule 7 [R-PALETTE]) both read adjacent pairs.
 * `labelsRequired` is derived from the validator at load (a set that fails
 * either separation gate ships flagged, never silently); the monochromes are
 * flagged by policy. Framework-free [R-PURE].
 */
import type { CategoricalDef } from './categorical';
import { oklchToHex } from './sequential';
import { validateCategorical } from './validate';

/** A family row for the picker: its palettes of every kind, in picker order. */
export interface PaletteFamily {
  id: string;
  label: string;
  paletteIds: string[];
}

/** One named swatch: `[name, L, C, h°]` in OKLCH. */
export type FamilySwatch = readonly [name: string, L: number, C: number, h: number];

/** A themed family set before construction. */
export interface FamilySetSpec {
  id: string;
  label: string;
  /** Family id (`PALETTE_FAMILIES`). */
  family: string;
  /** The construction band, as printed in PALETTES.md §6 (e.g. "L 0.32–0.84, C ≤ 0.11"). */
  band: string;
  swatches: readonly FamilySwatch[];
  /** Force the flag regardless of the validator (monochromes). */
  labelsRequired?: true;
  tags?: string[];
}

/**
 * The shared hue wheel of the band families: ten OKLCH hues ≈ 36° apart,
 * ordered so adjacent slots alternate warm/cool (amber, sky, green, purple,
 * red, teal, yellow, indigo, pink, lime).
 */
export const BAND_HUES: readonly number[] = [56, 236, 164, 308, 20, 200, 92, 272, 344, 128];

/** The ten wheel hues at one OKLCH lightness and chroma, gamut-clipped. */
export function bandSet(L: number, C: number, hues: readonly number[] = BAND_HUES): string[] {
  return hues.map((h) => oklchToHex(L, C, h));
}

/** Lightness steps of a monochrome family (8 tints, dark → light). */
export const MONOCHROME_L: readonly number[] = [0.30, 0.38, 0.46, 0.54, 0.62, 0.70, 0.78, 0.86];

/** Tints of one hue with the §2.1 chroma profile, dark → light. */
export function monochromeSet(hue: number, cMax: number): string[] {
  return MONOCHROME_L.map((L) => oklchToHex(L, Math.max(0, cMax * (1 - Math.abs(L - 0.6) / 0.45)), hue));
}

/** Band families: `[id, label, L, C]`. `pastel` is built here but listed in its §1 slot by categorical.ts. */
export const BAND_SPECS: ReadonlyArray<{ id: string; label: string; L: number; C: number; band: string }> = [
  { id: 'pastel', label: 'Pastel', L: 0.85, C: 0.08, band: 'L 0.85, C 0.08' },
  { id: 'neon', label: 'Neon', L: 0.75, C: 0.25, band: 'L 0.75, C 0.25 (gamut-clipped)' },
  { id: 'vibrant', label: 'Vibrant', L: 0.62, C: 0.20, band: 'L 0.62, C 0.20 (gamut-clipped)' },
  { id: 'muted', label: 'Muted', L: 0.60, C: 0.07, band: 'L 0.60, C 0.07' },
];

/** Themed family sets (§6 tables), swatches in shipped order. */
export const THEMED_SPECS: readonly FamilySetSpec[] = [
  { id: 'earthy', label: 'Earthy', family: 'earthy', band: 'L 0.40–0.78, C ≤ 0.14', swatches: [
    ['brown', 0.48, 0.09, 55], ['clay', 0.66, 0.10, 50], ['umber', 0.40, 0.07, 65], ['olive', 0.62, 0.08, 110], ['rust', 0.50, 0.14, 35],
    ['slate', 0.55, 0.03, 250], ['sand', 0.78, 0.07, 85], ['terracotta', 0.58, 0.13, 40], ['sage', 0.70, 0.08, 120], ['moss', 0.52, 0.08, 135]] },
  { id: 'ocean', label: 'Ocean', family: 'ocean', band: 'L 0.32–0.84, C ≤ 0.11', swatches: [
    ['navy', 0.32, 0.09, 262], ['teal', 0.58, 0.11, 195], ['foam', 0.80, 0.08, 180], ['deep blue', 0.50, 0.10, 215], ['aqua', 0.72, 0.10, 190],
    ['marine', 0.42, 0.08, 240], ['driftwood', 0.70, 0.05, 80], ['sea green', 0.52, 0.10, 175], ['sand', 0.84, 0.06, 90], ['blue', 0.62, 0.09, 230]] },
  { id: 'sunset', label: 'Sunset', family: 'sunset', band: 'L 0.36–0.88, C 0.09–0.20', swatches: [
    ['purple', 0.42, 0.14, 300], ['orange', 0.70, 0.17, 60], ['violet', 0.48, 0.16, 320], ['gold', 0.82, 0.14, 85], ['magenta', 0.55, 0.20, 345],
    ['apricot', 0.76, 0.15, 70], ['dusk', 0.36, 0.11, 290], ['red-orange', 0.62, 0.19, 35], ['pale gold', 0.88, 0.09, 90], ['coral', 0.66, 0.17, 10]] },
  { id: 'forest', label: 'Forest', family: 'forest', band: 'L 0.32–0.80, C ≤ 0.13', swatches: [
    ['deep green', 0.38, 0.09, 150], ['fern', 0.62, 0.12, 130], ['shade', 0.32, 0.05, 140], ['wood', 0.58, 0.07, 75], ['pale lichen', 0.80, 0.07, 125],
    ['bark', 0.46, 0.06, 60], ['leaf', 0.68, 0.13, 140], ['pine', 0.44, 0.11, 160], ['lichen', 0.72, 0.09, 115], ['moss', 0.52, 0.10, 145]] },
  { id: 'berry', label: 'Berry', family: 'berry', band: 'L 0.34–0.80, C 0.08–0.20', swatches: [
    ['plum', 0.42, 0.13, 330], ['raspberry', 0.62, 0.20, 10], ['damson', 0.40, 0.14, 350], ['redcurrant', 0.68, 0.16, 25], ['blackberry', 0.34, 0.10, 300],
    ['cranberry', 0.48, 0.17, 20], ['rose', 0.74, 0.12, 355], ['mulberry', 0.55, 0.19, 345], ['blush', 0.80, 0.08, 340], ['grape', 0.58, 0.12, 315]] },
  { id: 'candy', label: 'Candy', family: 'candy', band: 'L 0.66–0.90, C 0.09–0.20', swatches: [
    ['bright pink', 0.72, 0.20, 350], ['lemon', 0.90, 0.14, 100], ['sky', 0.78, 0.11, 230], ['peach', 0.86, 0.10, 60], ['bubblegum', 0.66, 0.18, 330],
    ['mint', 0.82, 0.12, 165], ['lavender', 0.74, 0.15, 290], ['lime', 0.84, 0.13, 135], ['cherry', 0.70, 0.17, 20], ['ice', 0.80, 0.10, 200]] },
  { id: 'retro', label: 'Retro', family: 'retro', band: 'L 0.40–0.80, C ≤ 0.17', swatches: [
    ['mustard', 0.75, 0.14, 85], ['avocado', 0.55, 0.10, 125], ['cream', 0.80, 0.06, 75], ['teal', 0.52, 0.09, 195], ['brown', 0.45, 0.08, 55],
    ['burnt orange', 0.62, 0.17, 45], ['olive', 0.40, 0.07, 140], ['rust red', 0.58, 0.16, 25], ['harvest gold', 0.68, 0.12, 100], ['denim', 0.48, 0.06, 230]] },
  { id: 'corporate', label: 'Corporate', family: 'corporate', band: 'L 0.32–0.76, C ≤ 0.14', swatches: [
    ['navy', 0.32, 0.08, 262], ['steel', 0.58, 0.04, 240], ['deep blue', 0.38, 0.11, 230], ['blue', 0.64, 0.10, 230], ['bronze', 0.66, 0.12, 65],
    ['teal', 0.46, 0.09, 200], ['light steel', 0.70, 0.04, 250], ['slate', 0.44, 0.03, 260], ['gold', 0.76, 0.14, 85], ['sea teal', 0.56, 0.10, 185]] },
  { id: 'warm', label: 'Warm', family: 'warm', band: 'hues 350°–100°, L 0.48–0.76, C 0.14–0.16', swatches: [
    ['red', 0.52, 0.16, 30], ['orange', 0.66, 0.16, 60], ['magenta', 0.48, 0.16, 350], ['tangerine', 0.56, 0.16, 45], ['amber', 0.72, 0.15, 80],
    ['crimson', 0.60, 0.16, 10], ['olive gold', 0.54, 0.14, 90], ['coral', 0.70, 0.16, 20], ['yellow', 0.76, 0.14, 100], ['apricot', 0.62, 0.15, 70]] },
  { id: 'cool', label: 'Cool', family: 'cool', band: 'hues 140°–320°, L 0.44–0.76, C 0.11–0.14', swatches: [
    ['blue', 0.52, 0.14, 240], ['aqua', 0.76, 0.11, 180], ['indigo', 0.56, 0.14, 260], ['green', 0.70, 0.13, 160], ['violet', 0.60, 0.14, 290],
    ['leaf', 0.62, 0.13, 140], ['purple', 0.48, 0.14, 320], ['teal', 0.66, 0.12, 200], ['grape', 0.44, 0.14, 300], ['sky', 0.72, 0.12, 220]] },
  { id: 'high-contrast', label: 'High contrast', family: 'high-contrast', band: 'L 0.44–0.76 alternating, C 0.14–0.20', tags: ['cvd-safe'], swatches: [
    ['blue', 0.45, 0.20, 262], ['orange', 0.72, 0.18, 65], ['purple', 0.52, 0.20, 330], ['yellow', 0.76, 0.15, 95],
    ['green', 0.44, 0.14, 150], ['pink', 0.76, 0.16, 345], ['red', 0.45, 0.20, 25], ['sky', 0.60, 0.16, 220]] },
];

/** Monochrome families: `[id, label, hue, C_max]`. */
export const MONOCHROME_SPECS: ReadonlyArray<{ id: string; label: string; hue: number; cMax: number }> = [
  { id: 'monochrome-navy', label: 'Monochrome navy', hue: 262, cMax: 0.10 },
  { id: 'monochrome-teal', label: 'Monochrome teal', hue: 190, cMax: 0.12 },
];

/** Hex swatches of a themed spec, in shipped order. */
export function themedColors(spec: FamilySetSpec): string[] {
  return spec.swatches.map(([, L, C, h]) => oklchToHex(L, C, h));
}

/** Wraps generated colors in a `CategoricalDef`, deriving `labelsRequired` from the validator unless forced. */
function toDef(id: string, label: string, family: string, colors: string[], forced: boolean, tags: string[]): CategoricalDef {
  const v = validateCategorical(colors);
  const labelsRequired = forced || !(v.cvdPass && v.normalPass);
  return { id, label, colors, labelsRequired, tags: [family, 'generated', ...tags] };
}

/**
 * Every v2 family categorical set in picker order: neon, vibrant, muted
 * (pastel keeps its §1 slot), the themed sets, then the monochromes.
 */
export const FAMILY_CATEGORICAL_DEFS: readonly CategoricalDef[] = [
  ...BAND_SPECS.filter((b) => b.id !== 'pastel').map((b) => toDef(b.id, b.label, b.id, bandSet(b.L, b.C), false, ['band'])),
  ...THEMED_SPECS.map((s) => toDef(s.id, s.label, s.family, themedColors(s), s.labelsRequired === true, s.tags ?? [])),
  ...MONOCHROME_SPECS.map((m) => toDef(m.id, m.label, 'monochrome', monochromeSet(m.hue, m.cMax), true, ['single-hue', 'tints'])),
];

/**
 * Families as picker rows. Every registry id appears in exactly one family
 * (`registry.test.ts`); the v1 palettes group under `observatory`, `classic`
 * and `pairs`.
 */
export const PALETTE_FAMILIES: readonly PaletteFamily[] = [
  { id: 'observatory', label: 'Observatory', paletteIds: ['observatory', 'observatory-iso', 'bold',
    'seq-sky', 'seq-indigo', 'seq-green', 'seq-amber', 'seq-orange', 'seq-navy', 'seq-gray', 'seq-teal', 'seq-rose', 'seq-observatory-heat',
    'div-cool-warm', 'div-observatory', 'div-teal-brown', 'div-green-purple', 'div-sky-amber', 'div-navy-gold'] },
  { id: 'classic', label: 'Classic', paletteIds: ['okabe-ito', 'classic-10', 'viridis', 'magma', 'cividis'] },
  { id: 'pairs', label: 'Pairs', paletteIds: ['pairs-amber-indigo', 'pairs-sky-orange', 'pairs-green-magenta', 'pairs-teal-brown', 'pairs-navy-gold', 'pairs-purple-lime'] },
  { id: 'pastel', label: 'Pastel', paletteIds: ['pastel'] },
  { id: 'neon', label: 'Neon', paletteIds: ['neon', 'seq-neon-pink', 'seq-neon-green', 'seq-neon-blue', 'div-neon'] },
  { id: 'vibrant', label: 'Vibrant', paletteIds: ['vibrant'] },
  { id: 'muted', label: 'Muted', paletteIds: ['muted', 'seq-muted', 'div-muted'] },
  { id: 'earthy', label: 'Earthy', paletteIds: ['earthy', 'seq-earth', 'div-earth-ocean'] },
  { id: 'ocean', label: 'Ocean', paletteIds: ['ocean', 'seq-ocean'] },
  { id: 'sunset', label: 'Sunset', paletteIds: ['sunset', 'seq-sunset', 'div-sunset'] },
  { id: 'forest', label: 'Forest', paletteIds: ['forest', 'seq-forest'] },
  { id: 'berry', label: 'Berry', paletteIds: ['berry', 'seq-berry', 'div-berry-forest'] },
  { id: 'candy', label: 'Candy', paletteIds: ['candy', 'seq-candy'] },
  { id: 'retro', label: 'Retro', paletteIds: ['retro', 'seq-retro'] },
  { id: 'corporate', label: 'Corporate', paletteIds: ['corporate', 'seq-corporate'] },
  { id: 'warm', label: 'Warm', paletteIds: ['warm', 'seq-warm'] },
  { id: 'cool', label: 'Cool', paletteIds: ['cool', 'seq-cool'] },
  { id: 'monochrome', label: 'Monochrome', paletteIds: ['monochrome-navy', 'monochrome-teal'] },
  { id: 'grayscale', label: 'Grayscale', paletteIds: ['grayscale'] },
  { id: 'high-contrast', label: 'High contrast', paletteIds: ['high-contrast'] },
];

const FAMILY_BY_PALETTE: ReadonlyMap<string, string> = new Map(
  PALETTE_FAMILIES.flatMap((f) => f.paletteIds.map((id): [string, string] => [id, f.id])),
);

/** Family id of a palette id; undefined when the id is in no family. */
export function familyOf(paletteId: string): string | undefined {
  return FAMILY_BY_PALETTE.get(paletteId);
}
