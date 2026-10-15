/** Parallel coordinates (CHARTS.md #27): one axis per M in shelf order, one line per row (or Detail group), colored by the Color D. */
import type { ChartDef } from '../registry';
import {
  baseOption, classify, dimAccessorFor, formatterFor, legend, pillLabel, pointCount, requireMeasure, seriesColors, seriesOrder, svgIcon, themeOf, tooltip, tooltipRow,
} from '../option-common';
import { measureAt } from '../transforms';

export const parallel: ChartDef = {
  id: 'parallel',
  label: 'Parallel coordinates',
  group: 'relationship',
  icon: svgIcon('<path d="M5 4v16M12 4v16M19 4v16"/><path d="M5 8l7 6 7-4M5 14l7-7 7 9"/>'),
  requires: { dims: [0, 2], measures: [2, 8] },
  channels: ['color', 'tooltip'],
  renderer: 'echarts',
  needs: { disaggregate: true },
  echartsModules: ['ParallelChart', 'ParallelComponent', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const c = classify(spec);
    const ms = c.measures.map((p) => ({ pill: p, m: requireMeasure(ctx, p, pillLabel(p)), fmt: formatterFor(ctx, p) }));
    const colorAt = dimAccessorFor(ctx, spec.shelves.color[0]);
    const n = ctx.result.groups;
    const groups = new Map<string, Array<Array<number | null>>>();
    const order = seriesOrder(ctx);
    if (order) for (const name of order) groups.set(name, []);
    for (let i = 0; i < n; i++) {
      const name = colorAt ? String(colorAt(i)) : 'All rows';
      (groups.get(name) ?? groups.set(name, []).get(name)!).push(ms.map((e) => measureAt(e.m, i)));
    }
    const names = [...groups.keys()];
    const colors = seriesColors(ctx, names);
    const theme = themeOf(ctx);
    const points = pointCount(ctx, ms.length);
    return {
      ...baseOption(ctx, points),
      tooltip: tooltip(ctx, 'item', (params: unknown) => {
        const p = params as { seriesName: string; value: Array<number | null>; color: string };
        return `<div style="color:${theme.textMuted};margin-bottom:4px">${p.seriesName}</div>${ms.map((e, k) => (p.value[k] === null ? '' : tooltipRow(pillLabel(e.pill), e.fmt(p.value[k]!), p.color))).join('')}`;
      }),
      legend: legend(ctx, names),
      parallel: { left: 40, right: spec.legend.show && names.length >= 2 && spec.legend.position === 'right' ? 140 : 40, top: 40, bottom: 24, parallelAxisDefault: { type: 'value', nameLocation: 'start', nameTextStyle: { color: theme.textMuted, fontSize: 11 }, axisLine: { lineStyle: { color: theme.border } }, axisTick: { show: false }, axisLabel: { color: theme.axisText, fontSize: 10 }, splitLine: { show: false } } },
      parallelAxis: ms.map((e, k) => ({ dim: k, name: pillLabel(e.pill), axisLabel: { formatter: (v: number) => e.fmt(v) } })),
      series: names.map((name, i) => ({
        type: 'parallel', name, data: groups.get(name) ?? [],
        lineStyle: { color: colors[i] ?? theme.border, width: Math.max(1, spec.marks.lineWidth - 1), opacity: Math.min(spec.marks.opacity, 0.4) },
        progressive: points > 2000 ? 500 : 0,
        emphasis: { lineStyle: { width: 3, opacity: 1 } },
      })),
      __meta: { lines: n, axes: ms.length, capped: ctx.isMobile && n > 20000 },
    };
  },
};
