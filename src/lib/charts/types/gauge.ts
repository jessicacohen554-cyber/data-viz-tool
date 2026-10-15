/**
 * Gauge (CHARTS.md #14): one M, no D; a second M is the target tick. Domain is
 * `marks.extra.gauge.{min,max}` or `[0, 1.1·value]` rounded to a clean step.
 */
import type { ChartDef } from '../registry';
import { baseOption, classify, formatterFor, pillLabel, requireMeasure, svgIcon, themeOf, tooltip, tooltipRow } from '../option-common';
import { measureAt } from '../transforms';

/** Round `v` up to a "nice" number (1, 2, 2.5, 5 × 10ⁿ). */
export function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const f = v / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

export const gauge: ChartDef = {
  id: 'gauge',
  label: 'Gauge',
  group: 'part-to-whole',
  icon: svgIcon('<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16l4-6"/><circle cx="12" cy="16" r="1.2"/>'),
  requires: { dims: [0, 0], measures: [1, 2] },
  channels: ['label', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['GaugeChart', 'TooltipComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    // The target may ride on Tooltip (Show Me puts M₂ there); dedupe by pill id.
    const all = [...classify(spec).measures, ...spec.shelves.tooltip.filter((p) => p.role === 'measure')].filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
    const [mPill, targetPill] = all;
    const m = requireMeasure(ctx, mPill, 'the measure');
    const value = measureAt(m, 0) ?? 0;
    const tm = targetPill ? requireMeasure(ctx, targetPill, 'the target') : undefined;
    const target = tm ? measureAt(tm, 0) : null;
    const extra = (spec.marks.extra.gauge ?? {}) as { min?: number; max?: number };
    const min = extra.min ?? 0;
    const max = extra.max ?? niceCeil(Math.max(Math.abs(value), target ?? 0) * 1.1);
    const theme = themeOf(ctx);
    const fmt = formatterFor(ctx, mPill);
    const series: Record<string, unknown>[] = [{
      type: 'gauge',
      min, max,
      startAngle: 210, endAngle: -30,
      radius: '90%', center: ['50%', '60%'],
      progress: { show: true, width: 14, roundCap: true, itemStyle: { color: theme.accent } },
      axisLine: { lineStyle: { width: 14, color: [[1, theme.grid]] } },
      axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { color: theme.axisText, fontSize: 11, distance: 20, formatter: (v: number) => fmt(v) },
      pointer: { show: false },
      anchor: { show: false },
      title: { show: true, offsetCenter: [0, '30%'], color: theme.textMuted, fontSize: 12 },
      detail: { valueAnimation: false, offsetCenter: [0, '0%'], color: theme.text, fontSize: 28, fontWeight: 700, fontFamily: theme.fontMono, formatter: (v: number) => fmt(v) },
      data: [{ value, name: pillLabel(mPill!) }],
    }];
    if (target !== null && targetPill) {
      series.push({
        type: 'gauge', min, max, startAngle: 210, endAngle: -30, radius: '90%', center: ['50%', '60%'],
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        pointer: { show: true, length: '20%', width: 4, offsetCenter: [0, '-78%'], itemStyle: { color: theme.navy } },
        detail: { show: false }, title: { show: false },
        data: [{ value: target, name: pillLabel(targetPill) }],
      });
    }
    return {
      ...baseOption(ctx, 1),
      tooltip: tooltip(ctx, 'item', (params: unknown) => { const p = params as { name: string; value: number }; return tooltipRow(p.name, fmt(p.value)); }),
      series,
      __meta: { min, max, value, target },
    };
  },
};
