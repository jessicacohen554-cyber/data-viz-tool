/**
 * Candlestick (CHARTS.md #31): 1 T on Columns + 4 M on Rows **in order** open,
 * close, low, high; rows violating `low ≤ open,close ≤ high` are dropped and
 * counted (`__meta.dropped`); rising `--positive`, falling `--negative`;
 * `dataZoom` inside. The pill order is validated by `requires.exact`.
 */
import type { ChartDef } from '../registry';
import {
  baseOption, dataZoomInside, dimFormatter, dimsOn, escapeHtml, formatterFor, gridBox, measuresOn, pillLabel, pointCount, requireDim, requireMeasure, svgIcon,
  themeOf, tooltip, tooltipRow, valueAxis, axisFor, classify,
} from '../option-common';
import { ohlc } from '../transforms';

/** The four measures in the expected order, or a reason. */
export function ohlcPills(spec: Parameters<ChartDef['build']>[0]['spec']): { pills: [typeof spec.shelves.rows[0], typeof spec.shelves.rows[0], typeof spec.shelves.rows[0], typeof spec.shelves.rows[0]] } | { reason: string } {
  const ms = measuresOn(spec, 'rows');
  if (ms.length !== 4) return { reason: `Needs 4 measures on Rows (open, close, low, high); has ${ms.length}` };
  return { pills: [ms[0]!, ms[1]!, ms[2]!, ms[3]!] };
}

export const candlestick: ChartDef = {
  id: 'candlestick',
  label: 'Candlestick',
  group: 'trend',
  icon: svgIcon('<path d="M7 3v4M7 15v6M17 3v3M17 13v8"/><rect x="5" y="7" width="4" height="8"/><rect x="15" y="6" width="4" height="7" fill="currentColor"/>'),
  requires: {
    dims: [1, 2], measures: [4, 4], dates: [1, 1],
    exact: (spec) => { const r = ohlcPills(spec); return 'reason' in r ? r.reason : null; },
  },
  channels: ['color', 'tooltip'],
  renderer: 'echarts',
  echartsModules: ['CandlestickChart', 'GridComponent', 'TooltipComponent', 'DataZoomInsideComponent', 'CanvasRenderer'],
  build: (ctx) => {
    const spec = ctx.spec;
    const r = ohlcPills(spec);
    if ('reason' in r) throw new Error(r.reason);
    const tPill = dimsOn(spec, 'columns').find((p) => p.date) ?? classify(spec).dates[0];
    const tDim = requireDim(ctx, tPill, 'the date');
    const ms = r.pills.map((p) => requireMeasure(ctx, p, pillLabel(p))) as [ReturnType<typeof requireMeasure>, ReturnType<typeof requireMeasure>, ReturnType<typeof requireMeasure>, ReturnType<typeof requireMeasure>];
    const { rows, dropped } = ohlc(ctx.result.groups, tDim, ms);
    const theme = themeOf(ctx);
    const fmt = formatterFor(ctx, r.pills[0]);
    const tFmt = dimFormatter(ctx, tPill);
    const extra = (spec.marks.extra.candlestick ?? {}) as { upColor?: string; downColor?: string };
    const isTime = tPill?.date?.mode === 'trunc';
    const names = ['Open', 'Close', 'Low', 'High'];
    return {
      ...baseOption(ctx, pointCount(ctx)),
      tooltip: tooltip(ctx, 'axis', (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as Array<{ value: number[]; axisValue: string | number; dataIndex: number }>;
        const p = list[0];
        if (!p) return '';
        const row = rows[p.dataIndex];
        const vals = row ? [row[1], row[2], row[3], row[4]] : [];
        return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(row ? tFmt(row[0]) : '')}</div>${vals.map((v, k) => tooltipRow(names[k]!, fmt(v))).join('')}`;
      }),
      grid: gridBox(ctx, 1),
      xAxis: isTime ? axisFor(ctx, 'x', tPill, []) : { ...axisFor(ctx, 'x', tPill, rows.map((rw) => rw[0])), boundaryGap: true },
      yAxis: valueAxis(ctx, 'y', r.pills[0], { scale: true }),
      dataZoom: dataZoomInside('x'),
      series: [{
        type: 'candlestick',
        name: pillLabel(r.pills[0]),
        data: rows.map((rw) => (isTime ? [rw[0], rw[1], rw[2], rw[3], rw[4]] : [rw[1], rw[2], rw[3], rw[4]])),
        itemStyle: { color: extra.upColor ?? theme.positive, color0: extra.downColor ?? theme.negative, borderColor: extra.upColor ?? theme.positive, borderColor0: extra.downColor ?? theme.negative, borderWidth: 1 },
        barMaxWidth: 12,
      }],
      __meta: { rows: rows.length, dropped },
    };
  },
};
