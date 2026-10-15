/** Bubble (CHARTS.md #10): scatter with a size M; symbol area follows a square-root scale within `marks.sizeRange`. */
import type { ChartDef } from '../registry';
import { svgIcon } from '../option-common';
import { buildScatter } from './scatter';

export const bubble: ChartDef = {
  id: 'bubble',
  label: 'Bubble',
  group: 'relationship',
  icon: svgIcon('<circle cx="8" cy="14" r="4"/><circle cx="16" cy="8" r="2.5"/><circle cx="17" cy="16" r="1.5"/>'),
  requires: { dims: [0, 3], measures: [3, 3], exact: (spec) => (spec.shelves.size[0] && spec.shelves.size[0].role === 'measure' ? null : 'Needs a measure on Size') },
  channels: ['color', 'size', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  needs: { disaggregate: true },
  echartsModules: ['ScatterChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'DataZoomInsideComponent', 'CanvasRenderer'],
  build: (ctx) => buildScatter(ctx, true),
};
