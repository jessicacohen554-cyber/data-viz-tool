/**
 * Pure reshaping of a `QueryResult` into the forms the chart builders consume
 * (docs/CHARTS.md "Transform" column): pivot, percent stack, running total
 * (waterfall), rank per x (bump), pairs (dumbbell/slope), adjacent links
 * (sankey), tree nesting (treemap/sunburst), bullet bands, dense grid
 * (heatmap/tables), OHLC validation and value sorting.
 *
 * Also owns result access: `dimAccessor` and `measureAt` are the only places
 * that know a dimension is `codes` + `labels` or `values`, and that a null
 * group is `NaN`. Framework-free (rule R-PURE); imports nothing but the
 * contract types.
 */
import type { ResultDim, ResultMeasure } from '../core/types';

/** A measure cell: `null` for a null group. */
export type Cell = number | null;

/** One series of a pivot, aligned to `Pivot.x`. */
export interface Series { name: string; values: Cell[] }

/** Wide form: one value per (x, series). Missing combinations are `null`. */
export interface Pivot { x: Array<string | number>; series: Series[] }

/** Dimension value at result row `i`: the label for a `codes` dim, the number for a `values` dim. */
export function dimAccessor(dim: ResultDim): (i: number) => string | number {
  if (dim.kind === 'codes') {
    const codes = dim.codes ?? new Int32Array(0);
    const labels = dim.labels ?? [];
    return (i) => {
      const c = codes[i];
      return c === undefined || c < 0 ? '' : (labels[c] ?? '');
    };
  }
  const values = dim.values ?? new Float64Array(0);
  return (i) => values[i] ?? NaN;
}

/** Measure value at row `i`; `NaN` (null group) and out-of-range become `null`. */
export function measureAt(m: ResultMeasure, i: number): Cell {
  const v = m.values[i];
  return v === undefined || Number.isNaN(v) ? null : v;
}

/** Every value of a measure as `Cell[]`. */
export function measureCells(m: ResultMeasure, n: number): Cell[] {
  const out: Cell[] = new Array<Cell>(n);
  for (let i = 0; i < n; i++) out[i] = measureAt(m, i);
  return out;
}

/** Distinct values of a dimension in first-appearance order. */
export function distinct(dim: ResultDim, n: number): Array<string | number> {
  const at = dimAccessor(dim);
  const seen = new Set<string | number>();
  const out: Array<string | number> = [];
  for (let i = 0; i < n; i++) { const v = at(i); if (!seen.has(v)) { seen.add(v); out.push(v); } }
  return out;
}

/**
 * Pivot `measure` by `xDim` (rows) and optional `seriesDim` (columns).
 * Series follow `seriesOrder` when given (palette order, rule R-PALETTE), else
 * first appearance; x keeps the result's order. Duplicate (x, series) cells
 * are summed, which cannot happen for a grouped result but keeps the function total.
 */
export function pivot(
  n: number,
  xDim: ResultDim,
  seriesDim: ResultDim | undefined,
  measure: ResultMeasure,
  seriesName: string,
  seriesOrder?: string[],
): Pivot {
  const xAt = dimAccessor(xDim);
  const sAt = seriesDim ? dimAccessor(seriesDim) : () => seriesName;
  const xIndex = new Map<string | number, number>();
  const x: Array<string | number> = [];
  const sIndex = new Map<string, number>();
  const series: Series[] = [];
  const addSeries = (name: string) => { sIndex.set(name, series.length); series.push({ name, values: [] }); };
  if (seriesOrder) for (const name of seriesOrder) addSeries(name);
  for (let i = 0; i < n; i++) {
    const xv = xAt(i);
    if (!xIndex.has(xv)) { xIndex.set(xv, x.length); x.push(xv); }
    const sv = String(sAt(i));
    if (!sIndex.has(sv)) addSeries(sv);
    const xi = xIndex.get(xv)!;
    const s = series[sIndex.get(sv)!]!;
    const v = measureAt(measure, i);
    if (v === null) continue;
    const prev = s.values[xi];
    s.values[xi] = prev === undefined || prev === null ? v : prev + v;
  }
  for (const s of series) { for (let xi = 0; xi < x.length; xi++) if (s.values[xi] === undefined) s.values[xi] = null; s.values.length = x.length; }
  return { x, series };
}

/** Reorder a pivot by ascending numeric x (time axes); strings keep their order. */
export function sortByX(p: Pivot): Pivot {
  if (!p.x.every((v) => typeof v === 'number')) return p;
  const order = p.x.map((_, i) => i).sort((a, b) => (p.x[a] as number) - (p.x[b] as number));
  return { x: order.map((i) => p.x[i]!), series: p.series.map((s) => ({ name: s.name, values: order.map((i) => s.values[i] ?? null) })) };
}

/**
 * Each cell as a share of its x total. Negative values are excluded from the
 * denominator and rendered as `null` (CHARTS.md #5); a zero or null total
 * leaves the whole column empty. `excludedNegatives` counts the dropped cells.
 */
