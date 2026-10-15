/**
 * Type declarations for `validate_palette.js` so `src/lib/palette/validate.ts`
 * and Vitest import the validator with types (the project has `allowJs: false`).
 */

export type ValidatorMode = 'light' | 'dark';
export type CvdKind = 'protan' | 'deutan' | 'tritan';
export type ReportState = boolean | 'pass' | 'floor' | 'fail' | 'relief';
export type ReportRow = [name: string, state: ReportState, detail: string];

export interface CategoricalMetrics {
  cvdWorst: number;
  cvdPair: [string, string] | null;
  cvdKind: CvdKind | null;
  tritanWorst: number;
  normalWorst: number;
  normalPair: [string, string] | null;
  offBand: string[];
  lowChroma: string[];
  lowContrast: string[];
  surface: string;
}

export interface OrdinalMetrics {
  monotone: boolean;
  minDeltaL: number;
  lightEndContrast: number;
  hueSpread: number;
  surface: string;
}

export const BAND: Record<ValidatorMode, [number, number]>;
export const CHROMA_FLOOR: number;
export const CVD_TARGET: number;
export const CVD_FLOOR: number;
export const NORMAL_FLOOR: number;
export const CONTRAST_MIN: number;
export const DEFAULT_SURFACE: Record<ValidatorMode, string>;
export const ORDINAL_MIN_DL: number;
export const ORDINAL_LIGHT_FLOOR: number;
export const ORDINAL_HUE_SPREAD: number;

export function splitColors(raw: string | null | undefined): string[];
export function isHexColor(v: string): boolean;
export function contrast(a: string, b: string): number;
export function oklab(hex: string): [number, number, number];
export function oklch(hex: string): [number, number, number];
export function deltaE(h1: string, h2: string, kind?: CvdKind): number;

export function validate(
  palette: readonly string[],
  opts?: { mode?: ValidatorMode; surface?: string; pairs?: 'adjacent' | 'all' },
): { report: ReportRow[]; ok: boolean; metrics: CategoricalMetrics };

export function validateOrdinal(
  palette: readonly string[],
  opts?: { mode?: ValidatorMode; surface?: string; multiHue?: boolean },
): { report: ReportRow[]; ok: boolean; metrics: OrdinalMetrics };
