/** Stacked area (CHARTS.md #34): always stacked, whatever `marks.stacking` says; one series per color value or measure. */
import type { ChartDef } from '../registry';
import { DECORATION_MODULES, cartesianLines, svgIcon } from '../option-common';

export const areaStacked: ChartDef = {
  id: 'area-stacked',
  label: 'Stacked area',
  group: 'trend',
  icon: svgIcon('<path d="M3 19V12l5-4 4 2 5-5 4 3v11z" fill="currentColor" fill-opacity="0.2"/><path d="M3 19v-3l5-3 4 2 5-4 4 2v6z" fill="currentColor" fill-opacity="0.35"/>'),
  requires: { dims: [1, 3], measures: [1, 6] },
  channels: ['color', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['LineChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'DataZoomInsideComponent', ...DECORATION_MODULES, 'CanvasRenderer'],
  build: (ctx) => cartesianLines(ctx, { area: true, stack: true }),
};
