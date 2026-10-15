/** Lollipop (CHARTS.md #24): a 2px stem (bar) + a scatter head per D value; Size M scales the head. */
import type { ChartDef } from '../registry';
import {
  baseOption, categoryAxis, classify, dimsOn, escapeHtml, formatterFor, gridBox, measuresOn, labelsAndValues, pointCount, requireMeasure, seriesColors, seriesLabel,
  svgIcon, themeOf, tooltip, tooltipRow, valueAxis,
} from '../option-common';
import { measureCells } from '../transforms';
import { sizeScale } from './scatter';

export const lollipop: ChartDef = {
  id: 'lollipop',
  label: 'Lollipop',
  group: 'comparison',
  icon: svgIcon('<path d="M6 20v-8M12 20V6M18 20v-5"/><circle cx="6" cy="10" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="18" cy="13" r="2"/>'),
  requires: { dims: [1, 1], measures: [1, 2] },
  channels: ['color', 'size', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['BarChart', 'ScatterChart', 'GridComponent', 'TooltipComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const dPill = dimsOn(spec, 'columns')[0] ?? classify(spec).dims[0];
    const mPill = measuresOn(spec, 'rows')[0] ?? classify(spec).measures[0];
    const sPill = spec.shelves.size[0]?.role === 'measure' ? spec.shelves.size[0] : undefined;
    if (!mPill) throw new Error('lollipop: needs a measure');
    const { labels, values } = labelsAndValues(ctx, dPill, mPill);
    const sizes = sPill ? measureCells(requireMeasure(ctx, sPill, 'the size'), labels.length) : [];
    const size = sizeScale(sizes, [8, Math.max(8, spec.marks.sizeRange[1] / 2)]);
    const theme = themeOf(ctx);
    const colors = seriesColors(ctx, labels);
    const single = colors.length <= 1 || !spec.shelves.color[0] ? theme.accent : undefined;
    const fmt = formatterFor(ctx, mPill);
    return {
      ...baseOption(ctx, pointCount(ctx, 2)),
      tooltip: tooltip(ctx, 'axis', (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as Array<{ dataIndex: number }>;
        const i = list[0]?.dataIndex ?? 0;
        return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(labels[i] ?? '')}</div>${tooltipRow(fmt(values[i] ?? 0), '', single ?? colors[i])}`;
      }),
      grid: gridBox(ctx, 1),
      xAxis: categoryAxis(ctx, 'x', dPill, labels),
      yAxis: valueAxis(ctx, 'y', mPill),
      series: [
        { type: 'bar', name: 'stem', data: values, barWidth: 2, silent: true, itemStyle: { color: theme.tick }, z: 1 },
        {
          type: 'scatter', name: 'head', data: values.map((v, i) => (v === null ? null : [i, v])),
          symbolSize: sPill ? (d: [number, number]) => size(sizes[d[0]] ?? null) : 10,
          itemStyle: { color: single ?? ((p: { dataIndex: number }) => colors[p.dataIndex] ?? theme.border), opacity: spec.marks.opacity, borderColor: theme.bg, borderWidth: 1 },
          label: seriesLabel(ctx, fmt, 'top'),
          z: 2,
        },
      ],
    };
  },
};
