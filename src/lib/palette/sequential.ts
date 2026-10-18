/**
 * Sequential ramps (docs/PALETTES.md §2.1–§2.2) and the OKLCH ⇄ sRGB math
 * every generated palette uses. Single-hue ramps are generated so they are
 * monotone in OKLCH lightness by construction (D-12); multi-hue ramps are
 * fixed stop lists. Framework-free [R-PURE]; imports nothing.
 */

/** A ramp definition before validation (the registry adds flags). */
export interface RampDef {
  id: string;
  label: string;
  /** Light → dark (sequential) or cool → mid → warm (diverging). */
  colors: string[];
  /** OKLCH hue in degrees for single-hue ramps; a descriptive hue for fixed ones. */
  hue?: string;
  tags: string[];
  /** True for viridis-class ramps: the hue-spread check is skipped. */
  multiHue: boolean;
  /** True for `seq-observatory-heat`: shipped for parity, never auto-selected, flagged. */
  exempt: boolean;
}

// ---------------------------------------------------------------------------
// OKLCH ⇄ sRGB
// ---------------------------------------------------------------------------

const s2lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin2s = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** Parses `#rrggbb` to linear RGB. Throws on malformed input. */
function hexToLinear(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a #rrggbb color: ${hex}`);
  const ch = (i: number): number => s2lin(parseInt(h.slice(i, i + 2), 16) / 255);
  return [ch(0), ch(2), ch(4)];
}

/** Linear RGB → OKLab. */
function linearToOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** OKLab → linear RGB (may leave [0, 1] when out of gamut). */
function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

/** OKLCH `[L, C, h°]` of a hex color; hue in [0, 360). */
export function hexToOklch(hex: string): [number, number, number] {
  const [L, a, b] = linearToOklab(hexToLinear(hex));
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return [L, Math.hypot(a, b), h];
}

const inGamut = (rgb: [number, number, number]): boolean => rgb.every((c) => c >= -1e-6 && c <= 1 + 1e-6);

/**
 * OKLCH → `#rrggbb`, gamut-clipped by reducing chroma (binary search) until
 * the color is inside sRGB, so lightness and hue are preserved (§2.1).
 */
