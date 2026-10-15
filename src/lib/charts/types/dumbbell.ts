/**
 * Dumbbell (CHARTS.md #25): one row per D value; a `custom` segment between the
 * two M ends drawn as scatter dots in the `pairs-amber-indigo` colors; a null
 * end leaves a single dot.
 */
import type { ChartDef } from '../registry';
import {
  type OptionObject, PAIR_COLORS, baseOption, categoryAxis, classify, dimsOn, escapeHtml, formatterFor, gridBox, legend, measuresOn, pillLabel, pointCount,
  requireDim, requireMeasure, svgIcon, themeOf, tooltip, tooltipRow, valueAxis,
} from '../option-common';
import { pairs } from '../transforms';

/** Segment renderer for ECharts `custom` series: a line between two x values on the same category row. */
export function segmentRenderer(color: string, width: number) {
  return (params: { dataIndex: number; coordSys?: unknown }, api: { value: (i: number) => number; coord: (p: [number, number]) => [number, number] }): OptionObject | undefined => {
    const a = api.value(1); const b = api.value(2);
    if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
    const p1 = api.coord([a, api.value(0)]); const p2 = api.coord([b, api.value(0)]);
    return { type: 'line', shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }, style: { stroke: color, lineWidth: width } };
  };
}

export const dumbbell: ChartDef = {
  id: 'dumbbell',
  label: 'Dumbbell',
  group: 'comparison',
  icon: svgIcon('<path d="M7 7h10M6 12h12M9 17h6"/><circle cx="5" cy="7" r="2"/><circle cx="19" cy="7" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'),
  requires: { dims: [1, 1], measures: [2, 2] },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['CustomChart', 'ScatterChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const dPill = dimsOn(spec, 'columns')[0] ?? classify(spec).dims[0];
    const ms = [...measuresOn(spec, 'rows'), ...measuresOn(spec, 'columns'), ...classify(spec).measures].filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
    const [m1, m2] = ms;
    if (!m1 || !m2) throw new Error('dumbbell: needs 2 measures');
    const dim = requireDim(ctx, dPill, 'Columns');
    const rows = pairs(ctx.result.groups, dim, requireMeasure(ctx, m1, pillLabel(m1)), requireMeasure(ctx, m2, pillLabel(m2)));
    const theme = themeOf(ctx);
    const fmt = formatterFor(ctx, m1);
    const names = [pillLabel(m1), pillLabel(m2)];
    const over = spec.palette.overrides ?? {};
    const colors: [string, string] = [over[names[0]!] ?? PAIR_COLORS[0], over[names[1]!] ?? PAIR_COLORS[1]];
    return {
      ...baseOption(ctx, pointCount(ctx, 2)),
      tooltip: tooltip(ctx, 'axis', (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as Array<{ dataIndex: number }>;
        const i = list[0]?.dataIndex ?? 0;
        const r = rows[i];
        return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(r?.label ?? '')}</div>${r?.a !== null && r?.a !== undefined ? tooltipRow(names[0]!, fmt(r.a), colors[0]) : ''}${r?.b !== null && r?.b !== undefined ? tooltipRow(names[1]!, fmt(r.b), colors[1]) : ''}`;
      }),
      legend: legend(ctx, names),
      grid: gridBox(ctx, 2),
      xAxis: valueAxis(ctx, 'x', m1, { scale: true }),
      yAxis: { ...categoryAxis(ctx, 'y', dPill, rows.map((r) => r.label)), inverse: !spec.axes.y.reversed },
      series: [
        { type: 'custom', name: 'segment', silent: true, renderItem: segmentRenderer(theme.border, 2), data: rows.map((r, i) => [i, r.a ?? NaN, r.b ?? NaN]), encode: { x: [1, 2], y: 0 }, z: 1 },
        { type: 'scatter', name: names[0], data: rows.map((r, i) => (r.a === null ? null : [r.a, i])), symbolSize: 10, itemStyle: { color: colors[0], borderColor: theme.bg, borderWidth: 1 }, z: 2 },
        { type: 'scatter', name: names[1], data: rows.map((r, i) => (r.b === null ? null : [r.b, i])), symbolSize: 10, itemStyle: { color: colors[1], borderColor: theme.bg, borderWidth: 1 }, z: 2 },
      ],
      __meta: { rows: rows.length },
    };
  },
};
