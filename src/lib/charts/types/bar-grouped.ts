/** Grouped bar (CHARTS.md #3): one series per color value, `barGap: '10%'`; a missing combination is a gap, never zero. */
import type { ChartDef } from '../registry';
import { cartesianBars, svgIcon } from '../option-common';

export const barGrouped: ChartDef = {
  id: 'bar-grouped',
  label: 'Grouped bar',
  group: 'comparison',
  icon: svgIcon('<rect x="3" y="9" width="3" height="11"/><rect x="7" y="5" width="3" height="15"/><rect x="14" y="12" width="3" height="8"/><rect x="18" y="7" width="3" height="13"/>'),
  requires: { dims: [2, 3], measures: [1, 1], colorDim: true },
  channels: ['color', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['BarChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => cartesianBars(ctx, { stack: 'none' }),
};
