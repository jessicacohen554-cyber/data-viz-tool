/**
 * 100 % stacked bar (CHARTS.md #5): each cell as a share of its column; negatives
 * are excluded from the denominator (`__meta.excludedNegatives` tells the canvas to toast).
 */
import type { ChartDef } from '../registry';
import { cartesianBars, cartesianPivot, svgIcon } from '../option-common';
import { percentStack } from '../transforms';

export const barStacked100: ChartDef = {
  id: 'bar-stacked-100',
  label: '100% stacked bar',
  group: 'comparison',
  icon: svgIcon('<rect x="4" y="4" width="5" height="16"/><path d="M4 11h5M4 15h5"/><rect x="15" y="4" width="5" height="16"/><path d="M15 9h5M15 16h5"/>'),
  requires: { dims: [2, 3], measures: [1, 1], colorDim: true },
  channels: ['color', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['BarChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const { pivot } = cartesianPivot(ctx, false);
    const { pivot: pct, excludedNegatives } = percentStack(pivot);
    const option = cartesianBars(ctx, { stack: 'percent' });
    const series = option.series as Array<Record<string, unknown>>;
    pct.series.forEach((s, i) => { const target = series[i]; if (target) target.data = s.values; });
    option.__meta = { ...(option.__meta as Record<string, unknown>), excludedNegatives };
    return option;
  },
};
