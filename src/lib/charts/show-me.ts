/**
 * "Show Me" (docs/CHARTS.md §2–§3): which chart types the current pills can
 * drive (`eligibility`), the best one (`suggest`), and the pill rearrangement
 * applied to a draft spec when the user switches type (`arrangeFor`).
 * Framework-free (rule R-PURE); the picker calls these inside one
 * `spec-store.patch`.
 */
import type { ChartTypeId, FieldMeta, Pill, VizSpec } from '../core/types';
import { CHART_TYPE_IDS } from '../core/constants';
import { newId } from '../core/spec-defaults';
import { CHART_TYPES, type Requirement } from './registry';
import { classify, isContinuousPill, isDatePill, isDimPill, isMeasurePill } from './option-common';
import { AREA_ROLES, geoRoleFor } from './map-common';

export interface Eligibility { id: ChartTypeId; ok: boolean; reason?: string }

/** Count a requirement range in words. */
function need(label: string, [min, max]: [number, number], have: number): string | null {
  if (have < min) return `Needs ${min === max ? '' : 'at least '}${min} ${label}${min === 1 ? '' : 's'}`;
  if (have > max) return `Takes at most ${max} ${label}${max === 1 ? '' : 's'}`;
  return null;
}

/** Reason a requirement is unmet, or null. */
export function unmet(req: Requirement, spec: VizSpec, meta: FieldMeta[]): string | null {
  const c = classify(spec);
  return need('dimension', req.dims, c.dims.length)
    ?? need('measure', req.measures, c.measures.length)
    ?? (req.dates ? need('date', req.dates, c.dates.length) : null)
    ?? (req.colorDim && !(c.colorPill && isDimPill(c.colorPill)) ? 'Needs a dimension on Color' : null)
    ?? (req.exact ? req.exact(spec, meta) : null);
}

/** Eligibility of every chart type for the spec's current pills. */
export function eligibility(spec: VizSpec, meta: FieldMeta[]): Eligibility[] {
  return CHART_TYPE_IDS.map((id) => {
    const def = CHART_TYPES[id];
    if (!def) return { id, ok: false, reason: 'Not registered' };
    const reason = unmet(def.requires, spec, meta);
    return reason ? { id, ok: false, reason } : { id, ok: true };
  });
}

/**
 * Best chart for the current pills (filled map if a dimension carries an
 * area geo role → bar → line if date → scatter if 2 measures →
 * text-table). Only an inferred or user-set geo role suggests a map.
 */
export function suggest(spec: VizSpec, meta: FieldMeta[]): ChartTypeId {
  const c = classify(spec);
  const axisPills = [...spec.shelves.columns, ...spec.shelves.rows];
  const geoDim = c.dims.find((d) => { const r = geoRoleFor(spec, meta, d.field); return r !== null && AREA_ROLES.includes(r); });
  if (geoDim && c.measures.length >= 1) return 'map-choropleth';
  if (c.dims.length >= 1 && c.measures.length >= 1) return 'bar';
  if (axisPills.some((p) => isDatePill(p) || (p.date?.mode === 'trunc')) && c.measures.length >= 1) return 'line';
  if (c.measures.length >= 2 && c.dims.length === 0) return 'scatter';
  return 'text-table';
}

/**
 * Tableau's Show Me move (CHARTS.md §3): place the current pills for `target`
 * on a draft spec. Pills not consumed go to Detail; the filters shelf is left
 * alone. Mutates `draft` (callers pass the `patch` draft). `meta` supplies the
 * inferred geo roles the map moves look for (overrides in `draft` win).
 */
