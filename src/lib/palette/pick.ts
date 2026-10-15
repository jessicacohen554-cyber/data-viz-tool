/**
 * STUB (S0) — replaced by shard S2. Signature is frozen.
 * Resolves the Color shelf to a concrete color encoding for the chart layer.
 */
import type { ChartTypeId, FieldMeta, PaletteSelection, Pill, QueryResult } from '../core/types';

export type ColorEncoding =
  | { kind: 'none'; color: string }
  | { kind: 'categorical'; paletteId: string; domain: string[]; map: Record<string, string> }
  | { kind: 'continuous'; paletteId: string; domain: [number, number]; midpoint?: number; stops: string[] };

/** Pick the encoding for the current Color pill (undefined = no pill). */
export function pickPalette(
  _colorPill: Pill | undefined,
  _meta: FieldMeta | undefined,
  _sel: PaletteSelection,
  _result: QueryResult | null,
  _chart: ChartTypeId,
): ColorEncoding {
  return { kind: 'none', color: '#0EA5E9' };
}
