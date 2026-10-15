/**
 * Waterfall (CHARTS.md #22): transparent base + colored delta per D value in
 * the D's result order (never alphabetised here), a trailing "Total" bar.
 * Colors are fixed semantics: positive, negative, total (navy).
 */
import type { ChartDef } from '../registry';
import {
  baseOption, categoryAxis, classify, dimsOn, escapeHtml, formatterFor, gridBox, measuresOn, labelsAndValues, pointCount, seriesLabel, svgIcon, themeOf, tooltip,
  tooltipRow, valueAxis,
} from '../option-common';
import { runningTotal } from '../transforms';

export const waterfall: ChartDef = {
  id: 'waterfall',
  label: 'Waterfall',
  group: 'comparison',
  icon: svgIcon('<rect x="3" y="12" width="3" height="8"/><rect x="8" y="6" width="3" height="6"/><rect x="13" y="8" width="3" height="5"/><rect x="18" y="4" width="3" height="16"/>'),
  requires: { dims: [1, 1], measures: [1, 1] },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['BarChart', 'GridComponent', 'TooltipComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const dPill = dimsOn(spec, 'columns')[0] ?? classify(spec).dims[0];
    const mPill = measuresOn(spec, 'rows')[0] ?? classify(spec).measures[0];
    if (!mPill) throw new Error('waterfall: needs a measure');
    const { labels, values } = labelsAndValues(ctx, dPill, mPill);
    const w = runningTotal(labels, values);
    const theme = themeOf(ctx);
    const fmt = formatterFor(ctx, mPill);
    const signed = w.kind.map((k, i) => (k === 'down' ? -(w.delta[i] ?? 0) : (w.delta[i] ?? 0)));
    const colorOf = (k: 'up' | 'down' | 'total') => (k === 'up' ? theme.positive : k === 'down' ? theme.negative : theme.navy);
    return {
      ...baseOption(ctx, pointCount(ctx)),
      tooltip: tooltip(ctx, 'axis', (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as Array<{ seriesName: string; dataIndex: number; name: string }>;
        const i = list[0]?.dataIndex ?? 0;
        const k = w.kind[i] ?? 'up';
        return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(w.labels[i] ?? '')}</div>${tooltipRow(k === 'total' ? 'Total' : 'Change', fmt(k === 'total' ? (w.delta[i] ?? 0) * Math.sign((w.base[i] ?? 0) + (w.delta[i] ?? 0) || 1) : (signed[i] ?? 0)), colorOf(k))}`;
      }),
      grid: gridBox(ctx, 1),
      xAxis: categoryAxis(ctx, 'x', dPill, w.labels),
      yAxis: valueAxis(ctx, 'y', mPill),
      series: [
        { type: 'bar', name: 'base', stack: 'wf', silent: true, data: w.base, itemStyle: { color: 'transparent', borderColor: 'transparent' }, emphasis: { itemStyle: { color: 'transparent' } }, barMaxWidth: 48, barCategoryGap: `${Math.round(spec.marks.barGap * 100)}%` },
        {
          type: 'bar', name: 'change', stack: 'wf', barMaxWidth: 48,
          data: w.delta.map((d, i) => (d === null ? null : { value: d, itemStyle: { color: colorOf(w.kind[i] ?? 'up'), opacity: spec.marks.opacity, borderRadius: w.kind[i] === 'down' ? [0, 0, 4, 4] : [4, 4, 0, 0] } })),
          label: seriesLabel(ctx, fmt, 'top', (p) => { const i = (p as { dataIndex?: number }).dataIndex ?? 0; return w.kind[i] === 'total' ? (w.delta[i] ?? 0) : (signed[i] ?? null); }),
        },
      ],
      __meta: { steps: labels.length },
    };
  },
};
