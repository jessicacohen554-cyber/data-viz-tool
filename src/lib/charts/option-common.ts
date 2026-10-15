/**
 * Shared pieces every chart builder composes: the Observatory theme (CSS token
 * values passed in by the canvas, with a fallback mirror of `app.css`), pill
 * classification, result lookup through `pillKeyMap`, formatter and palette
 * wiring, and the ECharts option fragments (tooltip, legend, grid, axes,
 * visualMap, labels, dataZoom) plus the two cartesian builders (bars, lines)
 * that most of the library reuses.
 *
 * Rules applied here (CONSUMES, dataviz skill): thin marks, no dual axis,
 * categorical hues in fixed order, text in text tokens never series color,
 * legend for ≥ 2 series, hover tooltip by default (`click` on touch),
 * `transitionDuration: 0`, `confine: true`, animation off above 5K points or
 * on mobile. Framework-free (rule R-PURE).
 */
import type { FieldMeta, FormatSpec, Pill, QueryResult, ResultDim, ResultMeasure, ShelfId, VizSpec } from '../core/types';
import { AGGREGATION_LABEL } from '../core/constants';
import { pillKeyMap } from '../core/query-of';
import { makeFormatter, type ValueFormatter } from '../format/formatter';
import { pickPalette, type ColorEncoding } from '../palette/pick';
import type { BuildContext } from './registry';
import { type Cell, type Pivot, dimAccessor, measureCells, pivot, sortByX } from './transforms';

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/** Resolved CSS token values the option builders may use (ECharts cannot read `var()`). */
export interface ChartTheme {
  bg: string;
  grid: string;
  tick: string;
  axisText: string;
  text: string;
  textMuted: string;
  textOnDark: string;
  border: string;
  borderLight: string;
  positive: string;
  negative: string;
  navy: string;
  /** Default single-series color (`--hydro`). */
  accent: string;
  fontBody: string;
  fontMono: string;
}

/**
 * Mirror of the `app.css` tokens, used when no theme is passed (tests, SSR).
 * The canvas reads the live computed values and passes them in `BuildContext.theme`.
 */
export const DEFAULT_THEME: ChartTheme = {
  bg: '#FFFFFF',
  grid: '#eef1f4',
  tick: '#8a93a0',
  axisText: '#566370',
  text: '#1E293B',
  textMuted: '#566370',
  textOnDark: '#FFFFFF',
  border: '#D4D8E0',
  borderLight: '#E5E7EB',
  positive: '#16A34A',
  negative: '#DC2626',
  navy: '#1A2744',
  accent: '#0EA5E9',
  fontBody: "'DM Sans', 'Plus Jakarta Sans', 'Helvetica Neue', sans-serif",
  fontMono: "'JetBrains Mono', 'SF Mono', 'Consolas', monospace",
};

/**
 * Fallback categorical order (docs/PALETTES.md §1 `observatory`) used only
 * while `pickPalette` (S2) still answers `kind: 'none'` for a discrete Color
 * pill. Fixed order, never cycled (rule R-PALETTE).
 */
export const FALLBACK_CATEGORICAL: readonly string[] = [
  '#F59E0B', '#22C55E', '#0EA5E9', '#6366F1', '#6B7280', '#374151', '#E67E22', '#26A69A', '#10B981', '#92400E', '#D97706', '#009688',
];

/** Fallback sequential ramp (the sky steps that anchor `--hydro`, `--info`, `--hydro-text`) until S2's `seq-sky` lands. */
export const FALLBACK_SEQUENTIAL: readonly string[] = ['#F0F9FF', '#BAE6FD', '#7DD3FC', '#38BDF8', '#0EA5E9', '#0284C7', '#0369A1'];

/** The two-color pair for dumbbell and slope (`pairs-amber-indigo`, PALETTES.md §4). */
export const PAIR_COLORS: readonly [string, string] = ['#F59E0B', '#6366F1'];

/** Animation is disabled above this many points (CHARTS.md "Common behaviour"). */
export const ANIMATION_MAX_POINTS = 5000;
/** Scatter switches to `large` / `progressive` rendering above this many points. */
export const LARGE_SCATTER_POINTS = 2000;
/** Lines sample with LTTB above this many points per series. */
export const LTTB_MIN_POINTS = 2000;
/** Pie/donut fold slices beyond this count into "Other". */
export const MAX_SLICES = 12;

