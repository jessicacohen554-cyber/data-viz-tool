/**
 * Resolves the Color shelf to a concrete color encoding for the chart layer
 * (docs/PALETTES.md §4). Signature of `pickPalette` and the `ColorEncoding`
 * shape are frozen (S0 stub). Framework-free [R-PURE].
 *
 * **Stable maps.** The label → color map of a discrete field is memoised per
 * field and palette (`colorMemo`): a label keeps its hue when the domain
 * shrinks under a filter and new labels take the next unused hue (rule 7).
 * The memo is a derived cache, not viz state; `PaletteSelection.overrides`
 * is where a user's edits persist. `resetColorMemo()` clears it (tests, or
 * when a dataset is unloaded).
 */
import type { ChartTypeId, FieldMeta, PaletteSelection, Pill, QueryResult } from '../core/types';
import { DEFAULT_CATEGORICAL, PAIR_DEFAULT, assignColors, isoShare, matchShare } from './categorical';
import { DEFAULT_DIVERGING } from './diverging';
import { getPalette, type Palette } from './registry';
import { DEFAULT_SEQUENTIAL } from './sequential';

export type ColorEncoding =
  | { kind: 'none'; color: string }
  | { kind: 'categorical'; paletteId: string; domain: string[]; map: Record<string, string> }
  | { kind: 'continuous'; paletteId: string; domain: [number, number]; midpoint?: number; stops: string[] };

/** Single-mark color when nothing is on Color: Observatory sky (`--hydro`). */
export const DEFAULT_SINGLE_COLOR = '#0EA5E9';

/** Share of a field's distinct values that must match a §3 rule for auto-mapping to engage. */
export const NAME_MATCH_THRESHOLD = 0.5;

/** Charts whose discrete default is the complementary pair (§4). */
const PAIR_CHARTS: ReadonlySet<ChartTypeId> = new Set<ChartTypeId>(['dumbbell', 'slope']);

const colorMemo = new Map<string, Map<string, string>>();

/** Clears the stable label → color memo. */
export function resetColorMemo(): void {
  colorMemo.clear();
}

/** Identity of a field across calls (name alone would collide across datasets). */
function fieldKey(meta: FieldMeta | undefined, pill: Pill): string {
  return meta ? `${meta.name}|${meta.index}|${meta.rowCount}|${meta.cardinality}` : pill.field;
}

/** Distinct labels of the Color pill in the result (or the field's top values when no result). */
function discreteDomain(pill: Pill, meta: FieldMeta | undefined, result: QueryResult | null): string[] {
  const dim = result?.dims.find((d) => d.key === pill.id);
  if (dim?.kind === 'codes' && dim.labels) {
    if (!dim.codes) return [...dim.labels];
    const seen = new Set<number>();
    const out: string[] = [];
    for (const c of dim.codes) if (c >= 0 && !seen.has(c)) { seen.add(c); const l = dim.labels[c]; if (l !== undefined) out.push(l); }
    return out;
  }
  if (dim?.kind === 'values' && dim.values) {
    const seen = new Set<string>();
    for (const v of dim.values) if (!Number.isNaN(v)) seen.add(String(v));
    return [...seen];
  }
  const measure = result?.measures.find((m) => m.key === pill.id);
  if (measure) {
    const seen = new Set<string>();
    for (const v of measure.values) if (!Number.isNaN(v)) seen.add(String(v));
    return [...seen];
  }
  return meta ? meta.topValues.map(([label]) => label) : [];
}

/** Finite values of the Color pill in the result (measure, or a continuous dim). */
function continuousValues(pill: Pill, result: QueryResult | null): Float64Array | null {
  const m = result?.measures.find((x) => x.key === pill.id);
  if (m) return m.values;
  const d = result?.dims.find((x) => x.key === pill.id);
  return d?.kind === 'values' && d.values ? d.values : null;
}

function stats(values: Float64Array | null): { min: number; max: number; mean: number; median: number } | null {
  if (!values) return null;
  const finite: number[] = [];
  for (const v of values) if (Number.isFinite(v)) finite.push(v);
  if (!finite.length) return null;
  finite.sort((a, b) => a - b);
  const n = finite.length;
  const sum = finite.reduce((a, b) => a + b, 0);
  const median = n % 2 ? finite[(n - 1) / 2]! : (finite[n / 2 - 1]! + finite[n / 2]!) / 2;
  return { min: finite[0]!, max: finite[n - 1]!, mean: sum / n, median };
}

