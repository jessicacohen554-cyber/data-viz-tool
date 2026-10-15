/** Streamgraph (CHARTS.md #8): `themeRiver` over `[date, value, name]` triples; needs a `trunc` date with ≥ 3 values. */
import type { ChartDef } from '../registry';
import {
  baseOption, dimsOn, dimFormatter, dimOf, escapeHtml, formatterFor, legend, measuresOn, pillLabel, pointCount, requireDim,
  requireMeasure, seriesColors, seriesOrder, svgIcon, themeOf, tooltip, tooltipRow,
} from '../option-common';
import { pivot, sortByX } from '../transforms';

export const streamgraph: ChartDef = {
  id: 'streamgraph',
  label: 'Streamgraph',
  group: 'trend',
  icon: svgIcon('<path d="M3 12c4-6 8 2 12-3s4 1 6 0v8c-4 2-8-3-12 1s-4 1-6 0z" fill="currentColor" fill-opacity="0.25"/>'),
  requires: {
    dims: [2, 3], measures: [1, 1], dates: [1, 1], colorDim: true,
    exact: (spec) => {
      const t = [...spec.shelves.columns, ...spec.shelves.rows].find((p) => p.date);
      return t && t.date?.mode !== 'trunc' ? 'Needs a continuous date' : null;
    },
  },
  channels: ['color', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['ThemeRiverChart', 'SingleAxisComponent', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const tPill = [...spec.shelves.columns, ...spec.shelves.rows].find((p) => p.date) ?? dimsOn(spec, 'columns')[0];
    const mPill = measuresOn(spec, 'rows')[0] ?? measuresOn(spec, 'columns')[0];
    const colorPill = spec.shelves.color[0];
    const tDim = requireDim(ctx, tPill, 'the date');
    const m = requireMeasure(ctx, mPill, 'the measure');
    const p = sortByX(pivot(ctx.result.groups, tDim, dimOf(ctx, colorPill), m, pillLabel(mPill!), seriesOrder(ctx)));
    if (p.x.length < 3) throw new Error('Streamgraph needs at least 3 dates');
    const names = p.series.map((s) => s.name);
    const colors = seriesColors(ctx, names);
    const fmt = formatterFor(ctx, mPill);
    const tFmt = dimFormatter(ctx, tPill);
    const theme = themeOf(ctx);
    const data: Array<[string | number, number, string]> = [];
    p.series.forEach((s) => s.values.forEach((v, xi) => { if (v !== null) data.push([p.x[xi]!, v, s.name]); }));
    return {
      ...baseOption(ctx, pointCount(ctx, names.length)),
      color: colors,
      tooltip: tooltip(ctx, 'axis', (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as Array<{ seriesName: string; value: [string | number, number, string]; color: string }>;
        const head = list[0]?.value?.[0];
        return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(head === undefined ? '' : tFmt(head))}</div>${list.map((pt) => tooltipRow(pt.value[2], fmt(pt.value[1]), pt.color)).join('')}`;
      }),
      legend: legend(ctx, names),
      singleAxis: { type: 'time', top: 20, bottom: 36, left: 16, right: spec.legend.show && spec.legend.position === 'right' ? 140 : 16, axisLabel: { color: theme.axisText, formatter: (v: number) => tFmt(v) }, axisLine: { lineStyle: { color: theme.border } }, splitLine: { show: false } },
      series: [{ type: 'themeRiver', data, label: { show: false }, itemStyle: { opacity: spec.marks.opacity }, emphasis: { itemStyle: { shadowBlur: 0 } } }],
      __meta: { seriesCount: names.length },
    };
  },
};