/** A 24×24 stroke icon for the picker from path data; colour comes from `currentColor`. */
export function svgIcon(body: string): string {
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Theme of a context (falls back to the mirror). */
export function themeOf(ctx: BuildContext): ChartTheme {
  return ctx.theme ?? DEFAULT_THEME;
}

// ---------------------------------------------------------------------------
// Pills
// ---------------------------------------------------------------------------

/** A pill acting as a group-by dimension: dimension role or a binned measure. */
export function isDimPill(p: Pill): boolean {
  return p.role === 'dimension' || p.bin !== undefined;
}

/** A pill acting as an aggregated measure. */
export function isMeasurePill(p: Pill): boolean {
  return !isDimPill(p);
}

/** A date pill (carries a date treatment). */
export function isDatePill(p: Pill): boolean {
  return p.date !== undefined;
}

/** A pill that draws a continuous axis: a `trunc` date or an unbinned measure. */
export function isContinuousPill(p: Pill): boolean {
  return (p.date !== undefined && p.date.mode === 'trunc') || (isMeasurePill(p) && p.continuity === 'continuous');
}

/** Shelves whose pills take part in the viz (everything but filters), in CHARTS.md §3 order. */
export const VIZ_SHELVES: readonly ShelfId[] = ['columns', 'rows', 'color', 'size', 'label', 'detail', 'tooltip', 'shape'];

/** Pill classes of a spec, used by Show Me and the builders. */
export interface PillClasses {
  /** Dimension pills on Columns, Rows, Color, Detail, Shape (shelf order). */
  dims: Pill[];
  /** Measure pills on Columns, Rows, Color, Size, Label (shelf order). */
  measures: Pill[];
  /** Date pills among `dims`. */
  dates: Pill[];
  colorPill: Pill | undefined;
  sizePill: Pill | undefined;
  labelPill: Pill | undefined;
  shapePill: Pill | undefined;
}

/** Classify the pills of a spec. */
export function classify(spec: VizSpec): PillClasses {
  const sh = spec.shelves;
  const dims: Pill[] = [];
  const measures: Pill[] = [];
  for (const s of ['columns', 'rows', 'color', 'detail', 'shape'] as const) for (const p of sh[s]) if (isDimPill(p)) dims.push(p);
  for (const s of ['columns', 'rows', 'color', 'size', 'label'] as const) for (const p of sh[s]) if (isMeasurePill(p)) measures.push(p);
  return {
    dims,
    measures,
    dates: dims.filter(isDatePill),
    colorPill: sh.color[0],
    sizePill: sh.size[0],
    labelPill: sh.label[0],
    shapePill: sh.shape[0],
  };
}

/** Dimension pills on one shelf. */
export function dimsOn(spec: VizSpec, shelf: ShelfId): Pill[] {
  return spec.shelves[shelf].filter(isDimPill);
}

/** Measure pills on one shelf. */
export function measuresOn(spec: VizSpec, shelf: ShelfId): Pill[] {
  return spec.shelves[shelf].filter(isMeasurePill);
}

/** First dimension pill across Columns, Rows, Color, Detail. */
export function firstDim(spec: VizSpec): Pill | undefined {
  return classify(spec).dims[0];
}

/** Display name of a pill: alias, else Tableau's `AGG(field)` / `LEVEL(field)` form. */
export function pillLabel(p: Pill): string {
  if (p.alias) return p.alias;
  if (p.date) return `${p.date.level.toUpperCase()}(${p.field})`;
  if (p.bin) return `${p.field} (bin)`;
  if (p.role === 'measure' && p.aggregation !== 'none') return `${AGGREGATION_LABEL[p.aggregation]}(${p.field})`;
  return p.field;
}

// ---------------------------------------------------------------------------
// Result lookup
// ---------------------------------------------------------------------------

/** Result dimension carrying a pill's data (duplicates share a key via `pillKeyMap`). */
export function dimOf(ctx: BuildContext, pill: Pill | undefined): ResultDim | undefined {
  if (!pill) return undefined;
  const key = pillKeyMap(ctx.spec).get(pill.id) ?? pill.id;
  return ctx.result.dims.find((d) => d.key === key);
}

/** Result measure carrying a pill's data. */
export function measureOf(ctx: BuildContext, pill: Pill | undefined): ResultMeasure | undefined {
  if (!pill) return undefined;
  const key = pillKeyMap(ctx.spec).get(pill.id) ?? pill.id;
  return ctx.result.measures.find((m) => m.key === key);
}

/** Row accessor for a dimension pill's values, or `undefined` when the pill is absent or not in the result. */
export function dimAccessorFor(ctx: BuildContext, pill: Pill | undefined): ((i: number) => string | number) | undefined {
  const d = pill && isDimPill(pill) ? dimOf(ctx, pill) : undefined;
  return d ? dimAccessor(d) : undefined;
}

/** Like `dimOf` but throws a readable error: a builder cannot proceed without it. */
export function requireDim(ctx: BuildContext, pill: Pill | undefined, what: string): ResultDim {
  const d = dimOf(ctx, pill);
  if (!d) throw new Error(`${ctx.spec.chartType}: result has no dimension for ${what}${pill ? ` (${pillLabel(pill)})` : ''}`);
  return d;
}

/** Like `measureOf` but throws a readable error. */
export function requireMeasure(ctx: BuildContext, pill: Pill | undefined, what: string): ResultMeasure {
  const m = measureOf(ctx, pill);
  if (!m) throw new Error(`${ctx.spec.chartType}: result has no measure for ${what}${pill ? ` (${pillLabel(pill)})` : ''}`);
  return m;
}

/** Number of result rows. */
export function rowCount(result: QueryResult): number {
  return result.groups;
}

// ---------------------------------------------------------------------------
// Formatting and color
// ---------------------------------------------------------------------------

/** FieldMeta for a field, or a minimal stand-in when the dataset metadata lacks it (fixtures). */
export function metaOf(ctx: BuildContext, field: string): FieldMeta {
  const m = ctx.meta.find((f) => f.name === field);
  if (m) return m;
  return {
    name: field, index: -1, type: 'string', role: 'dimension', defaultContinuity: 'discrete', defaultAggregation: 'count',
    storage: 'dict', rowCount: 0, nullCount: 0, cardinality: 0, highCardinality: false, min: null, max: null, topValues: [],
    dateFormat: null, dateAmbiguous: false, parseErrors: 0, confidence: 0,
  };
}

/** The FormatSpec in force for a pill: `Pill.format`, else the field default. */
export function formatSpecOf(ctx: BuildContext, pill: Pill): FormatSpec | undefined {
  return pill.format ?? ctx.spec.fieldFormats[pill.field];
}

/** Formatter for a pill's values (raw numbers / epoch ms / labels in, display string out). */
export function formatterFor(ctx: BuildContext, pill: Pill | undefined): ValueFormatter {
  if (!pill) return (v) => (v === null || v === undefined ? '' : String(v));
  return makeFormatter(metaOf(ctx, pill.field), formatSpecOf(ctx, pill));
}

/** Formatter for a dimension axis: labels pass through; numeric (trunc date / bin) values go through the pill's formatter. */
export function dimFormatter(ctx: BuildContext, pill: Pill | undefined): (v: string | number) => string {
  const f = formatterFor(ctx, pill);
  return (v) => (typeof v === 'number' ? f(v) : v);
}

/** Resolve the Color shelf through `pickPalette` for the current chart. */
export function colorEncoding(ctx: BuildContext): ColorEncoding {
  const pill = ctx.spec.shelves.color[0];
  return pickPalette(pill, pill ? metaOf(ctx, pill.field) : undefined, ctx.spec.palette, ctx.result, ctx.spec.chartType);
}

/**
 * Fixed-order color per series name. Honours a categorical encoding's map and
 * `overrides`; otherwise assigns the fallback order by series position. Beyond
 * the set's length the color is `theme.border` (never cycled, rule R-PALETTE).
 */
export function seriesColors(ctx: BuildContext, names: string[]): string[] {
  const enc = colorEncoding(ctx);
  const theme = themeOf(ctx);
  const overrides = ctx.spec.palette.overrides ?? {};
  if (enc.kind === 'categorical') return names.map((n) => overrides[n] ?? enc.map[n] ?? theme.border);
  if (names.length <= 1) return [enc.kind === 'none' ? enc.color : theme.accent];
  return names.map((n, i) => overrides[n] ?? FALLBACK_CATEGORICAL[i] ?? theme.border);
}

/** Series order for a discrete Color pill: the palette domain when known, else first appearance. */
export function seriesOrder(ctx: BuildContext): string[] | undefined {
  const enc = colorEncoding(ctx);
  return enc.kind === 'categorical' ? enc.domain : undefined;
}

/** Gradient stops for a continuous color: the encoding's stops, else the fallback sequential ramp. */
export function continuousStops(ctx: BuildContext): { stops: string[]; domain?: [number, number]; midpoint?: number } {
  const enc = colorEncoding(ctx);
  if (enc.kind === 'continuous') {
    const out: { stops: string[]; domain?: [number, number]; midpoint?: number } = { stops: enc.stops, domain: enc.domain };
    if (enc.midpoint !== undefined) out.midpoint = enc.midpoint;
    return out;
  }
  return { stops: [...FALLBACK_SEQUENTIAL] };
}

/** Parse `#rrggbb` to `[r, g, b]`. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `[r, g, b]` to `#rrggbb`. */
export function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
}