function resolveById(id: string | undefined, kind: Palette['kind'], fallback: string): Palette {
  const p = id ? getPalette(id) : undefined;
  return p && p.kind === kind ? p : getPalette(fallback)!;
}

function pickCategorical(pill: Pill, meta: FieldMeta | undefined, sel: PaletteSelection, result: QueryResult | null, chart: ChartTypeId): ColorEncoding {
  const domain = discreteDomain(pill, meta, result);
  const defaultId = PAIR_CHARTS.has(chart) ? PAIR_DEFAULT : DEFAULT_CATEGORICAL;
  let palette = sel.mode === 'manual' ? resolveById(sel.categorical, 'categorical', defaultId) : getPalette(defaultId)!;

  // §3: in auto mode, ISO-looking fields switch to the ISO set; name matching engages at ≥ 50 % matches.
  let nameMatch = false;
  if (sel.mode === 'auto' && palette.id === DEFAULT_CATEGORICAL) {
    if (isoShare(domain) >= NAME_MATCH_THRESHOLD) palette = getPalette('observatory-iso')!;
    nameMatch = matchShare(domain) >= NAME_MATCH_THRESHOLD;
  } else if (sel.mode === 'auto' && palette.id === 'observatory-iso') {
    nameMatch = matchShare(domain) >= NAME_MATCH_THRESHOLD;
  }

  const key = `${fieldKey(meta, pill)}|${palette.id}|${nameMatch ? 'match' : 'order'}`;
  let memo = colorMemo.get(key);
  if (!memo) { memo = new Map(); colorMemo.set(key, memo); }
  const sorted = [...domain].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  assignColors(sorted, palette.colors, nameMatch, memo);

  const map: Record<string, string> = {};
  for (const label of domain) map[label] = sel.overrides?.[label] ?? memo.get(label)!;
  return { kind: 'categorical', paletteId: palette.id, domain, map };
}

function pickContinuous(pill: Pill, meta: FieldMeta | undefined, sel: PaletteSelection, result: QueryResult | null): ColorEncoding {
  const s = stats(continuousValues(pill, result));
  const lo = s?.min ?? meta?.min ?? 0;
  const hi = s?.max ?? meta?.max ?? 1;
  const domain: [number, number] = sel.domain && sel.domain !== 'auto' ? [sel.domain[0], sel.domain[1]] : [lo, hi];
  const spansZero = domain[0] < 0 && domain[1] > 0;
  const diverging = sel.useDiverging ?? (sel.mode === 'auto' && spansZero);

  if (diverging) {
    const palette = sel.mode === 'manual' ? resolveById(sel.diverging, 'diverging', DEFAULT_DIVERGING) : getPalette(DEFAULT_DIVERGING)!;
    const mp = sel.midpoint ?? 'zero';
    const midpoint = typeof mp === 'number' ? mp : mp === 'zero' ? 0 : mp === 'mean' ? (s?.mean ?? (domain[0] + domain[1]) / 2) : (s?.median ?? (domain[0] + domain[1]) / 2);
    const stops = sel.reverse ? [...palette.colors].reverse() : [...palette.colors];
    return { kind: 'continuous', paletteId: palette.id, domain, midpoint, stops };
  }
  const palette = sel.mode === 'manual' ? resolveById(sel.sequential, 'sequential', DEFAULT_SEQUENTIAL) : getPalette(DEFAULT_SEQUENTIAL)!;
  const stops = sel.reverse ? [...palette.colors].reverse() : [...palette.colors];
  return { kind: 'continuous', paletteId: palette.id, domain, stops };
}

/**
 * Pick the encoding for the current Color pill (undefined = no pill).
 * No pill → single color; discrete pill → categorical (stable map, overrides
 * win); continuous pill → sequential, or diverging when `useDiverging` or,
 * in auto mode, when the domain spans zero; `reverse` flips the stops.
 */
export function pickPalette(
  colorPill: Pill | undefined,
  meta: FieldMeta | undefined,
  sel: PaletteSelection,
  result: QueryResult | null,
  chart: ChartTypeId,
): ColorEncoding {
  if (!colorPill) return { kind: 'none', color: DEFAULT_SINGLE_COLOR };
  if (colorPill.continuity === 'discrete') return pickCategorical(colorPill, meta, sel, result, chart);
  return pickContinuous(colorPill, meta, sel, result);
}
