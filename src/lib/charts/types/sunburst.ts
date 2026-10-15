/** Sunburst (CHARTS.md #16): ≥ 2 D + 1 M; ring order = shelf order. */
import type { ChartDef } from '../registry';
import { baseOption, formatterFor, pointCount, svgIcon, themeOf, tooltip, tooltipRow } from '../option-common';
import { colorRoots, hierarchy } from './treemap';

export const sunburst: ChartDef = {
  id: 'sunburst',
  label: 'Sunburst',
  group: 'part-to-whole',
  icon: svgIcon('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 4v5M12 15v5M4 12h5M15 12h5"/>'),
  requires: { dims: [2, 4], measures: [1, 1] },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['SunburstChart', 'TooltipComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const { roots, dropped, depth, mPill } = hierarchy(ctx);
    const theme = themeOf(ctx);
    const fmt = formatterFor(ctx, mPill);
    return {
      ...baseOption(ctx, pointCount(ctx)),
      tooltip: tooltip(ctx, 'item', (params: unknown) => { const p = params as { name: string; value: number; color: string; treePathInfo?: Array<{ name: string }> }; return tooltipRow((p.treePathInfo ?? []).slice(1).map((t) => t.name).join(' › ') || p.name, fmt(p.value), p.color); }),
      series: [{
        type: 'sunburst',
        data: colorRoots(ctx, roots),
        radius: ['12%', '90%'],
        sort: undefined,
        nodeClick: 'rootToNode',
        itemStyle: { borderColor: theme.bg, borderWidth: 2, opacity: ctx.spec.marks.opacity },
        label: { show: ctx.spec.marks.labels.show || depth <= 2, color: theme.textOnDark, fontSize: 11, minAngle: 8, rotate: 'tangential' },
        emphasis: { focus: 'ancestor' },
      }],
      __meta: { dropped, depth },
    };
  },
};