/** Color at `t ∈ [0, 1]` along a stop list (piecewise-linear in sRGB between perceptually spaced stops). */
export function interpolateStops(stops: readonly string[], t: number): string {
  if (stops.length === 0) return '#000000';
  if (stops.length === 1) return stops[0]!;
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  const f = x - i;
  const a = hexToRgb(stops[i]!); const b = hexToRgb(stops[i + 1]!);
  return rgbToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
}

/** WCAG relative luminance of a hex color. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Text color that reads on `bg`: dark text on light cells, white on dark (contrast-rule, CHARTS.md #19). */
export function textOn(bg: string, theme: ChartTheme): string {
  const L = luminance(bg);
  const contrastDark = (L + 0.05) / (luminance(theme.text) + 0.05);
  const contrastLight = (luminance(theme.textOnDark) + 0.05) / (L + 0.05);
  return contrastDark >= contrastLight ? theme.text : theme.textOnDark;
}

// ---------------------------------------------------------------------------
// Option fragments
// ---------------------------------------------------------------------------

/** Loose ECharts option / series object. */
export type OptionObject = Record<string, unknown>;

/** Total marks drawn (groups × series); decides animation and large mode. */
export function pointCount(ctx: BuildContext, seriesCount = 1): number {
  return ctx.result.groups * Math.max(1, seriesCount);
}

