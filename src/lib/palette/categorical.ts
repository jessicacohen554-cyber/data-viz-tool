/**
 * Categorical sets (docs/PALETTES.md §1) and the Observatory name matching
 * (§3, D-10). Hues are fixed lists in fixed order, never cycled; color
 * follows the entity (rule 7 [R-PALETTE]). Framework-free [R-PURE].
 */
import { FAMILY_CATEGORICAL_DEFS, bandSet } from './families';
import { hexToOklch, oklchToHex } from './sequential';

/** A categorical set before validation (the registry adds the validation block). */
export interface CategoricalDef {
  id: string;
  label: string;
  colors: string[];
  /** Policy flag from PALETTES.md §1: the picker shows "use with labels". */
  labelsRequired: boolean;
  tags: string[];
}

/** Observatory entity colors in slot order (§1). */
export const OBSERVATORY_COLORS: readonly string[] = [
  '#F59E0B', '#22C55E', '#0EA5E9', '#6366F1', '#6B7280', '#374151',
  '#E67E22', '#26A69A', '#10B981', '#92400E', '#D97706', '#009688',
];

/** Observatory ISO colors in slot order (§1). */
export const OBSERVATORY_ISO_COLORS: readonly string[] = [
  '#F59E0B', '#22C55E', '#0EA5E9', '#E91E63', '#9C27B0', '#F97316', '#14B8A6', '#6366F1', '#65A30D',
];

/** Color of a category beyond a set's length (`--border`); the legend shows "+k more". */
export const OVERFLOW_COLOR = '#D4D8E0';

/** The gray for `other` / `unknown` / `misc` and fossil-gas. */
export const OTHER_COLOR = '#6B7280';

/** Default categorical palette id (D-10). */
export const DEFAULT_CATEGORICAL = 'observatory';

/** Default categorical palette for `dumbbell` and `slope` (§4). */
export const PAIR_DEFAULT = 'pairs-amber-indigo';

/** The ten Observatory hues at OKLCH L 0.55, C 0.17, gamut-clipped (`bold`, §1). */
function boldSet(): string[] {
  return OBSERVATORY_COLORS.slice(0, 10).map((hex) => oklchToHex(0.55, 0.17, hexToOklch(hex)[2]));
}

/** Six neutral steps, OKLCH C 0 (`grayscale`, §1). */
function grayscaleSet(): string[] {
  return [0.86, 0.74, 0.62, 0.50, 0.38, 0.25].map((L) => oklchToHex(L, 0, 0));
}

