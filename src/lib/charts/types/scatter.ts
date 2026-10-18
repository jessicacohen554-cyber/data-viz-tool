/**
 * Scatter (CHARTS.md #9): 2 M on Columns/Rows; disaggregated unless a D groups
 * the marks; `large` + `progressive` above 2K points; animation off above 5K.
 * The Shape shelf maps labels to icons (ICONS.md §7): with no Color dimension
 * (or the same field on both) one series per shape so the legend shows the
 * icon, otherwise the icon is picked per point. Trend and reference lines
 * attach through `decorations.ts`. Shared with `bubble` through `buildScatter`.
 */
import type { Pill } from '../../core/types';
import type { BuildContext, ChartDef } from '../registry';
import { applyDecorations, cartesianDecorations, hasDecorations, type DecorationSeries } from '../decorations';
import {
  type OptionObject, DECORATION_MODULES, LARGE_SCATTER_POINTS, axisTooltipFormatter, baseOption, classify, dataZoomInside, dimAccessorFor, escapeHtml, formatterFor,
  gridBox, isDimPill, legend, measuresOn, pillLabel, pointCount, requireMeasure, seriesColors, seriesOrder, styleFonts, svgIcon, themeOf, tooltip, tooltipRow, valueAxis,
} from '../option-common';
import { shapeMap } from '../shapes';
import { type Cell, measureAt } from '../transforms';

/** Symbol sizes by square-root scale within `marks.sizeRange` (area ∝ value); negatives take the smallest size. */
export function sizeScale(values: Array<number | null>, range: [number, number]): (v: number | null) => number {
  const positive = values.filter((v): v is number => v !== null && v > 0);
  const max = positive.length ? Math.max(...positive) : 0;
  const [lo, hi] = range;
  return (v) => (v === null || v <= 0 || max <= 0 ? lo : lo + (hi - lo) * Math.sqrt(v / max));
}

