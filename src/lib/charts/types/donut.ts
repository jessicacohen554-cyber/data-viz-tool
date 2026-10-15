/** Donut (CHARTS.md #12): pie with `radius: ['55%', '80%']` and the formatted total in the hole. */
import type { ChartDef } from '../registry';
import { svgIcon } from '../option-common';
import { buildPie } from './pie';

export const donut: ChartDef = {
  id: 'donut',
  label: 'Donut',
  group: 'part-to-whole',
  icon: svgIcon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v4.5M15.2 12.8l5.1 3"/>'),
  requires: { dims: [1, 1], measures: [1, 1] },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['PieChart', 'GraphicComponent', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => buildPie(ctx, ['55%', '80%'], true),
};
