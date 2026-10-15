/** Funnel (CHARTS.md #13): stages sorted by value desc, or in the D's manual sort order. */
import type { ChartDef } from '../registry';
import { baseOption, classify, formatterFor, labelsAndValues, legend, pointCount, seriesColors, svgIcon, themeOf, tooltip, tooltipRow } from '../option-common';
import { sortByValue } from '../transforms';

export const funnel: ChartDef = {
  id: 'funnel',
  label: 'Funnel',
  group: 'part-to-whole',
  icon: svgIcon('<path d="M4 5h16l-5 7v6l-6 2v-8z"/>'),
  requires: { dims: [1, 1], measures: [1, 1] },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['FunnelChart', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const c = classify(spec);
    const dimPill = (spec.shelves.color[0]?.role === 'dimension' ? spec.shelves.color[0] : undefined) ?? c.dims[0];
    const mPill = (spec.shelves.size[0]?.role === 'measure' ? spec.shelves.size[0] : undefined) ?? c.measures[0];
    if (!mPill) throw new Error('funnel: needs a measure');
    const { labels, values } = labelsAndValues(ctx, dimPill, mPill);
    const manual = dimPill?.sort?.by === 'manual';
    const s = manual ? { labels, values } : sortByValue(labels, values, 'desc');
    const theme = themeOf(ctx);
    const colors = seriesColors(ctx, s.labels);
    const fmt = formatterFor(ctx, mPill);
    return {
      ...baseOption(ctx, pointCount(ctx)),
      tooltip: tooltip(ctx, 'item', (params: unknown) => { const p = params as { name: string; value: number; color: string }; return tooltipRow(p.name, fmt(p.value), p.color); }),
      legend: legend(ctx, s.labels),
      series: [{
        type: 'funnel',
        sort: manual ? 'none' : 'descending',
        gap: 2,
        left: 16, right: spec.legend.show && spec.legend.position === 'right' ? 140 : 16, top: 20, bottom: 20,
        data: s.labels.map((name, i) => ({ name, value: s.values[i] ?? 0, itemStyle: { color: colors[i] ?? theme.border } })),
        itemStyle: { borderColor: theme.bg, borderWidth: 1, opacity: spec.marks.opacity },
        label: { show: spec.marks.labels.show, position: spec.marks.labels.position === 'auto' ? 'inside' : spec.marks.labels.position, color: theme.text, fontSize: 11, formatter: (p: { value: number }) => fmt(p.value) },
        emphasis: { focus: 'self' },
      }],
    };
  },
};