/** Every categorical set in picker order: the §1 table, then the §6 family sets. */
export const CATEGORICAL_DEFS: readonly CategoricalDef[] = [
  { id: 'observatory', label: 'Observatory', colors: [...OBSERVATORY_COLORS], labelsRequired: true, tags: ['default', 'entity-colors'] },
  { id: 'observatory-iso', label: 'Observatory ISO', colors: [...OBSERVATORY_ISO_COLORS], labelsRequired: true, tags: ['entity-colors'] },
  { id: 'okabe-ito', label: 'Okabe–Ito', colors: ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#000000'], labelsRequired: false, tags: ['cvd-safe'] },
  { id: 'classic-10', label: 'Classic 10', colors: ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'], labelsRequired: true, tags: ['tableau'] },
  { id: 'pairs-amber-indigo', label: 'Amber / Indigo', colors: ['#F59E0B', '#6366F1'], labelsRequired: false, tags: ['pair', 'complementary'] },
  { id: 'pairs-sky-orange', label: 'Sky / Orange', colors: ['#0EA5E9', '#E67E22'], labelsRequired: false, tags: ['pair', 'complementary'] },
  { id: 'pairs-green-magenta', label: 'Green / Magenta', colors: ['#22C55E', '#E91E63'], labelsRequired: false, tags: ['pair', 'complementary'] },
  { id: 'pairs-teal-brown', label: 'Teal / Brown', colors: ['#26A69A', '#92400E'], labelsRequired: false, tags: ['pair', 'complementary'] },
  { id: 'pairs-navy-gold', label: 'Navy / Gold', colors: ['#1A2744', '#EAB308'], labelsRequired: false, tags: ['pair', 'complementary', 'navy-off-band'] },
  { id: 'pairs-purple-lime', label: 'Purple / Lime', colors: ['#9C27B0', '#65A30D'], labelsRequired: false, tags: ['pair', 'complementary'] },
  { id: 'pastel', label: 'Pastel', colors: bandSet(0.85, 0.08), labelsRequired: true, tags: ['pastel', 'generated', 'band', 'fills', 'no-thin-lines'] },
  { id: 'bold', label: 'Bold', colors: boldSet(), labelsRequired: true, tags: ['generated', 'dark-surface'] },
  { id: 'grayscale', label: 'Grayscale', colors: grayscaleSet(), labelsRequired: true, tags: ['generated', 'print'] },
  ...FAMILY_CATEGORICAL_DEFS,
];

// ---------------------------------------------------------------------------
// Observatory name matching (§3)
// ---------------------------------------------------------------------------

/** One matching rule; rules are tried in order and the first match wins. */
export interface NameRule {
  keys: readonly string[];
  color: string;
  /** Entity token the rule names (fuel, storage, ISO …). */
  token: string;
}

/** ISO colors by key (rule 13; `isone` and `iso-ne` share NEISO's color). */
export const ISO_COLORS: Readonly<Record<string, string>> = {
  caiso: '#F59E0B', ercot: '#22C55E', pjm: '#0EA5E9', nyiso: '#E91E63', neiso: '#9C27B0', isone: '#9C27B0',
  'iso-ne': '#9C27B0', miso: '#F97316', spp: '#14B8A6', soco: '#6366F1', nwpp: '#65A30D',
};

/**
 * Rules 1–12 of §3 in order. `ccs` is listed before `gas` so the longer key
 * wins over the whole-token `cc` (the "longest key wins across rows 10–11").
 */
export const OBSERVATORY_RULES: readonly NameRule[] = [
  { keys: ['offshore'], color: '#009688', token: 'offshore' },
  { keys: ['hydrogen', 'biomass'], color: '#10B981', token: 'hydrogen' },
  { keys: ['geothermal'], color: '#D97706', token: 'geothermal' },
  { keys: ['solar', 'pv'], color: '#F59E0B', token: 'solar' },
  { keys: ['wind'], color: '#22C55E', token: 'wind' },
  { keys: ['nuclear'], color: '#6366F1', token: 'nuclear' },
  { keys: ['hydro'], color: '#0EA5E9', token: 'hydro' },
  { keys: ['storage', 'battery', 'li_ion', 'bess'], color: '#E67E22', token: 'storage' },
  { keys: ['coal', 'lignite'], color: '#374151', token: 'fossil-coal' },
  { keys: ['ccs'], color: '#26A69A', token: 'ccs' },
  { keys: ['gas', 'cc', 'ct', 'ng', 'ccgt'], color: '#6B7280', token: 'fossil-gas' },
  { keys: ['oil', 'diesel'], color: '#92400E', token: 'oil' },
];

/** Literal "other" labels (§3 last row). */
const OTHER_LABELS = new Set(['other', 'unknown', 'misc']);

/** Lower-cases and splits a label into alphanumeric tokens. */
export function labelTokens(label: string): string[] {
  return label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** A matched entity: its color and the rule token (`iso` for rule 13, `other` for the gray literals). */
export interface NameMatch {
  color: string;
  token: string;
}

/**
 * Applies the §3 rules to one label. A key of ≤ 2 characters (or one with a
 * hyphen) matches a whole token only; longer keys match as substrings of the
 * lower-cased label. Returns `undefined` when nothing matches.
 */
export function matchObservatory(label: string): NameMatch | undefined {
  const lower = label.toLowerCase();
  const tokens = labelTokens(label);
  const joined = `-${tokens.join('-')}-`;
  const wholeToken = (key: string): boolean => joined.includes(`-${key.replace(/_/g, '-')}-`);
  for (const rule of OBSERVATORY_RULES) {
    for (const key of rule.keys) {
      const hit = key.length <= 2 ? wholeToken(key) : (key.includes('_') ? wholeToken(key) || lower.includes(key) : lower.includes(key));
      if (hit) return { color: rule.color, token: rule.token };
    }
  }
  for (const key of Object.keys(ISO_COLORS)) {
    if (wholeToken(key)) return { color: ISO_COLORS[key]!, token: 'iso' };
  }
  if (OTHER_LABELS.has(lower.trim())) return { color: OTHER_COLOR, token: 'other' };
  return undefined;
}

/** Share (0..1) of distinct labels that match any §3 rule. */
export function matchShare(labels: readonly string[]): number {
  if (!labels.length) return 0;
  return labels.filter((l) => matchObservatory(l) !== undefined).length / labels.length;
}

/** Share (0..1) of distinct labels that are ISO tokens (rule 13). */
export function isoShare(labels: readonly string[]): number {
  if (!labels.length) return 0;
  return labels.filter((l) => matchObservatory(l)?.token === 'iso').length / labels.length;
}

/**
 * Assigns colors to `labels` in order: matched labels take their entity
 * color (when `nameMatch`), the rest take the next unused hue of `colors`
 * in fixed order; beyond the set's length → `OVERFLOW_COLOR`. `taken` is
 * the hue → label map of earlier assignments (stable maps, §3) and is
 * extended in place.
 */
export function assignColors(
  labels: readonly string[],
  colors: readonly string[],
  nameMatch: boolean,
  assigned: Map<string, string> = new Map(),
): Map<string, string> {
  const used = new Set(assigned.values());
  const pending: string[] = [];
  for (const label of labels) {
    if (assigned.has(label)) continue;
    const m = nameMatch ? matchObservatory(label) : undefined;
    if (m) { assigned.set(label, m.color); used.add(m.color); } else pending.push(label);
  }
  let slot = 0;
  for (const label of pending) {
    while (slot < colors.length && used.has(colors[slot]!)) slot++;
    const color = slot < colors.length ? colors[slot]! : OVERFLOW_COLOR;
    assigned.set(label, color);
    if (color !== OVERFLOW_COLOR) { used.add(color); slot++; }
  }
  return assigned;
}
