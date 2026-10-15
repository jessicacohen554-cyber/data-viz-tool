/**
 * Scatter (CHARTS.md #9): 2 M on Columns/Rows; disaggregated unless a D groups
 * the marks; `large` + `progressive` above 2K points; animation off above 5K.
 * Shared with `bubble` through `buildScatter`.
 */
import type { Pill } from '../../core/types';
import type { BuildContext, ChartDef } from '../registry';
import {
  type OptionObject, LARGE_SCATTER_POINTS, baseOption, classify, dataZoomInside, dimAccessorFor, escapeHtml, formatterFor, gridBox, legend,
  measuresOn, pillLabel, pointCount, requireMeasure, seriesColors, seriesOrder, svgIcon, themeOf, tooltip, tooltipRow, valueAxis,
} from '../option-common';
import { measureAt } from '../transforms';

/** Symbol sizes by square-root scale within `marks.sizeRange` (area ∝ value); negatives take the smallest size. */
export function sizeScale(values: Array<number | null>, range: [number, number]): (v: number | null) => number {
  const positive = values.filter((v): v is number => v !== null && v > 0);
  const max = positive.length ? Math.max(...positive) : 0;
  const [lo, hi] = range;
  return (v) => (v === null || v <= 0 || max <= 0 ? lo : lo + (hi - lo) * Math.sqrt(v / max));
}

/** Scatter / bubble builder. */
export function buildScatter(ctx: BuildContext, withSize: boolean): OptionObject {
  const spec = ctx.spec;
  const xPill = measuresOn(spec, 'columns')[0];
  const yPill = measuresOn(spec, 'rows')[0] ?? classify(spec).measures.filter((m) => m.id !== xPill?.id)[0];
  const sizePill: Pill | undefined = withSize ? spec.shelves.size[0] : undefined;
  const xm = requireMeasure(ctx, xPill, 'the x measure');
  const ym = requireMeasure(ctx, yPill, 'the y measure');
  const sm = sizePill ? requireMeasure(ctx, sizePill, 'the size measure') : undefined;
  const n = ctx.result.groups;
  const colorAt = dimAccessorFor(ctx, spec.shelves.color[0]);
  const detailAt = dimAccessorFor(ctx, spec.shelves.detail[0]);
  const shapeAt = dimAccessorFor(ctx, spec.shelves.shape[0]);
  const labelAt = dimAccessorFor(ctx, spec.shelves.label[0]);
  const sizeValues: Array<number | null> = sm ? Array.from({ length: n }, (_, i) => measureAt(sm, i)) : [];
  const size = sizeScale(sizeValues, spec.marks.sizeRange);
  let negativeSizes = 0;
  /** Point tuple: x, y, symbol size px, label, raw size value (null without a Size pill). */
  type Point = [number, number, number, string, number | null];
  const groups = new Map<string, Point[]>();
  const order = seriesOrder(ctx);
  if (order) for (const name of order) groups.set(name, []);
  for (let i = 0; i < n; i++) {
    const x = measureAt(xm, i); const y = measureAt(ym, i);
    if (x === null || y === null) continue;
    const name = colorAt ? String(colorAt(i)) : pillLabel(yPill!);
    const sv = sm ? measureAt(sm, i) : null;
    if (sv !== null && sv < 0) negativeSizes++;
    const label = labelAt ? String(labelAt(i)) : detailAt ? String(detailAt(i)) : '';
    (groups.get(name) ?? groups.set(name, []).get(name)!).push([x, y, sm ? size(sv) : 0, label, sv]);
  }
  const names = [...groups.keys()];
  const colors = seriesColors(ctx, names);
  const shapes = ['circle', 'rect', 'triangle', 'diamond', 'pin', 'arrow', 'roundRect', 'emptyCircle', 'emptyRect', 'emptyTriangle'];
  const shapeDomain: string[] = [];
  if (shapeAt) for (let i = 0; i < n; i++) { const s = String(shapeAt(i)); if (!shapeDomain.includes(s)) shapeDomain.push(s); }
  const points = pointCount(ctx);
  const large = points > LARGE_SCATTER_POINTS;
  const theme = themeOf(ctx);
  const xFmt = formatterFor(ctx, xPill); const yFmt = formatterFor(ctx, yPill); const sFmt = formatterFor(ctx, sizePill);
  const baseSize = Math.max(spec.marks.sizeRange[0], 6);
  const series = names.map((name, i) => ({
    type: 'scatter',
    name,
    data: groups.get(name) ?? [],
    symbol: shapeAt ? (p: unknown) => shapes[Math.max(0, shapeDomain.indexOf(String((p as unknown[])[3])))] ?? 'circle' : 'circle',
    symbolSize: sm ? (d: Point) => d[2] : baseSize,
    large,
    largeThreshold: LARGE_SCATTER_POINTS,
    progressive: large ? 4000 : 0,
    itemStyle: { color: colors[i] ?? theme.border, opacity: sm ? Math.min(spec.marks.opacity, 0.75) : spec.marks.opacity, borderColor: theme.bg, borderWidth: large ? 0 : 1 },
    emphasis: { focus: 'series', scale: 1.3 },
    label: { show: spec.marks.labels.show && Boolean(labelAt), position: 'top', color: theme.text, fontSize: 11, formatter: (p: { value: unknown[] }) => String(p.value[3] ?? '') },
  }));
  return {
    ...baseOption(ctx, points),
    tooltip: tooltip(ctx, 'item', (params: unknown) => {
      const pt = params as { seriesName: string; value: Point; color: string };
      const rows = [tooltipRow(pillLabel(xPill!), xFmt(pt.value[0])), tooltipRow(pillLabel(yPill!), yFmt(pt.value[1]))];
      if (sizePill && pt.value[4] !== null) rows.push(tooltipRow(pillLabel(sizePill), sFmt(pt.value[4])));
      const head = pt.value[3] || pt.seriesName;
      return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(head)}</div>${rows.join('')}`;
    }),
    legend: legend(ctx, names),
    grid: gridBox(ctx, names.length),
    xAxis: valueAxis(ctx, 'x', xPill, { scale: true }),
    yAxis: valueAxis(ctx, 'y', yPill, { scale: true }),
    dataZoom: [...dataZoomInside('x'), ...dataZoomInside('y')],
    series,
    __meta: { large, points, negativeSizes, seriesCount: names.length },
  };
}

export const scatter: ChartDef = {
  id: 'scatter',
  label: 'Scatter',
  group: 'relationship',
  icon: svgIcon('<circle cx="7" cy="15" r="1.6"/><circle cx="11" cy="9" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="9" cy="18" r="1.6"/>'),
  requires: { dims: [0, 3], measures: [2, 2] },
  channels: ['color', 'size', 'shape', 'label', 'detail', 'tooltip'],
  renderer: 'echarts',
  needs: { disaggregate: true },
  echartsModules: ['ScatterChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'DataZoomInsideComponent', 'CanvasRenderer'],
  build: (ctx) => buildScatter(ctx, false),
};
