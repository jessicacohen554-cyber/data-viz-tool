/**
 * Histogram (CHARTS.md #20): a binned M on Columns (bins come from the worker
 * via `QueryPlan.dims[].bin`) + the count measure on Rows; a color D stacks the
 * bins; `barGap: 0`; empty bins are kept zero-height.
 */
import type { ChartDef } from '../registry';
import { cartesianBars, dimsOn, svgIcon, themeOf } from '../option-common';

export const histogram: ChartDef = {
  id: 'histogram',
  label: 'Histogram',
  group: 'distribution',
  icon: svgIcon('<rect x="3" y="14" width="3" height="6"/><rect x="6" y="9" width="3" height="11"/><rect x="9" y="4" width="3" height="16"/><rect x="12" y="7" width="3" height="13"/><rect x="15" y="12" width="3" height="8"/><rect x="18" y="16" width="3" height="4"/>'),
  requires: {
    dims: [1, 2], measures: [1, 1],
    exact: (spec) => (dimsOn(spec, 'columns').some((p) => p.bin) || dimsOn(spec, 'rows').some((p) => p.bin) ? null : 'Needs a binned measure on Columns'),
  },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['BarChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const stack = ctx.spec.shelves.color[0]?.role === 'dimension' ? 'stack' : 'none';
    const option = cartesianBars(ctx, { stack });
    for (const s of option.series as Array<Record<string, unknown>>) {
      s.barGap = '0%';
      s.barCategoryGap = '0%';
      s.barMaxWidth = undefined;
      const style = s.itemStyle as Record<string, unknown>;
      style.borderRadius = 0;
      style.borderColor = themeOf(ctx).bg;
      style.borderWidth = 1;
      const data = s.data as Array<number | null>;
      s.data = data.map((v) => (v === null ? 0 : v));
    }
    return option;
  },
};
