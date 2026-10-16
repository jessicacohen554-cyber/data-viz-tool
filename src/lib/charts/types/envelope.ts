/**
 * Probability envelope (CHARTS.md #37, D-15): nested translucent bands around
 * a central line per x. `percentile` mode reads `result.bands` (one
 * Float64Array per level in `envelopeLevels(spec)` order, computed by the
 * worker from the rows of each group); `columns` mode reads explicit
 * low / high (and mid) measure pills. Bands are drawn as stacked `line`
 * areas: a transparent base at the low value plus a filled `high − low`
 * on its own stack, so nested levels never occlude each other.
 */
import type { Pill, VizSpec } from '../../core/types';
import { AGGREGATION_LABEL, DEFAULT_ENVELOPE_LEVELS } from '../../core/constants';
import type { BuildContext, ChartDef } from '../registry';
import {
  type OptionObject, DECORATION_MODULES, axisKind, baseOption, categoryAxis, dataZoomInside, dimFormatter,
  dimsOn, formatterFor, gridBox, legend, measureOf, measuresOn, pillLabel, pointCount, requireDim, requireMeasure, seriesColors, svgIcon,
  themeOf, timeAxis, tooltip, valueAxis,
} from '../option-common';
import { type Cell, dimAccessor, measureAt } from '../transforms';

/** Opacity of the outermost band; each inner band adds `BAND_OPACITY_STEP`. */
export const BAND_OPACITY_OUTER = 0.14;
export const BAND_OPACITY_STEP = 0.12;

/** The nested levels of a spec (outer first), defaulting to P5–P95 / P25–P75. */
export function envelopeBandLevels(spec: VizSpec): Array<[number, number]> {
  const levels = spec.envelope?.levels?.length ? spec.envelope.levels : DEFAULT_ENVELOPE_LEVELS.map((l) => [l[0], l[1]] as [number, number]);
  return levels.map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number]);
}

/**
 * Percentile levels the worker must compute for `percentile` mode, in the
 * order `result.bands` is read: every band's low and high, outer first, then
 * the median (50). The integrator passes this to `QueryPlan.bands.levels`.
 */
export function envelopeLevels(spec: VizSpec): number[] {
  const out: number[] = [];
  for (const [lo, hi] of envelopeBandLevels(spec)) { out.push(lo, hi); }
  if (!out.includes(50)) out.push(50);
  return out;
}

/** Resolve the low / high / mid pills of `columns` mode: by `envelope.low/high/mid` field names, else Rows order. */
export function envelopeColumnPills(spec: VizSpec): { low: Pill | undefined; high: Pill | undefined; mid: Pill | undefined } {
  const ms = measuresOn(spec, 'rows');
  // Three aggregations of one field (MIN/AVG/MAX of generation) are the common case, so a field name never claims a pill twice.
  const byField = (f: string | undefined, taken: Array<Pill | undefined>) => (f ? ms.find((m) => m.field === f && !taken.includes(m)) : undefined);
  const e = spec.envelope;
  const low = byField(e?.low, []) ?? ms[0];
  const high = byField(e?.high, [low]) ?? ms.find((m) => m !== low);
  const mid = byField(e?.mid, [low, high]) ?? ms.find((m) => m !== low && m !== high);
  return { low, high, mid };
}

/** Show Me reason an envelope cannot be drawn, else null. */
export function envelopeUnmet(spec: VizSpec): string | null {
  const x = dimsOn(spec, 'columns')[0];
  if (!x) return 'Needs a date or continuous field on Columns';
  const mode = spec.envelope?.mode ?? 'percentile';
  const ms = measuresOn(spec, 'rows');
  if (mode === 'columns') return ms.length >= 2 ? null : 'Needs low and high measures on Rows';
  return ms.length >= 1 ? null : 'Needs a measure on Rows';
}

/** One band to draw. */
interface Band { name: string; lo: Cell[]; hi: Cell[] }

