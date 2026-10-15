/**
 * Heatmap (CHARTS.md #17): D on Columns × D on Rows, the Color M fills a dense
 * matrix; null groups are empty cells; sequential ramp (diverging when the
 * encoding carries a midpoint). Cells always draw a `--border-light` border.
 */
import type { ChartDef } from '../registry';
import {
  baseOption, categoryAxis, classify, dimFormatter, dimsOn, escapeHtml, formatterFor, gridBox, pointCount, requireDim, requireMeasure,
  seriesLabel, svgIcon, themeOf, tooltip, tooltipRow, visualMap,
} from '../option-common';
import { grid } from '../transforms';

export const heatmap: ChartDef = {
  id: 'heatmap',
  label: 'Heatmap',
  group: 'table',
  icon: svgIcon('<rect x="4" y="4" width="5" height="5"/><rect x="10" y="4" width="5" height="5" fill="currentColor" fill-opacity="0.3"/><rect x="16" y="4" width="4" height="5" fill="currentColor" fill-opacity="0.7"/><rect x="4" y="10" width="5" height="5" fill="currentColor" fill-opacity="0.5"/><rect x="10" y="10" width="5" height="5"/><rect x="16" y="10" width="4" height="5" fill="currentColor" fill-opacity="0.2"/><rect x="4" y="16" width="5" height="4" fill="currentColor" fill-opacity="0.8"/><rect x="10" y="16" width="5" height="4" fill="currentColor" fill-opacity="0.4"/><rect x="16" y="16" width="4" height="4"/>'),
  requires: { dims: [2, 2], measures: [1, 1] },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['HeatmapChart', 'GridComponent', 'TooltipComponent', 'VisualMapComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const c = classify(spec);
    const xPill = dimsOn(spec, 'columns')[0] ?? c.dims[0];
    const yPill = dimsOn(spec, 'rows')[0] ?? c.dims.find((d) => d.id !== xPill?.id);
    const mPill = (spec.shelves.color[0]?.role === 'measure' ? spec.shelves.color[0] : undefined) ?? c.measures[0];
    const xDim = requireDim(ctx, xPill, 'Columns');
    const yDim = requireDim(ctx, yPill, 'Rows');
    const m = requireMeasure(ctx, mPill, 'the color measure');
    const g = grid(ctx.result.groups, xDim, yDim, m);
    const theme = themeOf(ctx);
    const fmt = formatterFor(ctx, mPill);
    const xFmt = dimFormatter(ctx, xPill); const yFmt = dimFormatter(ctx, yPill);
    const cells = g.xs.length * g.ys.length;
    return {
      ...baseOption(ctx, g.cells.length),
      tooltip: tooltip(ctx, 'item', (params: unknown) => {
        const p = params as { value: [number, number, number] };
        return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(xFmt(g.xs[p.value[0]] ?? ''))} · ${escapeHtml(yFmt(g.ys[p.value[1]] ?? ''))}</div>${tooltipRow(mPill ? fmt(p.value[2]) : '', '')}`;
      }),
      grid: gridBox(ctx, 2, { bottom: spec.legend.position === 'right' ? 12 : 56 }),
      xAxis: { ...categoryAxis(ctx, 'x', xPill, g.xs), splitArea: { show: false } },
      yAxis: { ...categoryAxis(ctx, 'y', yPill, g.ys), splitArea: { show: false } },
      visualMap: visualMap(ctx, g.min, g.max, fmt),
      series: [{
        type: 'heatmap',
        data: g.cells,
        itemStyle: { borderColor: theme.borderLight, borderWidth: 1, opacity: spec.marks.opacity },
        label: seriesLabel(ctx, fmt, 'inside', (p) => (Array.isArray(p.value) ? Number(p.value[2]) : null)),
        emphasis: { itemStyle: { borderColor: theme.navy, borderWidth: 2 } },
        progressive: cells > 5000 ? 2000 : 0,
      }],
      __meta: { cells, min: g.min, max: g.max, tooManyCellsMobile: ctx.isMobile && cells > 5000 },
    };
  },
};