/** Root option: surface, text style, animation policy. */
export function baseOption(ctx: BuildContext, points: number): OptionObject {
  const theme = themeOf(ctx);
  return {
    backgroundColor: theme.bg,
    textStyle: { fontFamily: theme.fontBody, color: theme.text },
    animation: !ctx.isMobile && points <= ANIMATION_MAX_POINTS,
    animationDuration: 300,
  };
}

/** Tooltip: hover on pointer devices, click on touch; never animated; confined to the canvas. */
export function tooltip(ctx: BuildContext, trigger: 'item' | 'axis' = 'item', formatter?: (params: unknown) => string): OptionObject {
  const theme = themeOf(ctx);
  const tt: OptionObject = {
    show: true,
    trigger,
    transitionDuration: 0,
    confine: true,
    triggerOn: ctx.isMobile ? 'click' : 'mousemove|click',
    backgroundColor: theme.bg,
    borderColor: theme.border,
    borderWidth: 1,
    padding: [6, 10],
    textStyle: { color: theme.text, fontFamily: theme.fontBody, fontSize: 12 },
    extraCssText: 'box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-radius: 8px;',
  };
  if (trigger === 'axis') tt.axisPointer = { type: 'line', lineStyle: { color: theme.tick, width: 1 } };
  if (formatter) tt.formatter = formatter;
  return tt;
}

/** Standard tooltip line: `name  value` with the value in mono. */
export function tooltipRow(name: string, value: string, swatch?: string): string {
  const dot = swatch ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${swatch};margin-right:6px"></span>` : '';
  return `<div>${dot}${escapeHtml(name)} <span style="font-family:monospace;float:right;margin-left:12px">${escapeHtml(value)}</span></div>`;
}

/** Escape a label for tooltip HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/** Legend: shown for ≥ 2 series when `spec.legend.show`; scrollable; text in text tokens. */
export function legend(ctx: BuildContext, seriesNames: string[]): OptionObject {
  const theme = themeOf(ctx);
  const show = ctx.spec.legend.show && seriesNames.length >= 2;
  const pos = ctx.spec.legend.position;
  const base: OptionObject = {
    show,
    type: 'scroll',
    data: seriesNames,
    icon: 'circle',
    itemWidth: 10,
    itemHeight: 10,
    textStyle: { color: theme.textMuted, fontSize: 12 },
    pageTextStyle: { color: theme.textMuted },
  };
  if (pos === 'right') return { ...base, orient: 'vertical', right: 8, top: 'middle' };
  if (pos === 'top') return { ...base, orient: 'horizontal', top: 8, left: 'center' };
  return { ...base, orient: 'horizontal', bottom: 8, left: 'center' };
}

