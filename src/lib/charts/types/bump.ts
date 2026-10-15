/** Bump (CHARTS.md #30): rank of the M per x (inverted y), smooth lines, one per color value; ties keep palette order. */
import type { ChartDef } from '../registry';
import { cartesianLines, cartesianPivot, svgIcon, themeOf } from '../option-common';
import { rankPerX } from '../transforms';

export const bump: ChartDef = {
  id: 'bump',
  label: 'Bump',
  group: 'trend',
  icon: svgIcon('<path d="M4 6c5 0 5 6 8 6s3-6 8-6M4 12c5 0 5 6 8 6s3-6 8-6M4 18c5 0 5-6 8-6s3 6 8 6"/>'),
  requires: { dims: [2, 2], measures: [1, 1], dates: [1, 1], colorDim: true },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['LineChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'DataZoomInsideComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const { pivot, xPill, mPill } = cartesianPivot(ctx, false);
    const option = cartesianLines(ctx, { pivot: rankPerX(pivot), xPill, mPill, smooth: true, inverted: true, showPoints: true });
    for (const s of option.series as Array<Record<string, unknown>>) {
      s.symbolSize = 10;
      s.endLabel = { show: true, formatter: '{a}', color: themeOf(ctx).text, fontSize: 11, distance: 6 };
    }
    return option;
  },
};
