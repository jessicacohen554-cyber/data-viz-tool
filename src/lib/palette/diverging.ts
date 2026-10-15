/**
 * Diverging (temperature) ramps, docs/PALETTES.md §2.3: a cool arm, a neutral
 * gray midpoint and a warm arm sharing one lightness profile, so the ramp is
 * symmetric and each arm monotone by construction (D-12). `div-observatory`
 * is the one fixed-list ramp (market-simulator LMP-delta convention).
 * Framework-free [R-PURE].
 */
import { makeRamp, oklchToHex, type RampDef } from './sequential';

/** Lightness of each arm, dark → light toward the midpoint (§2.3). */
export const DIVERGING_ARM_L: readonly number[] = [0.35, 0.50, 0.65, 0.80];

/** The neutral midpoint: OKLCH L 0.90, C 0. */
export const DIVERGING_MID_L = 0.9;

/** Default diverging palette id (§4). */
export const DEFAULT_DIVERGING = 'div-cool-warm';

/** Generates a 9-stop diverging ramp: cool dark → light, gray, warm light → dark. */
export function makeDivergingRamp(coolHue: number, coolCmax: number, warmHue: number, warmCmax: number): string[] {
  const cool = makeRamp(coolHue, coolCmax, DIVERGING_ARM_L);
  const warm = makeRamp(warmHue, warmCmax, [...DIVERGING_ARM_L].reverse());
  return [...cool, oklchToHex(DIVERGING_MID_L, 0, 0), ...warm];
}

/** Generated diverging specs (§2.3 table). */
export const DIVERGING_SPECS: ReadonlyArray<{
  id: string; label: string; cool: number; coolAnchor: string; coolCmax: number; warm: number; warmAnchor: string; warmCmax: number;
}> = [
  { id: 'div-cool-warm', label: 'Cool–Warm', cool: 237, coolAnchor: '#0EA5E9', coolCmax: 0.14, warm: 27, warmAnchor: '#DC2626', warmCmax: 0.14 },
  { id: 'div-teal-brown', label: 'Teal–Brown', cool: 185, coolAnchor: '#26A69A', coolCmax: 0.12, warm: 46, warmAnchor: '#92400E', warmCmax: 0.14 },
  { id: 'div-green-purple', label: 'Green–Purple', cool: 150, coolAnchor: '#22C55E', coolCmax: 0.14, warm: 321, warmAnchor: '#9C27B0', warmCmax: 0.14 },
  { id: 'div-sky-amber', label: 'Sky–Amber', cool: 237, coolAnchor: '#0EA5E9', coolCmax: 0.14, warm: 70, warmAnchor: '#F59E0B', warmCmax: 0.14 },
  { id: 'div-navy-gold', label: 'Navy–Gold', cool: 265, coolAnchor: '#1A2744', coolCmax: 0.08, warm: 86, warmAnchor: '#EAB308', warmCmax: 0.14 },
];

/** The fixed Observatory delta ramp (`bc-pages.css .delta-ramp`, white midpoint). */
export const DIV_OBSERVATORY: readonly string[] = ['#2166ac', '#86a9d4', '#ffffff', '#f0b27a', '#e67e22'];

/** Every diverging ramp in picker order. */
export const DIVERGING_DEFS: readonly RampDef[] = [
  ...DIVERGING_SPECS.map((s): RampDef => ({
    id: s.id, label: s.label, colors: makeDivergingRamp(s.cool, s.coolCmax, s.warm, s.warmCmax),
    hue: `${s.cool}/${s.warm}`, tags: ['temperature'], multiHue: true, exempt: false,
  })),
  { id: 'div-observatory', label: 'Observatory', colors: [...DIV_OBSERVATORY], hue: 'blue/orange', tags: ['fixed', 'white-mid', 'needs-cell-border'], multiHue: true, exempt: false },
];

/** Splits a diverging ramp into its two arms (each including the midpoint), light-first. */
export function divergingArms(colors: readonly string[]): [string[], string[]] {
  const mid = Math.floor(colors.length / 2);
  const cool = colors.slice(0, mid + 1).reverse(); // mid → cool dark
  const warm = colors.slice(mid); // mid → warm dark
  return [cool, warm];
}