/** Build the envelope option. */
export function buildEnvelope(ctx: BuildContext): OptionObject {
  const spec = ctx.spec;
  const mode = spec.envelope?.mode ?? 'percentile';
  const xPill = dimsOn(spec, 'columns')[0] ?? dimsOn(spec, 'rows')[0];
  const xDim = requireDim(ctx, xPill, 'Columns');
  const n = ctx.result.groups;
  const xAt = dimAccessor(xDim);
  const order = Array.from({ length: n }, (_, i) => i);
  if (axisKind(xPill) === 'time') order.sort((a, b) => Number(xAt(a)) - Number(xAt(b)));
  const x = order.map((i) => xAt(i));
  const theme = themeOf(ctx);
  const bands: Band[] = [];
  let mid: Cell[] | null = null;
  let midName = 'Median';
  let valuePill: Pill;

  if (mode === 'columns') {
    const { low, high, mid: midPill } = envelopeColumnPills(spec);
    if (!low || !high) throw new Error('envelope: columns mode needs low and high measures on Rows');
    const lm = requireMeasure(ctx, low, 'the low measure'); const hm = requireMeasure(ctx, high, 'the high measure');
    valuePill = midPill ?? high;
    // Three aggregations of one field read better as "MIN–MAX field" than as two full pill labels.
    const name = low.field === high.field && !low.alias && !high.alias
      ? `${AGGREGATION_LABEL[low.aggregation]}–${AGGREGATION_LABEL[high.aggregation]} ${low.field}`
      : `${pillLabel(low)} – ${pillLabel(high)}`;
    bands.push({ name, lo: order.map((i) => measureAt(lm, i)), hi: order.map((i) => measureAt(hm, i)) });
    if (midPill) { const mm = requireMeasure(ctx, midPill, 'the mid measure'); mid = order.map((i) => measureAt(mm, i)); midName = pillLabel(midPill); }
  } else {
    const mPill = measuresOn(spec, 'rows')[0] ?? measuresOn(spec, 'columns')[0];
    if (!mPill) throw new Error('envelope: needs a measure on Rows');
    valuePill = mPill;
    const levels = envelopeLevels(spec);
    const arrays = ctx.result.bands;
    if (!arrays || arrays.length < levels.length) throw new Error(`envelope: result has no percentile bands for levels ${levels.join('/')} (QueryPlan.bands); switch the envelope to columns mode or add low/high measures`);
    const at = (li: number) => order.map((i) => { const v = arrays[li]![i]; return v === undefined || Number.isNaN(v) ? null : v; });
    envelopeBandLevels(spec).forEach(([lo, hi], k) => bands.push({ name: `P${lo}–P${hi}`, lo: at(2 * k), hi: at(2 * k + 1) }));
    const medianIndex = levels.indexOf(50);
    const m = measureOf(ctx, mPill);
    mid = medianIndex >= 0 ? at(medianIndex) : m ? order.map((i) => measureAt(m, i)) : null;
    midName = medianIndex >= 0 ? `Median ${mPill.field}` : pillLabel(mPill);
  }

  const hue = seriesColors(ctx, [pillLabel(valuePill)])[0] ?? theme.accent;
  const fmt = formatterFor(ctx, valuePill);
  const isTime = axisKind(xPill) === 'time';
  const pt = (v: number | null, xi: number) => (isTime ? [x[xi], v] : v);
  const series: OptionObject[] = [];
  bands.forEach((b, k) => {
    const stack = `band-${k}`;
    const lo = b.lo.map((v, xi) => pt(v, xi));
    const span = b.hi.map((v, xi) => pt(v === null || b.lo[xi] === null ? null : v - (b.lo[xi] as number), xi));
    series.push({ type: 'line', name: b.name, data: lo, stack, lineStyle: { opacity: 0 }, showSymbol: false, symbol: 'none', areaStyle: { opacity: 0 }, silent: true, tooltip: { show: false }, emphasis: { disabled: true }, z: 1 });
    series.push({ type: 'line', name: b.name, data: span, stack, lineStyle: { opacity: 0 }, showSymbol: false, symbol: 'none', areaStyle: { color: hue, opacity: Math.min(0.9, BAND_OPACITY_OUTER + k * BAND_OPACITY_STEP) }, emphasis: { disabled: true }, z: 1, __band: k });
  });
  if (mid) {
    series.push({
      type: 'line', name: midName, data: mid.map((v, xi) => pt(v, xi)), showSymbol: spec.marks.showPoints, symbol: 'circle', symbolSize: 6, smooth: spec.marks.smooth,
      lineStyle: { width: spec.marks.lineWidth, color: hue }, itemStyle: { color: hue, borderColor: theme.bg, borderWidth: 2 }, connectNulls: spec.marks.nullHandling === 'connect', z: 3,
    });
  }
  const legendNames = [...bands.map((b) => b.name), ...(mid ? [midName] : [])];
  const bandByName = new Map(bands.map((b) => [b.name, b]));
  const xAxis = isTime ? timeAxis(ctx, 'x', xPill) : { ...categoryAxis(ctx, 'x', xPill, x), boundaryGap: false };
  const dimFmt = dimFormatter(ctx, xPill);
  const tooltipFmt = (params: unknown) => {
    const list = (Array.isArray(params) ? params : [params]) as Array<{ seriesName: string; dataIndex: number; axisValue?: string | number; axisValueLabel?: string; data?: unknown; color?: string }>;
    const head = list[0];
    const seen = new Set<string>();
    const rows: string[] = [];
    for (const p of list) {
      if (seen.has(p.seriesName)) continue;
      seen.add(p.seriesName);
      const b = bandByName.get(p.seriesName);
      if (b) {
        const lo = b.lo[p.dataIndex]; const hi = b.hi[p.dataIndex];
        if (lo !== null && lo !== undefined && hi !== null && hi !== undefined) rows.push(`<div>${p.seriesName} <span style="font-family:monospace;float:right;margin-left:12px">${fmt(lo)} – ${fmt(hi)}</span></div>`);
      } else if (mid) {
        const v = mid[p.dataIndex];
        if (v !== null && v !== undefined) rows.push(`<div>${p.seriesName} <span style="font-family:monospace;float:right;margin-left:12px">${fmt(v)}</span></div>`);
      }
    }
    const label = isTime && typeof head?.axisValue === 'number' ? dimFmt(head.axisValue) : String(head?.axisValueLabel ?? head?.axisValue ?? '');
    return `<div style="color:${theme.textMuted};margin-bottom:4px">${label}</div>${rows.join('')}`;
  };
  return {
    ...baseOption(ctx, pointCount(ctx, series.length)),
    tooltip: tooltip(ctx, 'axis', tooltipFmt),
    legend: { ...legend(ctx, legendNames), show: spec.legend.show && legendNames.length >= 1, icon: 'roundRect' },
    grid: gridBox(ctx, Math.max(2, legendNames.length)),
    xAxis,
    yAxis: valueAxis(ctx, 'y', valuePill),
    dataZoom: dataZoomInside('x'),
    series,
    __meta: { mode, levels: bands.map((b) => b.name), bands: bands.length, hasMid: Boolean(mid), measure: pillLabel(valuePill) },
  };
}

export const envelope: ChartDef = {
  id: 'envelope',
  label: 'Envelope',
  group: 'distribution',
  icon: svgIcon('<path d="M3 15c4-6 8-7 18-9v8c-10 2-14 3-18 9z" fill="currentColor" fill-opacity="0.2"/><path d="M3 13c4-4 8-5 18-7v4c-10 2-14 3-18 7z" fill="currentColor" fill-opacity="0.3"/><path d="M3 15c4-5 8-6 18-8"/>'),
  requires: { dims: [1, 2], measures: [1, 3], exact: (spec) => envelopeUnmet(spec) },
  channels: ['color', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['LineChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'DataZoomInsideComponent', ...DECORATION_MODULES, 'CanvasRenderer'],
  build: buildEnvelope,
};
