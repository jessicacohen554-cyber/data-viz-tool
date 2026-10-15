/**
 * Typed palette validation (docs/PALETTES.md §5) over the ported validator
 * `scripts/validate_palette.js`. Every categorical set runs on both
 * Observatory surfaces; every ramp runs in its stepped form. The registry
 * records the output as each palette's `validation` block at load, so a
 * flag can never rot (results are re-run, never re-typed).
 * Framework-free [R-PURE].
 */
import { CVD_TARGET, NORMAL_FLOOR, oklch, validate, validateOrdinal } from '../../../scripts/validate_palette.js';

/** The two light surfaces every set is validated on: the page and cards. */
export const SURFACES: readonly string[] = ['#F8F9FC', '#FFFFFF'];

/** Categorical validation summary (§5 table columns). */
export interface CategoricalValidation {
  /** Worst adjacent OKLab ΔE×100 under protan/deutan. */
  cvdWorst: number;
  /** The pair behind `cvdWorst`. */
  cvdPair: [string, string] | null;
  /** `cvdWorst ≥ 8`: the `colorblindSafe` gate. */
  cvdPass: boolean;
  /** Worst adjacent ΔE×100 unsimulated. */
  normalWorst: number;
  normalPair: [string, string] | null;
  /** `normalWorst ≥ 15`: the hard floor. */
  normalPass: boolean;
  /** Colors outside the OKLCH L band [0.43, 0.77]. */
  offBand: string[];
  /** Colors below OKLCH C 0.10. */
  lowChroma: string[];
  /** Colors below 3:1 per surface. */
  lowContrast: Record<string, string[]>;
}

/** Stepped-ramp validation summary. */
export interface RampValidation {
  /** Lightness strictly monotone along the stepped form (each arm for diverging). */
  monotone: boolean;
  /** Smallest adjacent OKLCH ΔL. */
  minDeltaL: number;
  /** Lightest step's contrast vs the page surface, per surface. */
  lightEnd: Record<string, number>;
  /** OKLCH hue spread in degrees over chromatic steps. */
  hueSpread: number;
  /** All ordinal checks pass (hue spread skipped for multi-hue). */
  ok: boolean;
  /** `seq-observatory-heat`: shipped for parity, failures expected. */
  exempt: boolean;
}

/** The `validation` block stored on every registry palette. */
export interface PaletteValidation {
  surfaces: string[];
  categorical?: CategoricalValidation;
  ramp?: RampValidation;
}

/** Runs the categorical checks on every surface in `SURFACES`. */
export function validateCategorical(colors: readonly string[]): CategoricalValidation {
  const lowContrast: Record<string, string[]> = {};
  let first: ReturnType<typeof validate>['metrics'] | undefined;
  for (const surface of SURFACES) {
    const { metrics } = validate(colors, { mode: 'light', surface });
    first ??= metrics;
    lowContrast[surface] = metrics.lowContrast;
  }
  const m = first!;
  return {
    cvdWorst: m.cvdWorst, cvdPair: m.cvdPair, cvdPass: m.cvdWorst >= CVD_TARGET,
    normalWorst: m.normalWorst, normalPair: m.normalPair, normalPass: m.normalWorst >= NORMAL_FLOOR,
    offBand: m.offBand, lowChroma: m.lowChroma, lowContrast,
  };
}

/**
 * Runs the ordinal checks on a stepped ramp (or on each arm of a diverging
 * ramp when `arms` is given) on every surface; reports the worst.
 */
export function validateRamp(
  stepped: readonly string[],
  opts: { multiHue?: boolean; exempt?: boolean; arms?: [readonly string[], readonly string[]] } = {},
): RampValidation {
  const runs = opts.arms ?? [stepped];
  const lightEnd: Record<string, number> = {};
  let monotone = true;
  let minDeltaL = 1;
  let hueSpread = 0;
  let ok = true;
  for (const surface of SURFACES) {
    lightEnd[surface] = 99;
    for (const run of runs) {
      const r = validateOrdinal(run, { mode: 'light', surface, multiHue: opts.multiHue ?? false });
      monotone &&= r.metrics.monotone;
      minDeltaL = Math.min(minDeltaL, r.metrics.minDeltaL);
      hueSpread = Math.max(hueSpread, r.metrics.hueSpread);
      lightEnd[surface] = Math.min(lightEnd[surface]!, r.metrics.lightEndContrast);
      ok &&= r.ok;
    }
  }
  return { monotone, minDeltaL, lightEnd, hueSpread, ok, exempt: opts.exempt ?? false };
}

/** True when OKLCH lightness is strictly monotone along `colors` (either direction). */
export function isMonotoneLightness(colors: readonly string[]): boolean {
  const Ls = colors.map((c) => oklch(c)[0]);
  const inc = Ls.every((l, i) => i === 0 || l > Ls[i - 1]!);
  const dec = Ls.every((l, i) => i === 0 || l < Ls[i - 1]!);
  return inc || dec;
}