export function arrangeFor(draft: VizSpec, target: ChartTypeId, meta: FieldMeta[] = []): void {
  const pool: Pill[] = [];
  for (const s of ['columns', 'rows', 'color', 'size', 'label', 'detail', 'tooltip', 'shape'] as const) { pool.push(...draft.shelves[s]); draft.shelves[s] = []; }
  const D = pool.filter(isDimPill);
  const M = pool.filter(isMeasurePill);
  const roleOf = (p: Pill) => geoRoleFor(draft, meta, p.field);
  const areaDim = D.find((d) => { const r = roleOf(d); return r !== null && AREA_ROLES.includes(r); });
  const T = D.find(isDatePill);
  const C = pool.find((p) => isContinuousPill(p) && !isDatePill(p));
  const used = new Set<string>();
  const put = (shelf: keyof VizSpec['shelves'], ...pills: Array<Pill | undefined>) => {
    for (const p of pills) if (p && !used.has(p.id)) { used.add(p.id); draft.shelves[shelf].push(p); }
  };
  const Drest = (skip: Array<Pill | undefined>) => D.filter((d) => !skip.includes(d));
  const [D1, D2] = D;
  const [M1, M2, M3, M4] = M;
  switch (target) {
    case 'bar': case 'lollipop': case 'waterfall': put('columns', D1); put('rows', M1); put('color', D2); break;
    case 'bullet': put('columns', D1); put('rows', M1, M2); put('color', D2); break;
    case 'bar-h': put('rows', D1); put('columns', M1); put('color', D2); break;
    case 'bar-grouped': case 'bar-stacked': case 'bar-stacked-100': put('columns', D1); put('rows', M1); put('color', D2); break;
    case 'line': case 'area': case 'area-stacked': case 'area-100': case 'bump': { const x = T ?? C; put('columns', x); put('rows', M1); put('color', Drest([x])[0]); break; }
    // Combo: every measure on Rows; the second and later default to the right axis unless the pill already says.
    case 'combo': { const x = T ?? D1; put('columns', x); for (const m of M.slice(1)) m.axis ??= 'secondary'; put('rows', ...M); put('color', Drest([x])[0]); break; }
    // Envelope: a date or continuous x; one measure (percentile mode) or low/high(/mid) (columns mode).
    case 'envelope': { const x = T ?? D1; put('columns', x); put('rows', M1, M2, M3); break; }
    case 'map-choropleth': {
      const geo = areaDim ?? D1;
      put('columns', geo); put('color', M1); put('detail', ...Drest([geo])); break;
    }
    case 'map-symbol': {
      const geo = areaDim;
      const lat = M.find((m) => roleOf(m) === 'latitude'); const lon = M.find((m) => roleOf(m) === 'longitude');
      const rest = M.filter((m) => m !== lat && m !== lon);
      put('columns', geo ?? lon); put('rows', lat); put('size', rest[0]); put('color', Drest([geo])[0]); put('detail', ...Drest([geo, Drest([geo])[0]])); break;
    }
    case 'candlestick': { const x = T ?? C; put('columns', x); put('rows', M1, M2, M3, M4); put('color', Drest([x])[0]); break; }
    case 'streamgraph': put('columns', T); put('rows', M1); put('color', Drest([T])[0]); break;
    case 'scatter': put('columns', M1); put('rows', M2); put('color', D1); break;
    case 'bubble': put('columns', M1); put('rows', M2); put('color', D1); put('size', M3); break;
    case 'parallel': put('columns', ...M); put('color', D1); break;
    case 'pie': case 'donut': case 'funnel': put('color', D1); put('size', M1); break;
    case 'gauge': case 'kpi': put('label', M1); put('tooltip', M2); break;
    case 'treemap': case 'sunburst': put('color', D1); put('size', M1); put('detail', ...Drest([D1])); break;
    case 'heatmap': case 'highlight-table': put('columns', D1); put('rows', D2); put('color', M1); break;
    case 'calendar-heatmap': { if (T) { T.date = { level: 'day', mode: 'trunc' }; T.continuity = 'continuous'; } put('columns', T); put('color', M1); break; }
    case 'histogram': {
      // The binned measure acts as the dimension; the y measure is the row count of the same field.
      if (M1) { M1.bin ??= { count: 20 }; M1.continuity = 'discrete'; }
      put('columns', M1);
      if (M1) put('rows', { id: newId(), field: M1.field, role: 'measure', continuity: 'continuous', aggregation: 'count' });
      put('color', D1);
      break;
    }
    case 'boxplot': { put('columns', D1); if (M1) M1.aggregation = 'none'; put('rows', M1); break; }
    case 'dumbbell': put('columns', D1); put('rows', M1, M2); break;
    case 'slope': put('columns', D1); put('rows', M1); put('color', D2); break;
    case 'radar': put('rows', ...M); put('color', D1); break;
    case 'sankey': put('columns', ...D); put('size', M1); break;
    // Label holds one pill (contract); further measures ride on Tooltip and the table shows them all.
    case 'text-table': put('rows', ...D); put('label', M1); put('tooltip', ...M.slice(1)); break;
  }
  for (const p of pool) if (!used.has(p.id)) draft.shelves.detail.push(p);
  draft.chartType = target;
}