export function percentStack(p: Pivot): { pivot: Pivot; excludedNegatives: number } {
  let excluded = 0;
  const totals = p.x.map((_, xi) => p.series.reduce((t, s) => { const v = s.values[xi]; return v !== null && v !== undefined && v > 0 ? t + v : t; }, 0));
  const series = p.series.map((s) => ({
    name: s.name,
    values: s.values.map((v, xi) => {
      if (v === null || v === undefined) return null;
      if (v < 0) { excluded++; return null; }
      const t = totals[xi] ?? 0;
      return t > 0 ? v / t : null;
    }),
  }));
  return { pivot: { x: p.x, series }, excludedNegatives: excluded };
}

/** Waterfall bars: invisible base + visible delta per step, then a trailing total. */
export interface Waterfall { labels: string[]; base: number[]; delta: Cell[]; kind: Array<'up' | 'down' | 'total'> }

/** Running total in the given order (the dimension's sort order, never re-sorted here). */
export function runningTotal(labels: string[], values: Cell[], totalLabel = 'Total'): Waterfall {
  const out: Waterfall = { labels: [], base: [], delta: [], kind: [] };
  let acc = 0;
  labels.forEach((label, i) => {
    const v = values[i];
    out.labels.push(label);
    if (v === null || v === undefined) { out.base.push(acc); out.delta.push(null); out.kind.push('up'); return; }
    // A negative step hangs below the previous total: base is the new total, delta its magnitude.
    out.base.push(v >= 0 ? acc : acc + v);
    out.delta.push(Math.abs(v));
    out.kind.push(v >= 0 ? 'up' : 'down');
    acc += v;
  });
  out.labels.push(totalLabel);
  out.base.push(Math.min(0, acc));
  out.delta.push(Math.abs(acc));
  out.kind.push('total');
  return out;
}

/** Rank (1 = largest) of each series at each x; ties keep series order; absent → `null`. */
export function rankPerX(p: Pivot): Pivot {
  const ranks: Cell[][] = p.series.map(() => new Array<Cell>(p.x.length).fill(null));
  for (let xi = 0; xi < p.x.length; xi++) {
    const present = p.series.map((s, si) => ({ si, v: s.values[xi] })).filter((e): e is { si: number; v: number } => e.v !== null && e.v !== undefined);
    present.sort((a, b) => b.v - a.v || a.si - b.si);
    present.forEach((e, r) => { ranks[e.si]![xi] = r + 1; });
  }
  return { x: p.x, series: p.series.map((s, si) => ({ name: s.name, values: ranks[si]! })) };
}

/** One row per dimension value with the two measure ends. */
export interface Pair { label: string; a: Cell; b: Cell }

/** Dumbbell pairs: `[m1, m2]` per dimension value in result order. */
export function pairs(n: number, dim: ResultDim, m1: ResultMeasure, m2: ResultMeasure): Pair[] {
  const at = dimAccessor(dim);
  const out: Pair[] = [];
  for (let i = 0; i < n; i++) out.push({ label: String(at(i)), a: measureAt(m1, i), b: measureAt(m2, i) });
  return out;
}

/** Sankey graph: nodes are level-prefixed so a label present at two levels never forms a cycle. */
export interface SankeyGraph {
  nodes: Array<{ id: string; name: string; level: number }>;
  links: Array<{ source: string; target: string; value: number }>;
  droppedNegative: number;
}

/** Links D₁→D₂, D₂→D₃ … weighted by the measure; negative weights dropped and counted. */
export function adjacentLinks(n: number, dims: ResultDim[], measure: ResultMeasure): SankeyGraph {
  const nodes = new Map<string, { id: string; name: string; level: number }>();
  const links = new Map<string, { source: string; target: string; value: number }>();
  const ats = dims.map(dimAccessor);
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const w = measureAt(measure, i);
    if (w === null) continue;
    if (w < 0) { dropped++; continue; }
    for (let L = 0; L < dims.length; L++) {
      const name = String(ats[L]!(i));
      const id = `${L}:${name}`;
      if (!nodes.has(id)) nodes.set(id, { id, name, level: L });
      if (L === 0) continue;
      const source = `${L - 1}:${String(ats[L - 1]!(i))}`;
      const k = `${source}→${id}`;
      const link = links.get(k);
      if (link) link.value += w; else links.set(k, { source, target: id, value: w });
    }
  }
  return { nodes: [...nodes.values()], links: [...links.values()], droppedNegative: dropped };
}

/** A hierarchy node for treemap/sunburst. Leaves carry the measure; parents sum their children. */
export interface TreeNode { name: string; value: number; children?: TreeNode[] }

