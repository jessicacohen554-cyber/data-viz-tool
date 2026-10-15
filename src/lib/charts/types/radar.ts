/** Radar (CHARTS.md #26): one polygon per D value, one axis per M (≥ 3), each axis with its own max. */
import type { ChartDef } from '../registry';
import {
  baseOption, classify, escapeHtml, formatterFor, legend, pillLabel, pointCount, requireDim, requireMeasure, seriesColors, svgIcon, themeOf, tooltip, tooltipRow,
} from '../option-common';
import { dimAccessor, measureAt } from '../transforms';

export const radar: ChartDef = {
  id: 'radar',
  label: 'Radar',
  group: 'relationship',
  icon: svgIcon('<path d="M12 3l8 6-3 10H7L4 9z"/><path d="M12 7l4 3-1.5 5h-5L8 10z" fill="currentColor" fill-opacity="0.2"/>'),
  requires: { dims: [1, 1], measures: [3, 8], exact: (spec) => (classify(spec).measures.length < 3 ? 'Needs 3 measures' : null) },
  channels: ['color', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['RadarChart', 'RadarComponent', 'TooltipComponent', 'LegendComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const c = classify(spec);
    const dPill = (spec.shelves.color[0]?.role === 'dimension' ? spec.shelves.color[0] : undefined) ?? c.dims[0];
    const dim = requireDim(ctx, dPill, 'the series dimension');
    const ms = c.measures.map((p) => ({ pill: p, m: requireMeasure(ctx, p, pillLabel(p)), fmt: formatterFor(ctx, p) }));
    const at = dimAccessor(dim);
    const n = ctx.result.groups;
    const names: string[] = [];
    const data: Array<{ name: string; value: Array<number | null> }> = [];
    for (let i = 0; i < n; i++) { const name = String(at(i)); names.push(name); data.push({ name, value: ms.map((e) => measureAt(e.m, i)) }); }
    const theme = themeOf(ctx);
    const colors = seriesColors(ctx, names);
    return {
      ...baseOption(ctx, pointCount(ctx, ms.length)),
      tooltip: tooltip(ctx, 'item', (params: unknown) => {
        const p = params as { name: string; value: Array<number | null>; color: string };
        return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(p.name)}</div>${ms.map((e, k) => (p.value[k] === null ? '' : tooltipRow(pillLabel(e.pill), e.fmt(p.value[k]!), p.color))).join('')}`;
      }),
      legend: legend(ctx, names),
      radar: {
        indicator: ms.map((e) => { const vals = data.map((d) => d.value[ms.indexOf(e)]).filter((v): v is number => v !== null); return { name: pillLabel(e.pill), max: vals.length ? Math.max(...vals) * 1.05 : 1 }; }),
        shape: 'polygon',
        radius: '65%',
        center: spec.legend.show && spec.legend.position === 'right' ? ['40%', '52%'] : ['50%', '52%'],
        axisName: { color: theme.textMuted, fontSize: 11 },
        splitLine: { lineStyle: { color: theme.grid } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: theme.borderLight } },
      },
      series: [{
        type: 'radar',
        data: data.map((d, i) => ({ ...d, itemStyle: { color: colors[i] ?? theme.border }, lineStyle: { color: colors[i] ?? theme.border, width: spec.marks.lineWidth }, areaStyle: { color: colors[i] ?? theme.border, opacity: 0.08 } })),
        symbol: 'circle',
        symbolSize: 5,
        emphasis: { focus: 'series' },
      }],
      __meta: { series: names.length, axes: ms.length, labelsRequired: names.length > 8 },
    };
  },
};
