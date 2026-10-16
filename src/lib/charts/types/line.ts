/** Line (CHARTS.md #6): 1 C/T on Columns + 1 M; LTTB above 2K points; `marks.nullHandling` for gaps. */
import type { ChartDef } from '../registry';
import { DECORATION_MODULES, cartesianLines, svgIcon } from '../option-common';

export const line: ChartDef = {
  id: 'line',
  label: 'Line',
  group: 'trend',
  icon: svgIcon('<path d="M3 17l5-6 4 3 5-8 4 5"/>'),
  requires: { dims: [1, 3], measures: [1, 1] },
  channels: ['color', 'size', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['LineChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'DataZoomInsideComponent', ...DECORATION_MODULES, 'CanvasRenderer'],
  build: (ctx) => cartesianLines(ctx),
};
