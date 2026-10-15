/** Bar (CHARTS.md #1): 1 D on Columns + 1 M on Rows; a color D pivots side-by-side. */
import type { ChartDef } from '../registry';
import { cartesianBars, svgIcon } from '../option-common';

export const bar: ChartDef = {
  id: 'bar',
  label: 'Bar',
  group: 'comparison',
  icon: svgIcon('<rect x="4" y="10" width="4" height="10" rx="1"/><rect x="10" y="4" width="4" height="16" rx="1"/><rect x="16" y="13" width="4" height="7" rx="1"/>'),
  requires: { dims: [1, 3], measures: [1, 1] },
  channels: ['color', 'size', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['BarChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => cartesianBars(ctx),
};