/** Plot grid; leaves room for a right legend when it is shown. */
export function gridBox(ctx: BuildContext, seriesCount: number, extra: OptionObject = {}): OptionObject {
  const legendRight = ctx.spec.legend.show && seriesCount >= 2 && ctx.spec.legend.position === 'right';
  const legendTop = ctx.spec.legend.show && seriesCount >= 2 && ctx.spec.legend.position === 'top';
  const legendBottom = ctx.spec.legend.show && seriesCount >= 2 && ctx.spec.legend.position === 'bottom';
  // ECharts 6: the grid's outer bounds contain axis labels and names by default (`containLabel` is deprecated).
  return {
    left: 12,
    right: legendRight ? 140 : 16,
    top: legendTop ? 44 : 20,
    bottom: legendBottom ? 44 : 12,
    outerBoundsContain: 'all',
    ...extra,
  };
}

/** Axis kind for a pill on Columns/Rows. */
export function axisKind(pill: Pill | undefined): 'category' | 'time' | 'value' {
  if (!pill) return 'category';
  if (pill.date) return pill.date.mode === 'trunc' ? 'time' : 'category';
  if (pill.bin) return 'category';
  return pill.role === 'measure' && pill.continuity === 'continuous' ? 'value' : 'category';
}

/** Common axis styling from the spec's `axes.x` / `axes.y` and the theme. */
function axisStyle(ctx: BuildContext, which: 'x' | 'y', title: string | undefined): OptionObject {
  const theme = themeOf(ctx);
  const a = ctx.spec.axes[which];
  const name = a.title === null ? undefined : (a.title ?? title);
  return {
    show: a.showAxis,
    name,
    nameLocation: 'middle',
    nameGap: which === 'x' ? 28 : 44,
    nameTextStyle: { color: theme.textMuted, fontSize: 12 },
    inverse: a.reversed,
    axisLine: { show: true, lineStyle: { color: theme.border } },
    axisTick: { show: false },
    axisLabel: { color: theme.axisText, fontSize: 11, hideOverlap: true },
    splitLine: { show: a.gridlines, lineStyle: { color: theme.grid } },
  };
}

/** Category axis for a discrete pill with the given labels. */
export function categoryAxis(ctx: BuildContext, which: 'x' | 'y', pill: Pill | undefined, labels: Array<string | number>): OptionObject {
  const fmt = dimFormatter(ctx, pill);
  const title = pill ? pillLabel(pill) : undefined;
  const style = axisStyle(ctx, which, title);
  return {
    ...style,
    type: 'category',
    data: labels.map((l) => fmt(l)),
    axisLabel: { ...(style.axisLabel as OptionObject), interval: 'auto', width: which === 'y' ? 120 : undefined, overflow: 'truncate' },
    splitLine: { show: false },
  };
}

/** Value axis for a measure pill (or an unnamed one), honouring log/min/max and the tick format. */
export function valueAxis(ctx: BuildContext, which: 'x' | 'y', pill: Pill | undefined, extra: OptionObject = {}): OptionObject {
  const a = ctx.spec.axes[which];
  const fmt = pill ? makeFormatter(metaOf(ctx, pill.field), a.tickFormat ?? formatSpecOf(ctx, pill)) : (v: number) => String(v);
  const style = axisStyle(ctx, which, pill ? pillLabel(pill) : undefined);
  const out: OptionObject = {
    ...style,
    type: a.log ? 'log' : 'value',
    axisLabel: { ...(style.axisLabel as OptionObject), formatter: (v: number) => fmt(v) },
    ...extra,
  };
  if (typeof a.min === 'number') out.min = a.min;
  if (typeof a.max === 'number') out.max = a.max;
  return out;
}

/** Time axis for a `trunc` date pill. */
export function timeAxis(ctx: BuildContext, which: 'x' | 'y', pill: Pill | undefined): OptionObject {
  const fmt = dimFormatter(ctx, pill);
  const style = axisStyle(ctx, which, pill ? pillLabel(pill) : undefined);
  return { ...style, type: 'time', axisLabel: { ...(style.axisLabel as OptionObject), formatter: (v: number) => fmt(v) }, splitLine: { show: false } };
}

/** Axis for a Columns/Rows pill by its kind. */
export function axisFor(ctx: BuildContext, which: 'x' | 'y', pill: Pill | undefined, labels: Array<string | number>): OptionObject {
  const kind = axisKind(pill);
  if (kind === 'time') return timeAxis(ctx, which, pill);
  if (kind === 'value') return valueAxis(ctx, which, pill);
  return categoryAxis(ctx, which, pill, labels);
}

