/** Sankey (CHARTS.md #28): ≥ 2 D (shelf order) + 1 M; adjacent-level links; nodes colored by palette per level label. */
import type { ChartDef } from '../registry';
import { baseOption, classify, formatterFor, pointCount, requireDim, requireMeasure, seriesColors, svgIcon, themeOf, tooltip, tooltipRow } from '../option-common';
import { adjacentLinks } from '../transforms';

export const sankey: ChartDef = {
  id: 'sankey',
  label: 'Sankey',
  group: 'flow',
  icon: svgIcon('<path d="M3 6h5c4 0 4 6 8 6h5M3 12h5c4 0 4 6 8 6h5M3 18h5c4 0 4-12 8-12h5" />'),
  requires: { dims: [2, 4], measures: [1, 1] },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['SankeyChart', 'TooltipComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const c = classify(spec);
    const mPill = (spec.shelves.size[0]?.role === 'measure' ? spec.shelves.size[0] : undefined) ?? c.measures[0];
    const dims = c.dims.map((p) => requireDim(ctx, p, p.field));
    const m = requireMeasure(ctx, mPill, 'the measure');
    const g = adjacentLinks(ctx.result.groups, dims, m);
    const names = [...new Set(g.nodes.map((nd) => nd.name))];
    const colors = seriesColors(ctx, names);
    const colorOf = new Map(names.map((nm, i) => [nm, colors[i] ?? '']));
    const theme = themeOf(ctx);
    const fmt = formatterFor(ctx, mPill);
    return {
      ...baseOption(ctx, pointCount(ctx)),
      tooltip: tooltip(ctx, 'item', (params: unknown) => {
        const p = params as { dataType: string; name: string; value: number; data: { source?: string; target?: string } };
        if (p.dataType === 'edge') { const s = g.nodes.find((nd) => nd.id === p.data.source)?.name ?? ''; const t = g.nodes.find((nd) => nd.id === p.data.target)?.name ?? ''; return tooltipRow(`${s} → ${t}`, fmt(p.value)); }
        return tooltipRow(g.nodes.find((nd) => nd.id === p.name)?.name ?? p.name, fmt(p.value));
      }),
      series: [{
        type: 'sankey',
        left: 16, right: 80, top: 16, bottom: 16,
        nodeWidth: 14, nodeGap: 10,
        draggable: false,
        data: g.nodes.map((nd) => ({ name: nd.id, depth: nd.level, itemStyle: { color: colorOf.get(nd.name) || theme.border, borderColor: theme.bg }, label: { formatter: nd.name } })),
        links: g.links,
        lineStyle: { color: 'gradient', opacity: 0.3, curveness: 0.5 },
        // Node names are identity, not a value label: always shown (text tokens, never series color).
        label: { show: true, color: theme.text, fontSize: 11 },
        emphasis: { focus: 'adjacency' },
      }],
      __meta: { nodes: g.nodes.length, links: g.links.length, droppedNegative: g.droppedNegative },
    };
  },
};
