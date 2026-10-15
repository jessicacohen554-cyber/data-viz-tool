/** Horizontal bar (CHARTS.md #2): M on Columns, D on Rows; long labels truncate with a full-name tooltip. */
import type { ChartDef } from '../registry';
import { cartesianBars, svgIcon } from '../option-common';

export const barH: ChartDef = {
  id: 'bar-h',
  label: 'Horizontal bar',
  group: 'comparison',
  icon: svgIcon('<rect x="4" y="4" width="10" height="4" rx="1"/><rect x="4" y="10" width="16" height="4" rx="1"/><rect x="4" y="16" width="7" height="4" rx="1"/>'),
  requires: { dims: [1, 3], measures: [1, 1] },
  channels: ['color', 'size', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['BarChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => cartesianBars(ctx, { horizontal: true }),
};