export function oklchToHex(L: number, C: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  const toLin = (c: number): [number, number, number] => oklabToLinear(L, c * Math.cos(rad), c * Math.sin(rad));
  let rgb = toLin(C);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(toLin(mid))) lo = mid; else hi = mid;
    }
    rgb = toLin(lo);
  }
  const byte = (c: number): string => Math.round(Math.max(0, Math.min(1, lin2s(Math.max(0, Math.min(1, c))))) * 255).toString(16).padStart(2, '0');
  return `#${byte(rgb[0])}${byte(rgb[1])}${byte(rgb[2])}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** The seven lightness stops of a single-hue sequential ramp (§2.1), light → dark. */
export const SEQUENTIAL_STOPS_L: readonly number[] = [0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35];

/** Chroma profile `C(L) = C_max · (1 − |L − 0.60| / 0.45)` (§2.1). */
export function rampChroma(L: number, cMax: number): number {
  return Math.max(0, cMax * (1 - Math.abs(L - 0.6) / 0.45));
}

/** Generates a single-hue ramp at the given OKLCH lightness stops. */
export function makeRamp(hue: number, cMax: number, stops: readonly number[] = SEQUENTIAL_STOPS_L): string[] {
  return stops.map((L) => oklchToHex(L, rampChroma(L, cMax), hue));
}

/**
 * The stepped (discrete) form of a seven-stop single-hue ramp: stops 3–7
 * (L 0.75 → 0.35) so the lightest class clears the 2:1 light-end floor (§2.1).
 */
export function steppedForm(colors: readonly string[]): string[] {
  return colors.length === SEQUENTIAL_STOPS_L.length ? colors.slice(2) : [...colors];
}

/** Single-hue ramp specs (§2.1 table). */
export const SEQUENTIAL_SPECS: ReadonlyArray<{ id: string; label: string; hue: number; anchor: string; cMax: number }> = [
  { id: 'seq-sky', label: 'Sky', hue: 237, anchor: '#0EA5E9', cMax: 0.14 },
  { id: 'seq-indigo', label: 'Indigo', hue: 277, anchor: '#6366F1', cMax: 0.14 },
  { id: 'seq-green', label: 'Green', hue: 150, anchor: '#22C55E', cMax: 0.14 },
  { id: 'seq-amber', label: 'Amber', hue: 70, anchor: '#F59E0B', cMax: 0.14 },
  { id: 'seq-orange', label: 'Orange', hue: 56, anchor: '#E67E22', cMax: 0.14 },
  { id: 'seq-navy', label: 'Navy', hue: 265, anchor: '#1A2744', cMax: 0.08 },
  { id: 'seq-gray', label: 'Gray', hue: 262, anchor: '#6B7280', cMax: 0.02 },
  { id: 'seq-teal', label: 'Teal', hue: 185, anchor: '#26A69A', cMax: 0.12 },
  { id: 'seq-rose', label: 'Rose', hue: 10, anchor: '#E91E63', cMax: 0.14 },
];

/**
 * Single-hue family ramps (§6.2), same construction as §2.1. Neon green uses
 * `C_max` 0.22: at 0.25 the gamut-clipped L 0.75 stop falls below the 2:1
 * light-end floor on the page surface.
 */
export const FAMILY_SEQUENTIAL_SPECS: ReadonlyArray<{ id: string; label: string; hue: number; cMax: number; family: string }> = [
  { id: 'seq-earth', label: 'Earth', hue: 55, cMax: 0.10, family: 'earthy' },
  { id: 'seq-forest', label: 'Forest', hue: 145, cMax: 0.12, family: 'forest' },
  { id: 'seq-berry', label: 'Berry', hue: 345, cMax: 0.16, family: 'berry' },
  { id: 'seq-retro', label: 'Retro mustard', hue: 85, cMax: 0.12, family: 'retro' },
  { id: 'seq-corporate', label: 'Corporate blue', hue: 250, cMax: 0.10, family: 'corporate' },
  { id: 'seq-muted', label: 'Muted blue', hue: 240, cMax: 0.06, family: 'muted' },
  { id: 'seq-neon-pink', label: 'Neon pink', hue: 350, cMax: 0.25, family: 'neon' },
  { id: 'seq-neon-green', label: 'Neon green', hue: 140, cMax: 0.22, family: 'neon' },
  { id: 'seq-neon-blue', label: 'Neon blue', hue: 240, cMax: 0.25, family: 'neon' },
];

/**
 * Generated multi-hue ramp (§6.2): the seven §2.1 lightness stops with the
 * hue interpolated linearly from `hueLight` (L 0.95) to `hueDark` (L 0.35);
 * pass `hueDark` outside [0, 360) to choose the direction around the wheel
 * (e.g. 85 → −60 runs gold → red → purple). Monotone in L by construction.
 */
export function makeHueRamp(hueLight: number, hueDark: number, cMax: number, stops: readonly number[] = SEQUENTIAL_STOPS_L): string[] {
  const last = stops.length - 1;
  return stops.map((L, i) => {
    const h = (((hueLight + ((hueDark - hueLight) * i) / last) % 360) + 360) % 360;
    return oklchToHex(L, rampChroma(L, cMax), h);
  });
}

/** Multi-hue family ramps (§6.2): `hueLight` → `hueDark`. */
export const FAMILY_HUE_RAMP_SPECS: ReadonlyArray<{ id: string; label: string; hueLight: number; hueDark: number; cMax: number; family: string }> = [
  { id: 'seq-ocean', label: 'Ocean', hueLight: 190, hueDark: 262, cMax: 0.12, family: 'ocean' },
  { id: 'seq-sunset', label: 'Sunset', hueLight: 85, hueDark: -60, cMax: 0.18, family: 'sunset' },
  { id: 'seq-candy', label: 'Candy', hueLight: 100, hueDark: 350, cMax: 0.16, family: 'candy' },
  { id: 'seq-warm', label: 'Warm', hueLight: 90, hueDark: 15, cMax: 0.16, family: 'warm' },
  { id: 'seq-cool', label: 'Cool', hueLight: 180, hueDark: 300, cMax: 0.14, family: 'cool' },
];

/** Default sequential palette id (§4). */
export const DEFAULT_SEQUENTIAL = 'seq-sky';

/** Multi-hue fixed ramps (§2.2), light-first is not required: stored as listed. */
const MULTI_HUE: ReadonlyArray<{ id: string; label: string; colors: string[]; exempt: boolean; hue: string }> = [
  { id: 'viridis', label: 'Viridis', hue: 'purple→yellow', exempt: false,
    colors: ['#440154', '#443983', '#31688E', '#21918C', '#35B779', '#90D743', '#FDE725'] },
  { id: 'magma', label: 'Magma', hue: 'black→cream', exempt: false,
    colors: ['#000004', '#3B0F70', '#8C2981', '#DE4968', '#FE9F6D', '#FCFDBF'] },
  { id: 'cividis', label: 'Cividis', hue: 'navy→yellow', exempt: false,
    colors: ['#00224E', '#123570', '#3B496C', '#575D6D', '#707173', '#8A8678', '#A69D75', '#C4B56C', '#E4CF5B', '#FEE838'] },
  { id: 'seq-observatory-heat', label: 'Observatory heat', hue: 'sky→red', exempt: true,
    colors: ['#e8f3f7', '#7fc4e6', '#86c98f', '#f2d65c', '#ef8f3c', '#c0392b'] },
];

/**
 * Every sequential ramp in picker order: §2.1 single-hue, §2.2 fixed
 * multi-hue, then the §6.2 family ramps (single-hue, then generated multi-hue).
 */
export const SEQUENTIAL_DEFS: readonly RampDef[] = [
  ...SEQUENTIAL_SPECS.map((s): RampDef => ({
    id: s.id, label: s.label, colors: makeRamp(s.hue, s.cMax), hue: `${s.hue}`, tags: ['single-hue'], multiHue: false, exempt: false,
  })),
  ...MULTI_HUE.map((m): RampDef => ({
    id: m.id, label: m.label, colors: m.colors, hue: m.hue,
    tags: m.exempt ? ['multi-hue', 'non-monotone', 'parity', 'never-auto'] : ['multi-hue'],
    multiHue: true, exempt: m.exempt,
  })),
  ...FAMILY_SEQUENTIAL_SPECS.map((s): RampDef => ({
    id: s.id, label: s.label, colors: makeRamp(s.hue, s.cMax), hue: `${s.hue}`, tags: ['single-hue', 'generated'], multiHue: false, exempt: false,
  })),
  ...FAMILY_HUE_RAMP_SPECS.map((s): RampDef => ({
    id: s.id, label: s.label, colors: makeHueRamp(s.hueLight, s.hueDark, s.cMax),
    hue: `${(((s.hueLight % 360) + 360) % 360)}→${(((s.hueDark % 360) + 360) % 360)}`, tags: ['multi-hue', 'generated'], multiHue: true, exempt: false,
  })),
];
