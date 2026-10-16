/**
 * Slope (CHARTS.md #29): a D with exactly 2 values on Columns + 1 M + color D;
 * a line per color value between the two x positions. The 2-value check names
 * the offending field ("`year` has 7 values; needs 2 — add a filter").
 */
import type { ChartDef } from '../registry';
import { DECORATION_MODULES, PAIR_COLORS, cartesianLines, classify, dimOf, dimsOn, measuresOn, pillLabel, requireDim, requireMeasure, seriesColors, seriesOrder, svgIcon, themeOf } from '../option-common';
import { distinct, pivot } from '../transforms';

export const slope: ChartDef = {
  id: 'slope',
  label: 'Slope',
  group: 'trend',
  icon: svgIcon('<path d="M5 4v16M19 4v16"/><path d="M5 8l14 6M5 14l14-8M5 17l14 1"/>'),
  requires: {
    dims: [2, 2], measures: [1, 1], colorDim: true,
    exact: (spec, meta) => {
      const d = dimsOn(spec, 'columns')[0];
      if (!d) return 'Needs a dimension on Columns';
      const m = meta.find((f) => f.name === d.field);
      if (m && !d.date && m.cardinality !== 2 && m.cardinality > 0) return `${d.field} has ${m.cardinality} values; needs 2 — add a filter`;
      return null;
    },
  },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['LineChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'LabelLayout', ...DECORATION_MODULES, 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const xPill = dimsOn(spec, 'columns')[0] ?? classify(spec).dims[0];
    const mPill = measuresOn(spec, 'rows')[0] ?? classify(spec).measures[0];
    if (!mPill) throw new Error('slope: needs a measure');
    const xDim = requireDim(ctx, xPill, 'Columns');
    const m = requireMeasure(ctx, mPill, 'the measure');
    const xs = distinct(xDim, ctx.result.groups);
    if (xs.length !== 2) throw new Error(`${xPill?.field ?? 'the dimension'} has ${xs.length} values; needs 2 — add a filter`);
    const p = pivot(ctx.result.groups, xDim, dimOf(ctx, spec.shelves.color[0]), m, pillLabel(mPill), seriesOrder(ctx));
    const names = p.series.map((s) => s.name);
    const colors = names.length === 2 ? [...PAIR_COLORS] : seriesColors(ctx, names);
    const option = cartesianLines(ctx, { pivot: p, xPill, mPill, colors, showPoints: true, smooth: false });
    // Two x positions: labels at both ends read better than a legend box alone.
    for (const s of option.series as Array<Record<string, unknown>>) {
      s.endLabel = { show: true, formatter: '{a}', color: themeOf(ctx).text, fontSize: 11, distance: 6 };
      s.labelLayout = { moveOverlap: 'shiftY' };
    }
    delete option.dataZoom;
    return option;
  },
};
