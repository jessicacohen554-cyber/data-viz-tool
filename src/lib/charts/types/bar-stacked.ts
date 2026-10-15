/** Stacked bar (CHARTS.md #4): stacking order is palette order, never re-sorted by value (rule R-PALETTE). */
import type { ChartDef } from '../registry';
import { cartesianBars, svgIcon } from '../option-common';

export const barStacked: ChartDef = {
  id: 'bar-stacked',
  label: 'Stacked bar',
  group: 'comparison',
  icon: svgIcon('<rect x="4" y="12" width="5" height="8"/><rect x="4" y="7" width="5" height="5"/><rect x="15" y="9" width="5" height="11"/><rect x="15" y="4" width="5" height="5"/>'),
  requires: { dims: [2, 3], measures: [1, 1], colorDim: true },
  channels: ['color', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['BarChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => cartesianBars(ctx, { stack: 'stack' }),
};
