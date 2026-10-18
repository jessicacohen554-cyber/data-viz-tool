/**
 * 100 % stacked area (CHARTS.md #35): each x column as shares of its total;
 * negatives are excluded from the denominator (`__meta.excludedNegatives`
 * tells the canvas to toast), the y axis is fixed to 0–100 %.
 */
import type { ChartDef } from '../registry';
import { DECORATION_MODULES, cartesianLines, svgIcon } from '../option-common';

export const area100: ChartDef = {
  id: 'area-100',
  label: '100% stacked area',
  group: 'trend',
  icon: svgIcon('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 14l6-3 6 4 6-6" fill="currentColor" fill-opacity="0.2"/><path d="M3 20v-6l6-3 6 4 6-6v11z" fill="currentColor" fill-opacity="0.3"/>'),
  requires: { dims: [1, 3], measures: [1, 6] },
  channels: ['color', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['LineChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'DataZoomInsideComponent', ...DECORATION_MODULES, 'CanvasRenderer'],
  build: (ctx) => cartesianLines(ctx, { area: true, stack: true, percent: true }),
};