/** Nest result rows by the dimensions in order; zero and negative leaf sizes are dropped (CHARTS.md #15). */
export function toTree(n: number, dims: ResultDim[], measure: ResultMeasure): { roots: TreeNode[]; dropped: number } {
  const ats = dims.map(dimAccessor);
  const roots: TreeNode[] = [];
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const v = measureAt(measure, i);
    if (v === null || v <= 0) { dropped++; continue; }
    let level = roots;
    let parentChain: TreeNode[] = [];
    for (let L = 0; L < dims.length; L++) {
      const name = String(ats[L]!(i));
      let node = level.find((c) => c.name === name);
      if (!node) { node = { name, value: 0 }; level.push(node); }
      parentChain.push(node);
      if (L < dims.length - 1) { node.children ??= []; level = node.children; }
    }
    for (const node of parentChain) node.value += v;
    parentChain = [];
  }
  return { roots, dropped };
}

/** Bullet bands at 60 / 80 / 100 % of the reference (the target, or the max when none). */
export function bands(reference: number): [number, number, number] {
  const r = Math.abs(reference);
  return [r * 0.6, r * 0.8, r];
}

/** Dense matrix for heatmap and tables. `cells` are `[xi, yi, value]` for non-null groups only. */
export interface Grid { xs: Array<string | number>; ys: Array<string | number>; cells: Array<[number, number, number]>; min: number; max: number }

/** Cross `xDim` × `yDim` (y optional → a single row) and place each non-null measure value. */
export function grid(n: number, xDim: ResultDim, yDim: ResultDim | undefined, measure: ResultMeasure): Grid {
  const xAt = dimAccessor(xDim);
  const yAt = yDim ? dimAccessor(yDim) : () => '';
  const xi = new Map<string | number, number>(); const yi = new Map<string | number, number>();
  const xs: Array<string | number> = []; const ys: Array<string | number> = [];
  const cells: Array<[number, number, number]> = [];
  let min = Infinity; let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const xv = xAt(i); const yv = yAt(i);
    if (!xi.has(xv)) { xi.set(xv, xs.length); xs.push(xv); }
    if (!yi.has(yv)) { yi.set(yv, ys.length); ys.push(yv); }
    const v = measureAt(measure, i);
    if (v === null) continue;
    cells.push([xi.get(xv)!, yi.get(yv)!, v]);
    if (v < min) min = v; if (v > max) max = v;
  }
  if (cells.length === 0) { min = 0; max = 0; }
  return { xs, ys, cells, min, max };
}

/** One candlestick row: `[t, open, close, low, high]`. */
export type OhlcRow = [number | string, number, number, number, number];

/** Validate `low ≤ min(open, close)` and `max(open, close) ≤ high`; violating or null rows are dropped and counted. */
export function ohlc(n: number, tDim: ResultDim, m: [ResultMeasure, ResultMeasure, ResultMeasure, ResultMeasure]): { rows: OhlcRow[]; dropped: number } {
  const tAt = dimAccessor(tDim);
  const rows: OhlcRow[] = [];
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const o = measureAt(m[0], i); const c = measureAt(m[1], i); const l = measureAt(m[2], i); const h = measureAt(m[3], i);
    if (o === null || c === null || l === null || h === null || l > Math.min(o, c) || h < Math.max(o, c)) { dropped++; continue; }
    rows.push([tAt(i), o, c, l, h]);
  }
  rows.sort((a, b) => (typeof a[0] === 'number' && typeof b[0] === 'number' ? a[0] - b[0] : 0));
  return { rows, dropped };
}

/** Labels and values sorted by value; nulls last. */
export function sortByValue(labels: string[], values: Cell[], dir: 'asc' | 'desc'): { labels: string[]; values: Cell[] } {
  const order = labels.map((_, i) => i).sort((a, b) => {
    const va = values[a] ?? null; const vb = values[b] ?? null;
    if (va === null && vb === null) return 0; if (va === null) return 1; if (vb === null) return -1;
    return dir === 'asc' ? va - vb : vb - va;
  });
  return { labels: order.map((i) => labels[i]!), values: order.map((i) => values[i] ?? null) };
}

/** Keep the `max` largest slices and fold the rest into one `otherLabel` slice; nulls and negatives are dropped. */
export function foldSlices(labels: string[], values: Cell[], max: number, otherLabel = 'Other'): { labels: string[]; values: number[]; folded: number; droppedNegative: number } {
  let droppedNegative = 0;
  const kept: Array<{ l: string; v: number }> = [];
  labels.forEach((l, i) => { const v = values[i]; if (v === null || v === undefined) return; if (v < 0) { droppedNegative++; return; } kept.push({ l, v }); });
  if (kept.length <= max) return { labels: kept.map((k) => k.l), values: kept.map((k) => k.v), folded: 0, droppedNegative };
  const sorted = [...kept].sort((a, b) => b.v - a.v);
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1);
  const headSet = new Set(head.map((h) => h.l));
  const ordered = kept.filter((k) => headSet.has(k.l));
  return {
    labels: [...ordered.map((k) => k.l), otherLabel],
    values: [...ordered.map((k) => k.v), rest.reduce((t, k) => t + k.v, 0)],
    folded: rest.length,
    droppedNegative,
  };
}
