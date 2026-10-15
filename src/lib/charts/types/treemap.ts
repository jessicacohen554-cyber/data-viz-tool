/**
 * Treemap (CHARTS.md #15): the D pills in shelf order (Columns, Rows, Color,
 * Detail) become the hierarchy; zero/negative sizes dropped; `leafDepth` 1 with
 * drill-down. Shared with `sunburst` through `hierarchy()`.
 */
import type { Pill } from '../../core/types';
import type { BuildContext, ChartDef } from '../registry';
import { classify, dimOf, requireMeasure, seriesColors, svgIcon, themeOf, formatterFor, baseOption, pointCount, tooltip, tooltipRow } from '../option-common';
import { type TreeNode, toTree } from '../transforms';

/** Build the nested tree for the spec's dimensions (shelf order = hierarchy order). */
export function hierarchy(ctx: BuildContext): { roots: TreeNode[]; dropped: number; depth: number; mPill: Pill } {
  const c = classify(ctx.spec);
  const mPill = (ctx.spec.shelves.size[0]?.role === 'measure' ? ctx.spec.shelves.size[0] : undefined) ?? c.measures[0];
  if (!mPill) throw new Error(`${ctx.spec.chartType}: needs a measure`);
  const m = requireMeasure(ctx, mPill, 'the measure');
  const dims = c.dims.map((p) => dimOf(ctx, p)).filter((d): d is NonNullable<typeof d> => d !== undefined);
  if (dims.length === 0) throw new Error(`${ctx.spec.chartType}: needs a dimension`);
  const { roots, dropped } = toTree(ctx.result.groups, dims, m);
  return { roots, dropped, depth: dims.length, mPill };
}

/** Attach a fixed color per top-level node (color follows the entity, rule R-PALETTE). */
export function colorRoots(ctx: BuildContext, roots: TreeNode[]): Array<TreeNode & { itemStyle: { color: string } }> {
  const colors = seriesColors(ctx, roots.map((r) => r.name));
  const theme = themeOf(ctx);
  return roots.map((r, i) => ({ ...r, itemStyle: { color: colors[i] ?? theme.border } }));
}

export const treemap: ChartDef = {
  id: 'treemap',
  label: 'Treemap',
  group: 'part-to-whole',
  icon: svgIcon('<rect x="3" y="4" width="10" height="16" rx="1"/><rect x="15" y="4" width="6" height="8" rx="1"/><rect x="15" y="14" width="6" height="6" rx="1"/>'),
  requires: { dims: [1, 4], measures: [1, 1] },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['TreemapChart', 'TooltipComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const { roots, dropped, depth, mPill } = hierarchy(ctx);
    const theme = themeOf(ctx);
    const fmt = formatterFor(ctx, mPill);
    return {
      ...baseOption(ctx, pointCount(ctx)),
      tooltip: tooltip(ctx, 'item', (params: unknown) => { const p = params as { name: string; value: number; color: string; treePathInfo?: Array<{ name: string }> }; return tooltipRow((p.treePathInfo ?? []).slice(1).map((t) => t.name).join(' › ') || p.name, fmt(p.value), p.color); }),
      series: [{
        type: 'treemap',
        data: colorRoots(ctx, roots),
        leafDepth: depth > 1 ? 1 : undefined,
        roam: false,
        nodeClick: depth > 1 ? 'zoomToNode' : false,
        breadcrumb: { show: depth > 1, bottom: 4, itemStyle: { color: theme.bg, borderColor: theme.border, textStyle: { color: theme.text } } },
        left: 8, right: 8, top: 8, bottom: depth > 1 ? 36 : 8,
        itemStyle: { borderColor: theme.bg, borderWidth: 2, gapWidth: 2, opacity: ctx.spec.marks.opacity },
        label: { show: true, color: theme.textOnDark, fontSize: 11, formatter: (p: { name: string; value: number }) => (ctx.spec.marks.labels.show ? `${p.name}\n${fmt(p.value)}` : p.name) },
        upperLabel: { show: depth > 1, height: 20, color: theme.textOnDark, fontSize: 11 },
        levels: [{ itemStyle: { borderWidth: 0, gapWidth: 2 } }, { colorSaturation: [0.4, 0.75], itemStyle: { gapWidth: 1 } }],
        emphasis: { focus: 'ancestor' },
      }],
      __meta: { dropped, depth, tooDeep: depth > 4 },
    };
  },
};