/** Continuous `visualMap` from the color encoding (sequential, or diverging when a midpoint is present). */
export function visualMap(ctx: BuildContext, min: number, max: number, formatter: ValueFormatter, seriesIndex = 0): OptionObject {
  const theme = themeOf(ctx);
  const { stops, domain, midpoint } = continuousStops(ctx);
  let lo = domain ? domain[0] : min;
  let hi = domain ? domain[1] : max;
  if (midpoint !== undefined) { const span = Math.max(Math.abs(hi - midpoint), Math.abs(lo - midpoint)); lo = midpoint - span; hi = midpoint + span; }
  if (lo === hi) { lo -= 1; hi += 1; }
  const colors = ctx.spec.palette.reverse ? [...stops].reverse() : stops;
  return {
    type: 'continuous',
    min: lo,
    max: hi,
    seriesIndex,
    calculable: false,
    orient: ctx.spec.legend.position === 'right' ? 'vertical' : 'horizontal',
    right: ctx.spec.legend.position === 'right' ? 8 : undefined,
    bottom: ctx.spec.legend.position === 'right' ? undefined : 8,
    left: ctx.spec.legend.position === 'right' ? undefined : 'center',
    top: ctx.spec.legend.position === 'right' ? 'middle' : undefined,
    show: ctx.spec.legend.show,
    itemHeight: 120,
    inRange: { color: colors },
    outOfRange: { color: [theme.border] },
    text: [formatter(hi), formatter(lo)],
    textStyle: { color: theme.textMuted, fontSize: 11 },
    formatter: (v: number) => formatter(v),
  };
}

/** Series label block from `marks.labels` formatted by the measure's formatter; text in text tokens. */
export function seriesLabel(ctx: BuildContext, fmt: ValueFormatter, defaultPosition: string, valueOf?: (p: { value: unknown; name?: string }) => number | null): OptionObject {
  const theme = themeOf(ctx);
  const { show, position } = ctx.spec.marks.labels;
  return {
    show,
    position: position === 'auto' ? defaultPosition : position,
    color: theme.text,
    fontSize: 11,
    fontFamily: theme.fontMono,
    formatter: (p: { value: unknown; name?: string }) => {
      const v = valueOf ? valueOf(p) : (typeof p.value === 'number' ? p.value : Array.isArray(p.value) ? Number(p.value[p.value.length - 1]) : null);
      return v === null || v === undefined || Number.isNaN(v) ? '' : fmt(v);
    },
  };
}

/** Inside (pan + wheel/pinch) data zoom on one axis. */
export function dataZoomInside(axis: 'x' | 'y' = 'x'): OptionObject[] {
  return [{ type: 'inside', [axis === 'x' ? 'xAxisIndex' : 'yAxisIndex']: 0, filterMode: 'none', zoomOnMouseWheel: 'shift', moveOnMouseWheel: false, moveOnMouseMove: true }];
}

/** `null` for a null cell so ECharts leaves a gap; a number otherwise. */
export function cellData(v: Cell): number | null {
  return v === null ? null : v;
}

/** Apply `marks.nullHandling` to a series' cells (lines/areas only). */
export function applyNullHandling(values: Cell[], mode: VizSpec['marks']['nullHandling']): Array<number | null> {
  if (mode === 'zero') return values.map((v) => (v === null ? 0 : v));
  return values.map(cellData);
}

// ---------------------------------------------------------------------------
// Shared cartesian builders
// ---------------------------------------------------------------------------

/** Inputs for the bar family. */
export interface BarOptions {
  horizontal?: boolean;
  stack?: 'none' | 'stack' | 'percent';
  /** Explicit series colors; default `seriesColors`. */
  colors?: string[];
}

/** Pivot the first Columns/Rows dimension against the Color dimension for the first measure. */
export function cartesianPivot(ctx: BuildContext, horizontal: boolean): { pivot: Pivot; xPill: Pill | undefined; mPill: Pill; colorPill: Pill | undefined } {
  const spec = ctx.spec;
  const catShelf = horizontal ? 'rows' : 'columns';
  const mShelf = horizontal ? 'columns' : 'rows';
  const xPill = dimsOn(spec, catShelf)[0] ?? dimsOn(spec, mShelf)[0] ?? firstDim(spec);
  const mPill = measuresOn(spec, mShelf)[0] ?? measuresOn(spec, catShelf)[0] ?? classify(spec).measures[0];
  if (!mPill) throw new Error(`${spec.chartType}: needs a measure`);
  const colorPill = spec.shelves.color[0] && isDimPill(spec.shelves.color[0]) && spec.shelves.color[0].id !== xPill?.id ? spec.shelves.color[0] : undefined;
  const m = requireMeasure(ctx, mPill, 'the measure');
  const xDim = dimOf(ctx, xPill);
  const sDim = dimOf(ctx, colorPill);
  const n = ctx.result.groups;
  const p = xDim
    ? pivot(n, xDim, sDim, m, pillLabel(mPill), seriesOrder(ctx))
    : { x: [pillLabel(mPill)], series: [{ name: pillLabel(mPill), values: [measureCells(m, n).reduce<Cell>((t, v) => (v === null ? t : (t ?? 0) + v), null)] }] };
  return { pivot: axisKind(xPill) === 'time' ? sortByX(p) : p, xPill, mPill, colorPill };
}