/** Point tuple: x, y, symbol size px, label, raw size value (null without a Size pill), shape label. */
type Point = [number, number, number, string, number | null, string];

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
  const colorPill = spec.shelves.color[0] && isDimPill(spec.shelves.color[0]) ? spec.shelves.color[0] : undefined;
  const shapePill = spec.shelves.shape[0];
  const colorAt = dimAccessorFor(ctx, colorPill);
  const detailAt = dimAccessorFor(ctx, spec.shelves.detail[0]);
  const shapeAt = dimAccessorFor(ctx, shapePill);
  const labelAt = dimAccessorFor(ctx, spec.shelves.label[0]);
  /** One series per shape label when the Shape pill is the only grouping (or shares the Color field): the legend then shows the icons. */
  const splitByShape = Boolean(shapeAt) && (!colorAt || colorPill?.field === shapePill?.field);
  const sizeValues: Array<number | null> = sm ? Array.from({ length: n }, (_, i) => measureAt(sm, i)) : [];
  const size = sizeScale(sizeValues, spec.marks.sizeRange);
  let negativeSizes = 0;
  const groups = new Map<string, Point[]>();
  const order = colorAt && !splitByShape ? seriesOrder(ctx) : undefined;
  if (order) for (const name of order) groups.set(name, []);
  const shapeDomain: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = measureAt(xm, i); const y = measureAt(ym, i);
    if (x === null || y === null) continue;
    const shape = shapeAt ? String(shapeAt(i)) : '';
    if (shapeAt && !shapeDomain.includes(shape)) shapeDomain.push(shape);
    const name = splitByShape ? shape : colorAt ? String(colorAt(i)) : pillLabel(yPill!);
    const sv = sm ? measureAt(sm, i) : null;
    if (sv !== null && sv < 0) negativeSizes++;
    const label = labelAt ? String(labelAt(i)) : detailAt ? String(detailAt(i)) : '';
    (groups.get(name) ?? groups.set(name, []).get(name)!).push([x, y, sm ? size(sv) : 0, label, sv, shape]);
  }
  for (const [k, v] of [...groups]) if (v.length === 0 && order) groups.delete(k);
  const names = [...groups.keys()];
  const shapes = shapeAt ? shapeMap(ctx, shapeDomain) : undefined;
  // Shapes alone do not encode color: every shape series shares the single-mark hue.
  const colors = splitByShape && !colorAt ? names.map(() => seriesColors(ctx, [pillLabel(yPill!)])[0]!) : seriesColors(ctx, names);
  const points = pointCount(ctx);
  const large = points > LARGE_SCATTER_POINTS;
  const theme = themeOf(ctx);
  const fonts = styleFonts(ctx);
  const xFmt = formatterFor(ctx, xPill); const yFmt = formatterFor(ctx, yPill); const sFmt = formatterFor(ctx, sizePill);
  const baseSize = shapes ? shapes.size : Math.max(spec.marks.sizeRange[0], 6);
  const series: OptionObject[] = names.map((name, i) => ({
    type: 'scatter',
    name,
    data: groups.get(name) ?? [],
    symbol: shapes ? (splitByShape ? shapes.symbolOf(name) : (v: unknown[]) => shapes.symbolOf(String(v[5] ?? ''))) : 'circle',
    symbolSize: sm ? (d: Point) => d[2] : baseSize,
    large: large && !shapes,
    largeThreshold: LARGE_SCATTER_POINTS,
    progressive: large ? 4000 : 0,
    itemStyle: { color: colors[i] ?? theme.border, opacity: sm ? Math.min(spec.marks.opacity, 0.75) : spec.marks.opacity, borderColor: theme.bg, borderWidth: large ? 0 : 1 },
    emphasis: { focus: 'series', scale: 1.3 },
    label: { show: spec.marks.labels.show && Boolean(labelAt), position: 'top', color: theme.text, fontSize: fonts.label, fontFamily: fonts.labels, formatter: (p: { value: unknown[] }) => String(p.value[3] ?? '') },
  }));

  // Decorations: every point becomes an x position; each series is sparse over the pooled x so stats and fits see its own points.
  let deco: ReturnType<typeof cartesianDecorations> | undefined;
  if (hasDecorations(spec) && yPill) {
    const allX: number[] = [];
    const sparse: Cell[][] = names.map(() => []);
    names.forEach((name, si) => { for (const pt of groups.get(name) ?? []) { const idx = allX.length; allX.push(pt[0]); sparse.forEach((arr, k) => { arr[idx] = k === si ? pt[1] : null; }); } });
    const dseries: DecorationSeries[] = names.map((name, i) => ({ name, values: sparse[i]!, axis: 'primary', pill: yPill }));
    deco = cartesianDecorations({ spec, theme, horizontal: false, xKind: 'value', x: allX, series: dseries, colors, formatters: names.map(() => yFmt), fontSize: fonts.label });
  }
  const trendRows = deco ? axisTooltipFormatter(ctx, { xKind: 'value', dimFmt: (v) => String(v), fmtFor: () => yFmt, decorations: deco }) : undefined;
  return {
    ...baseOption(ctx, points),
    tooltip: tooltip(ctx, 'item', (params: unknown) => {
      const pt = params as { seriesName: string; seriesType?: string; value: Point; color: string };
      if (pt.seriesType === 'line' && trendRows) return trendRows([pt]);
      const rows = [tooltipRow(pillLabel(xPill!), xFmt(pt.value[0])), tooltipRow(pillLabel(yPill!), yFmt(pt.value[1]))];
      if (sizePill && pt.value[4] !== null) rows.push(tooltipRow(pillLabel(sizePill), sFmt(pt.value[4])));
      const head = pt.value[3] || pt.seriesName;
      return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(head)}</div>${rows.join('')}`;
    }),
    legend: legend(ctx, names, splitByShape ? shapes?.legendIcons : undefined),
    grid: gridBox(ctx, names.length),
    xAxis: valueAxis(ctx, 'x', xPill, { scale: true }),
    yAxis: valueAxis(ctx, 'y', yPill, { scale: true }),
    dataZoom: [...dataZoomInside('x'), ...dataZoomInside('y')],
    series: deco ? applyDecorations(series, deco) : series,
    __meta: { large, points, negativeSizes, seriesCount: names.length, shapeSet: shapes?.set.id ?? null, splitByShape, annotations: deco?.annotations ?? [], ...(deco?.skipped.length ? { notes: deco.skipped } : {}) },
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
  echartsModules: ['ScatterChart', 'GridComponent', 'TooltipComponent', 'LegendComponent', 'DataZoomInsideComponent', ...DECORATION_MODULES, 'CanvasRenderer'],
  build: (ctx) => buildScatter(ctx, false),
};
