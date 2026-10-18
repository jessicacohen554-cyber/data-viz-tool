/**
 * Projects a VizSpec to the QueryPlan the data worker executes, and derives a
 * canonical key for it. Render-only settings (chart type, formats, marks, axes,
 * legend, palette, title) are deliberately NOT part of the plan, so changing
 * them never triggers a worker round-trip (plan §9 "incremental re-query").
 *
 * The chart registry (S3) may need extra plan features (boxplot statistics,
 * disaggregation for scatter). It declares them through `ChartNeeds`, passed
 * in by the caller so this module stays independent of the registry.
 */
import type { Pill, QueryDim, QueryMeasure, QueryPlan, QuerySort, VizSpec } from './types';
import { MARK_SHELVES, QUERY_LIMIT_DESKTOP } from './constants';

/** Plan features a chart type requires beyond what the pills imply. */
export interface ChartNeeds {
  /** Return row-level data (scatter with Detail, parallel coordinates). */
  disaggregate?: boolean;
  /** Compute boxplot statistics for the first measure. */
  boxstats?: boolean;
  /**
   * Percentile bands per group for the envelope chart (v2): one vector per
   * level (0..100) over the rows of `measureKey`'s pill (the first measure
   * when absent or not a plan measure).
   */
  bands?: { levels: number[]; measureKey?: string };
}

/** Pills that act as group-by dimensions: dimension role, or a binned measure, or a date part/trunc. */
function isDimensionPill(p: Pill): boolean {
  return p.role === 'dimension' || p.bin !== undefined;
}

/** Pills on the shelves that contribute to the query (everything except filters, which contribute via spec.filters). */
function queryPills(spec: VizSpec): Pill[] {
  const out: Pill[] = [];
  out.push(...spec.shelves.columns, ...spec.shelves.rows);
  for (const s of MARK_SHELVES) out.push(...spec.shelves[s]);
  return out;
}

/** Dedupe by (field, date treatment, bin) so the same dimension on two shelves is one group-by column. */
function dimSignature(p: Pill): string {
  return JSON.stringify([p.field, p.date ?? null, p.bin ?? null]);
}

function measureSignature(p: Pill): string {
  return JSON.stringify([p.field, p.aggregation]);
}

/**
 * Build the plan. Dimensions keep the first pill's id as `key`; measures likewise.
 * Pills that are duplicates (same field+treatment) map to the same key, which the
 * spec builder resolves through `pillKeyMap`.
 */
export function queryOf(spec: VizSpec, needs: ChartNeeds = {}, limit = QUERY_LIMIT_DESKTOP): QueryPlan {
  const dims: QueryDim[] = [];
  const measures: QueryMeasure[] = [];
  const seenDims = new Map<string, string>();
  const seenMeasures = new Map<string, string>();
  let disaggregate = Boolean(needs.disaggregate);

  for (const p of queryPills(spec)) {
    if (isDimensionPill(p)) {
      const sig = dimSignature(p);
      if (seenDims.has(sig)) continue;
      seenDims.set(sig, p.id);
      const d: QueryDim = { key: p.id, field: p.field };
      if (p.date) d.date = p.date;
      if (p.bin) d.bin = p.bin;
      dims.push(d);
    } else {
      if (p.aggregation === 'none') disaggregate = true;
      const sig = measureSignature(p);
      if (seenMeasures.has(sig)) continue;
      seenMeasures.set(sig, p.id);
      measures.push({ key: p.id, field: p.field, aggregation: p.aggregation });
    }
  }

  const plan: QueryPlan = {
    datasetId: spec.datasetId,
    dims,
    measures,
    filters: spec.filters,
    disaggregate,
    limit,
  };

  const sort = sortOf(spec, dims, measures);
  if (sort) plan.sort = sort;
  if (needs.boxstats && measures[0]) plan.boxstats = { measureKey: measures[0].key };
  if (needs.bands && needs.bands.levels.length > 0 && measures[0]) {
    const target = measures.find((m) => m.key === needs.bands!.measureKey) ?? measures[0];
    plan.bands = { measureKey: target.key, levels: [...needs.bands.levels] };
  }
  return plan;
}

/** First sorted dimension pill on columns/rows decides the result order. */
function sortOf(spec: VizSpec, dims: QueryDim[], measures: QueryMeasure[]): QuerySort | undefined {
  const pills = [...spec.shelves.columns, ...spec.shelves.rows].filter((p) => isDimensionPill(p) && p.sort);
  const p = pills[0];
  if (!p || !p.sort) return undefined;
  const dim = dims.find((d) => d.field === p.field);
  if (!dim) return undefined;
  const s = p.sort;
  if (s.by === 'alpha' || s.by === 'source') return { dimKey: dim.key, by: 'label', dir: s.dir };
  if (s.by === 'manual') return { dimKey: dim.key, by: 'manual', dir: s.dir, manual: s.manual ?? [] };
  const m = measures.find((mm) => mm.field === s.field && (s.aggregation ? mm.aggregation === s.aggregation : true));
  if (!m) return { dimKey: dim.key, by: 'label', dir: s.dir };
  return { dimKey: dim.key, by: 'value', measureKey: m.key, dir: s.dir };
}

/** Maps every query pill id to the plan key that carries its data (duplicates share a key). */
export function pillKeyMap(spec: VizSpec): Map<string, string> {
  const map = new Map<string, string>();
  const dimKeys = new Map<string, string>();
  const measureKeys = new Map<string, string>();
  for (const p of queryPills(spec)) {
    if (isDimensionPill(p)) {
      const sig = dimSignature(p);
      if (!dimKeys.has(sig)) dimKeys.set(sig, p.id);
      map.set(p.id, dimKeys.get(sig)!);
    } else {
      const sig = measureSignature(p);
      if (!measureKeys.has(sig)) measureKeys.set(sig, p.id);
      map.set(p.id, measureKeys.get(sig)!);
    }
  }
  return map;
}

/** Canonical key: stable JSON with sorted object keys, ids replaced by their field signature. */
export function queryKey(plan: QueryPlan): string {
  const canon = {
    d: plan.datasetId,
    dims: plan.dims.map((d) => [d.field, d.date ?? null, d.bin ?? null]),
    ms: plan.measures.map((m) => [m.field, m.aggregation]),
    f: plan.filters.map(stripPillId),
    x: plan.disaggregate,
    s: plan.sort ? [sortDimField(plan), plan.sort.by, plan.sort.dir, plan.sort.manual ?? null, sortMeasureSig(plan)] : null,
    l: plan.limit,
    b: plan.boxstats ? measureSigFor(plan, plan.boxstats.measureKey) : null,
    p: plan.bands ? [measureSigFor(plan, plan.bands.measureKey), plan.bands.levels] : null,
  };
  return stableStringify(canon);
}

function stripPillId(f: QueryPlan['filters'][number]): unknown {
  const { pillId: _omit, ...rest } = f;
  return rest;
}

function sortDimField(plan: QueryPlan): string | null {
  return plan.dims.find((d) => d.key === plan.sort?.dimKey)?.field ?? null;
}

function sortMeasureSig(plan: QueryPlan): unknown {
  return plan.sort?.measureKey ? measureSigFor(plan, plan.sort.measureKey) : null;
}

function measureSigFor(plan: QueryPlan, key: string): unknown {
  const m = plan.measures.find((mm) => mm.key === key);
  return m ? [m.field, m.aggregation] : null;
}

/** JSON.stringify with recursively sorted object keys. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