/** Bar / horizontal / grouped / stacked / 100 % builder. */
export function cartesianBars(ctx: BuildContext, opts: BarOptions = {}): OptionObject {
  const horizontal = opts.horizontal ?? false;
  const { pivot: p, xPill, mPill, colorPill } = cartesianPivot(ctx, horizontal);
  const stack = opts.stack ?? 'none';
  const names = p.series.map((s) => s.name);
  const colors = opts.colors ?? seriesColors(ctx, names);
  const fmt = formatterFor(ctx, mPill);
  const theme = themeOf(ctx);
  const dimFmt = dimFormatter(ctx, xPill);
  const points = pointCount(ctx, p.series.length);
  const grouped = stack === 'none' && p.series.length > 1;
  const series = p.series.map((s, i) => ({
    type: 'bar',
    name: s.name,
    data: s.values.map(cellData),
    stack: stack === 'none' ? undefined : 'total',
    barGap: grouped ? '10%' : `${Math.round(ctx.spec.marks.barGap * 100)}%`,
    barCategoryGap: `${Math.round(ctx.spec.marks.barGap * 100)}%`,
    barMaxWidth: 48,
    itemStyle: { color: colors[i] ?? theme.border, opacity: ctx.spec.marks.opacity, borderRadius: stack === 'none' ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0, borderColor: theme.bg, borderWidth: stack === 'none' ? 0 : 1 },
    emphasis: { focus: 'series' },
    label: seriesLabel(ctx, fmt, horizontal ? 'right' : 'top'),
    large: points > LARGE_SCATTER_POINTS,
  }));
  const catAxis = categoryAxis(ctx, horizontal ? 'y' : 'x', xPill, p.x);
  const valAxis = valueAxis(ctx, horizontal ? 'x' : 'y', mPill, stack === 'percent' ? { max: 1, axisLabel: { color: theme.axisText, fontSize: 11, formatter: (v: number) => `${Math.round(v * 100)}%` } } : {});
  const tooltipFmt = (params: unknown) => {
    const list = Array.isArray(params) ? params : [params];
    const head = list[0] as { axisValueLabel?: string; name?: string } | undefined;
    const rows = (list as Array<{ seriesName: string; value: number | null; color: string }>)
      .filter((pt) => pt.value !== null && pt.value !== undefined)
      .map((pt) => tooltipRow(pt.seriesName, stack === 'percent' ? `${(Number(pt.value) * 100).toFixed(1)}%` : fmt(Number(pt.value)), pt.color));
    return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(dimFmt(head?.axisValueLabel ?? head?.name ?? ''))}</div>${rows.join('')}`;
  };
  return {
    ...baseOption(ctx, points),
    tooltip: tooltip(ctx, 'axis', tooltipFmt),
    legend: legend(ctx, names),
    grid: gridBox(ctx, names.length),
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series,
    __meta: { stack, colorPill: colorPill?.id ?? null, seriesCount: names.length, measure: pillLabel(mPill) },
  };
}

/** Inputs for the line family. */
export interface LineOptions {
  area?: boolean;
  stack?: boolean;
  smooth?: boolean;
  /** Ranks: invert the y axis and show integer ticks. */
  inverted?: boolean;
  /** Pre-built pivot (bump, slope); default `cartesianPivot`. */
  pivot?: Pivot;
  xPill?: Pill | undefined;
  mPill?: Pill;
  colors?: string[];
  yAxisName?: string;
  showPoints?: boolean;
  step?: boolean;
}

/** Line / area / bump / slope builder: one series per color value, LTTB above 2K points, nulls per `marks.nullHandling`. */
export function cartesianLines(ctx: BuildContext, opts: LineOptions = {}): OptionObject {
  const base = opts.pivot ? { pivot: opts.pivot, xPill: opts.xPill, mPill: opts.mPill } : cartesianPivot(ctx, false);
  const p = base.pivot;
  const xPill = base.xPill;
  const mPill = base.mPill;
  if (!mPill) throw new Error(`${ctx.spec.chartType}: needs a measure`);
  const names = p.series.map((s) => s.name);
  const colors = opts.colors ?? seriesColors(ctx, names);
  const fmt = formatterFor(ctx, mPill);
  const dimFmt = dimFormatter(ctx, xPill);
  const theme = themeOf(ctx);
  const marks = ctx.spec.marks;
  const kind = axisKind(xPill);
  const points = pointCount(ctx, p.series.length);
  const perSeries = p.x.length;
  const connect = marks.nullHandling === 'connect';
  const series = p.series.map((s, i) => {
    const data = applyNullHandling(s.values, marks.nullHandling);
    const obj: OptionObject = {
      type: 'line',
      name: s.name,
      data: kind === 'time' ? data.map((v, xi) => [p.x[xi], v]) : data,
      smooth: opts.smooth ?? marks.smooth,
      step: opts.step ? 'middle' : false,
      showSymbol: opts.showPoints ?? marks.showPoints,
      symbol: 'circle',
      symbolSize: 8,
      connectNulls: connect,
      sampling: perSeries > LTTB_MIN_POINTS ? 'lttb' : undefined,
      lineStyle: { width: marks.lineWidth, color: colors[i] ?? theme.border },
      itemStyle: { color: colors[i] ?? theme.border, borderColor: theme.bg, borderWidth: 2 },
      emphasis: { focus: 'series' },
      label: seriesLabel(ctx, fmt, 'top'),
    };
    if (opts.area) {
      obj.areaStyle = { color: colors[i] ?? theme.border, opacity: opts.stack ? Math.min(marks.opacity, 0.85) : Math.min(marks.opacity, 0.5) };
      if (opts.stack) obj.stack = 'total';
    } else {
      obj.lineStyle = { ...(obj.lineStyle as OptionObject), opacity: marks.opacity };
    }
    return obj;
  });
  const xAxis = kind === 'time' ? timeAxis(ctx, 'x', xPill) : kind === 'value' ? valueAxis(ctx, 'x', xPill) : { ...categoryAxis(ctx, 'x', xPill, p.x), boundaryGap: false };
  const yAxis = valueAxis(ctx, 'y', opts.inverted ? undefined : mPill, opts.inverted
    ? { inverse: !ctx.spec.axes.y.reversed, min: 1, max: Math.max(1, p.series.length), minInterval: 1, name: opts.yAxisName ?? 'Rank', axisLabel: { color: theme.axisText, fontSize: 11, formatter: (v: number) => `#${v}` } }
    : {});
  const tooltipFmt = (params: unknown) => {
    const list = Array.isArray(params) ? params : [params];
    const head = list[0] as { axisValue?: string | number; axisValueLabel?: string } | undefined;
    const rows = (list as Array<{ seriesName: string; value: unknown; color: string }>)
      .map((pt) => ({ pt, v: Array.isArray(pt.value) ? pt.value[1] : pt.value }))
      .filter((e) => e.v !== null && e.v !== undefined && !Number.isNaN(Number(e.v)))
      .map((e) => tooltipRow(e.pt.seriesName, opts.inverted ? `#${Number(e.v)}` : fmt(Number(e.v)), e.pt.color));
    const label = kind === 'time' && typeof head?.axisValue === 'number' ? dimFmt(head.axisValue) : String(head?.axisValueLabel ?? head?.axisValue ?? '');
    return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(label)}</div>${rows.join('')}`;
  };
  return {
    ...baseOption(ctx, points),
    tooltip: tooltip(ctx, 'axis', tooltipFmt),
    legend: legend(ctx, names),
    grid: gridBox(ctx, names.length),
    xAxis,
    yAxis,
    dataZoom: dataZoomInside('x'),
    series,
    __meta: { seriesCount: names.length, sampled: perSeries > LTTB_MIN_POINTS, measure: pillLabel(mPill) },
  };
}

/** Values of the first dimension as display labels (for one-dimension charts: pie, funnel, waterfall …). */
export function labelsAndValues(ctx: BuildContext, dimPill: Pill | undefined, mPill: Pill): { labels: string[]; values: Cell[]; dim: ResultDim | undefined } {
  const m = requireMeasure(ctx, mPill, 'the measure');
  const dim = dimOf(ctx, dimPill);
  const n = ctx.result.groups;
  const values = measureCells(m, n);
  if (!dim) return { labels: values.map(() => pillLabel(mPill)), values, dim };
  const at = dimAccessor(dim);
  const fmt = dimFormatter(ctx, dimPill);
  const labels: string[] = [];
  for (let i = 0; i < n; i++) labels.push(fmt(at(i)));
  return { labels, values, dim };
}
