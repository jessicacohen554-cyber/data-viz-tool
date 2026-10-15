/**
 * Pie (CHARTS.md #11): D on Color (or the first D) + M on Size (or the first M).
 * Slices beyond 12 fold into "Other" (`theme.border`), negatives are dropped;
 * `__meta` carries both counts for the canvas toast. Shared with `donut`.
 */
import type { BuildContext, ChartDef } from '../registry';
import {
  type OptionObject, MAX_SLICES, baseOption, classify, formatterFor, labelsAndValues, legend, pointCount, seriesColors, svgIcon, themeOf,
  tooltip, tooltipRow,
} from '../option-common';
import { foldSlices, sortByValue } from '../transforms';

/** Pie / donut builder; `radius` is the ECharts radius spec. */
export function buildPie(ctx: BuildContext, radius: string | [string, string], showTotal: boolean): OptionObject {
  const spec = ctx.spec;
  const c = classify(spec);
  const dimPill = (spec.shelves.color[0] && spec.shelves.color[0].role === 'dimension' ? spec.shelves.color[0] : undefined) ?? c.dims[0];
  const mPill = (spec.shelves.size[0] && spec.shelves.size[0].role === 'measure' ? spec.shelves.size[0] : undefined) ?? c.measures[0];
  if (!mPill) throw new Error('pie: needs a measure');
  const { labels, values } = labelsAndValues(ctx, dimPill, mPill);
  const manual = dimPill?.sort?.by === 'manual';
  const sorted = manual ? { labels, values } : sortByValue(labels, values, 'desc');
  const folded = foldSlices(sorted.labels, sorted.values, MAX_SLICES);
  const theme = themeOf(ctx);
  const colors = seriesColors(ctx, folded.labels);
  if (folded.folded > 0) colors[colors.length - 1] = theme.border;
  const fmt = formatterFor(ctx, mPill);
  const total = folded.values.reduce((t, v) => t + v, 0);
  const option: OptionObject = {
    ...baseOption(ctx, pointCount(ctx)),
    tooltip: tooltip(ctx, 'item', (params: unknown) => {
      const p = params as { name: string; value: number; percent: number; color: string };
      return tooltipRow(p.name, `${fmt(p.value)} · ${p.percent.toFixed(1)}%`, p.color);
    }),
    legend: legend(ctx, folded.labels),
    series: [{
      type: 'pie',
      radius,
      center: spec.legend.show && spec.legend.position === 'right' ? ['40%', '50%'] : ['50%', '50%'],
      data: folded.labels.map((name, i) => ({ name, value: folded.values[i] ?? 0, itemStyle: { color: colors[i] ?? theme.border } })),
      // Palette order is the stacking order; ECharts must not re-sort by value (rule R-PALETTE).
      sort: undefined,
      itemStyle: { borderColor: theme.bg, borderWidth: 2, opacity: spec.marks.opacity },
      label: {
        show: spec.marks.labels.show,
        position: spec.marks.labels.position === 'auto' ? 'inside' : spec.marks.labels.position,
        color: theme.text,
        fontSize: 11,
        formatter: (p: { name: string; value: number }) => fmt(p.value),
      },
      labelLine: { show: spec.marks.labels.show && spec.marks.labels.position === 'outside', lineStyle: { color: theme.tick } },
      emphasis: { scale: false, itemStyle: { opacity: 1 } },
    }],
    __meta: { folded: folded.folded, droppedNegative: folded.droppedNegative, total },
  };
  if (showTotal) {
    option.graphic = [{
      type: 'text',
      left: spec.legend.show && spec.legend.position === 'right' ? '40%' : 'center',
      top: 'middle',
      style: { text: fmt(total), fontSize: 20, fontWeight: 700, fontFamily: theme.fontMono, fill: theme.text, textAlign: 'center' },
    }];
  }
  return option;
}

export const pie: ChartDef = {
  id: 'pie',
  label: 'Pie',
  group: 'part-to-whole',
  icon: svgIcon('<circle cx="12" cy="12" r="8"/><path d="M12 4v8l6 5"/>'),
  requires: { dims: [1, 1], measures: [1, 1] },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['PieChart', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => buildPie(ctx, '75%', false),
};
