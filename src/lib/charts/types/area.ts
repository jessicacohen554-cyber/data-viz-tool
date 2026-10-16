/** Area (CHARTS.md #7): stacked unless `marks.stacking` is `none` (then overlaid at opacity ≤ 0.5). */
import type { ChartDef } from '../registry';
import { DECORATION_MODULES, cartesianLines, svgIcon } from '../option-common';

export const area: ChartDef = {
  id: 'area',
  label: 'Area',
  group: 'trend',
  icon: svgIcon('<path d="M3 19V13l5-5 4 3 5-6 4 4v10z" fill="currentColor" fill-opacity="0.25"/>'),
  requires: { dims: [1, 3], measures: [1, 1] },
  channels: ['color', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['LineChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'DataZoomInsideComponent', ...DECORATION_MODULES, 'CanvasRenderer'],
  build: (ctx) => cartesianLines(ctx, { area: true, stack: ctx.spec.marks.stacking !== 'none' }),
};
