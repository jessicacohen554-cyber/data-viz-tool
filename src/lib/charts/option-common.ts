/**
 * Shared pieces every chart builder composes: the Observatory theme (CSS token
 * values passed in by the canvas, with a fallback mirror of `app.css`), pill
 * classification, result lookup through `pillKeyMap`, formatter and palette
 * wiring, style-derived font sizes, and the ECharts option fragments (tooltip,
 * legend, grid, axes, visualMap, labels, dataZoom) plus the two cartesian
 * builders (bars, lines) that most of the library reuses.
 *
 * v2 (D-19): the cartesian builders take every measure on the value shelf;
 * a pill with `axis: 'secondary'` draws on `yAxis[1]` (right side) styled from
 * `axes.y2`, `axes.synchronized` copies the primary range, and the series
 * name carries " (right)" so legend and tooltip name the axis. Reference
 * lines, trend lines and annotations are attached through `decorations.ts`.
 *
 * Rules applied here (CONSUMES, dataviz skill): thin marks, categorical hues
 * in fixed order, text in text tokens never series color, legend for ≥ 2
 * series, hover tooltip by default (`click` on touch), `transitionDuration: 0`,
 * `confine: true`, animation off above 5K points or on mobile. Framework-free
 * (rule R-PURE).
 */
import type { FieldMeta, FormatSpec, Pill, QueryResult, ResultDim, ResultMeasure, ShelfId, VizSpec } from '../core/types';
import { AGGREGATION_LABEL, FONT_FAMILIES } from '../core/constants';
import { pillKeyMap } from '../core/query-of';
import { makeFormatter, type ValueFormatter } from '../format/formatter';
import { pickPalette, type ColorEncoding } from '../palette/pick';
import type { BuildContext } from './registry';
import { type Decorations, type DecorationSeries, applyDecorations, cartesianDecorations, hasDecorations, trendTooltipText } from './decorations';
import { type Cell, type Pivot, dimAccessor, measureCells, percentStack, pivot, sortByX } from './transforms';

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

/** Suffix that names the secondary axis in legend and tooltip (D-19). */
export const SECONDARY_SUFFIX = ' (right)';

/** Modules every cartesian builder may need for decorations: mark components (reference lines, bands, annotations) and `line` series (trend lines). */
export const DECORATION_MODULES: readonly string[] = ['MarkLineComponent', 'MarkAreaComponent', 'MarkPointComponent', 'LineChart'];

/** A 24×24 stroke icon for the picker from path data; colour comes from `currentColor`. */
export function svgIcon(body: string): string {
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Theme of a context (falls back to the mirror). */
export function themeOf(ctx: BuildContext): ChartTheme {
  return ctx.theme ?? DEFAULT_THEME;
}

// ---------------------------------------------------------------------------
// Style-derived fonts and sizes
// ---------------------------------------------------------------------------

/** Font families and the size multiplier a builder should use. */
export interface StyleFonts {
  base: string;
  axis: string;
  labels: string;
  legend: string;
  scale: number;
  /** Scaled sizes in px. */
  axisLabel: number;
  axisTitle: number;
  label: number;
  legendText: number;
}

/** CSS font stack for a `FONT_FAMILIES` id; `inherit`, unknown or absent → the app font from the theme. */
export function fontCss(id: string | undefined, theme: ChartTheme): string {
  if (!id || id === 'inherit') return theme.fontBody;
  return FONT_FAMILIES.find((f) => f.id === id)?.css ?? theme.fontBody;
}

/** Resolve `spec.style` to the families and scaled sizes the builders use. */
export function styleFonts(ctx: BuildContext): StyleFonts {
  const st = ctx.spec.style;
  const theme = themeOf(ctx);
  const scale = Number.isFinite(st.fontScale) && st.fontScale > 0 ? st.fontScale : 1;
  const base = fontCss(st.fontFamily, theme);
  return {
    base,
    axis: st.axis.fontFamily ? fontCss(st.axis.fontFamily, theme) : base,
    labels: st.labels.fontFamily ? fontCss(st.labels.fontFamily, theme) : theme.fontMono,
    legend: st.legend.fontFamily ? fontCss(st.legend.fontFamily, theme) : base,
    scale,
    axisLabel: Math.round(st.axis.size * scale),
    axisTitle: Math.round(st.axis.titleSize * scale),
    label: Math.round(st.labels.size * scale),
    legendText: Math.round(st.legend.size * scale),
  };
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

/** Which value axis a measure pill draws on (default primary). */
export function axisOf(p: Pill): 'primary' | 'secondary' {
  return p.axis === 'secondary' ? 'secondary' : 'primary';
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
  const byPosition = (n: string, i: number) => overrides[n] ?? FALLBACK_CATEGORICAL[i] ?? theme.border;
  // A name the palette map does not know (a series synthesised by a transform) takes the
  // fixed-order fallback for its position; beyond the set it is `theme.border`, never a cycle.
  if (enc.kind === 'categorical') return names.map((n, i) => overrides[n] ?? enc.map[n] ?? byPosition(n, i));
  if (names.length <= 1) return [enc.kind === 'none' ? enc.color : theme.accent];
  return names.map(byPosition);
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

/** The three axis slots of `spec.axes` a builder may style from. */
export type AxisId = 'x' | 'y' | 'y2';

/** Total marks drawn (groups × series); decides animation and large mode. */
export function pointCount(ctx: BuildContext, seriesCount = 1): number {
  return ctx.result.groups * Math.max(1, seriesCount);
}

/** Root option: surface (from `style.background`), text style, animation policy. */
export function baseOption(ctx: BuildContext, points: number): OptionObject {
  const theme = themeOf(ctx);
  const bg = ctx.spec.style.background;
  return {
    backgroundColor: bg === 'transparent' ? 'transparent' : bg,
    textStyle: { fontFamily: styleFonts(ctx).base, color: theme.text },
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
    textStyle: { color: theme.text, fontFamily: styleFonts(ctx).base, fontSize: 12 },
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

/**
 * Legend: shown for ≥ 2 series when `spec.legend.show`; scrollable; text in
 * text tokens. `icons` (name → `path://…`) draws an icon instead of the circle
 * for that entry (Shape shelf, ICONS.md §7).
 */
export function legend(ctx: BuildContext, seriesNames: string[], icons?: Record<string, string>): OptionObject {
  const theme = themeOf(ctx);
  const fonts = styleFonts(ctx);
  const show = ctx.spec.legend.show && seriesNames.length >= 2;
  const pos = ctx.spec.legend.position;
  const data = icons ? seriesNames.map((n) => (icons[n] ? { name: n, icon: icons[n] } : n)) : seriesNames;
  const base: OptionObject = {
    show,
    type: 'scroll',
    data,
    icon: 'circle',
    itemWidth: icons ? 14 : 10,
    itemHeight: icons ? 14 : 10,
    textStyle: { color: theme.textMuted, fontSize: fonts.legendText, fontFamily: fonts.legend },
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

/** Common axis styling from `spec.axes[which]` (x, y or y2) and the theme; gridlines off removes the split lines. */
function axisStyle(ctx: BuildContext, which: AxisId, title: string | undefined): OptionObject {
  const theme = themeOf(ctx);
  const fonts = styleFonts(ctx);
  const a = ctx.spec.axes[which];
  const name = a.title === null ? undefined : (a.title ?? title);
  return {
    show: a.showAxis,
    name,
    nameLocation: 'middle',
    nameGap: which === 'x' ? 28 : 44,
    nameTextStyle: { color: theme.textMuted, fontSize: fonts.axisTitle, fontFamily: fonts.axis },
    inverse: a.reversed,
    axisLine: { show: true, lineStyle: { color: theme.border } },
    axisTick: { show: false },
    axisLabel: { color: theme.axisText, fontSize: fonts.axisLabel, fontFamily: fonts.axis, hideOverlap: true },
    splitLine: { show: a.gridlines, lineStyle: { color: theme.grid } },
  };
}

/** Category axis for a discrete pill with the given labels. */
export function categoryAxis(ctx: BuildContext, which: AxisId, pill: Pill | undefined, labels: Array<string | number>): OptionObject {
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

/**
 * Value axis for a measure pill (or an unnamed one), honouring log/min/max,
 * reversed, gridlines and the tick format of `spec.axes[which]`. `y2` is
 * placed on the right (or on top when the builder is horizontal).
 */
export function valueAxis(ctx: BuildContext, which: AxisId, pill: Pill | undefined, extra: OptionObject = {}): OptionObject {
  const a = ctx.spec.axes[which];
  const fmt = pill ? makeFormatter(metaOf(ctx, pill.field), a.tickFormat ?? formatSpecOf(ctx, pill)) : (v: number) => String(v);
  const style = axisStyle(ctx, which, pill ? pillLabel(pill) : undefined);
  const out: OptionObject = {
    ...style,
    type: a.log ? 'log' : 'value',
    axisLabel: { ...(style.axisLabel as OptionObject), formatter: (v: number) => fmt(v) },
    ...(which === 'y2' ? { position: 'right' } : {}),
    ...extra,
  };
  if (typeof a.min === 'number') out.min = a.min;
  if (typeof a.max === 'number') out.max = a.max;
  return out;
}

/** Time axis for a `trunc` date pill. */
export function timeAxis(ctx: BuildContext, which: AxisId, pill: Pill | undefined): OptionObject {
  const fmt = dimFormatter(ctx, pill);
  const style = axisStyle(ctx, which, pill ? pillLabel(pill) : undefined);
  return { ...style, type: 'time', axisLabel: { ...(style.axisLabel as OptionObject), formatter: (v: number) => fmt(v) }, splitLine: { show: false } };
}

/** Axis for a Columns/Rows pill by its kind. */
export function axisFor(ctx: BuildContext, which: AxisId, pill: Pill | undefined, labels: Array<string | number>): OptionObject {
  const kind = axisKind(pill);
  if (kind === 'time') return timeAxis(ctx, which, pill);
  if (kind === 'value') return valueAxis(ctx, which, pill);
  return categoryAxis(ctx, which, pill, labels);
}

/** Continuous `visualMap` from the color encoding (sequential, or diverging when a midpoint is present). */
export function visualMap(ctx: BuildContext, min: number, max: number, formatter: ValueFormatter, seriesIndex = 0): OptionObject {
  const theme = themeOf(ctx);
  const fonts = styleFonts(ctx);
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
    textStyle: { color: theme.textMuted, fontSize: fonts.legendText, fontFamily: fonts.legend },
    formatter: (v: number) => formatter(v),
  };
}

/** Series label block from `marks.labels` formatted by the measure's formatter; text in text tokens. */
export function seriesLabel(ctx: BuildContext, fmt: ValueFormatter, defaultPosition: string, valueOf?: (p: { value: unknown; name?: string }) => number | null): OptionObject {
  const theme = themeOf(ctx);
  const fonts = styleFonts(ctx);
  const { show, position } = ctx.spec.marks.labels;
  return {
    show,
    position: position === 'auto' ? defaultPosition : position,
    color: theme.text,
    fontSize: fonts.label,
    fontFamily: fonts.labels,
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
// Cartesian model (dual axis, D-19)
// ---------------------------------------------------------------------------

/** One drawn series of a cartesian chart. */
export interface ValueSeries {
  /** Legend / tooltip name: the color label (one measure) or the measure label, suffixed for the right axis. */
  name: string;
  values: Cell[];
  /** The measure pill the values come from. */
  pill: Pill;
  axis: 'primary' | 'secondary';
}

/** The series a cartesian builder draws, with the x positions they share. */
export interface CartesianModel {
  x: Array<string | number>;
  xPill: Pill | undefined;
  /** The Color dimension when exactly one measure is split by it. */
  colorPill: Pill | undefined;
  /** Measure pills on the value shelf in shelf order. */
  measures: Pill[];
  series: ValueSeries[];
  hasSecondary: boolean;
}

/** Inputs of `cartesianModel`. */
export interface ModelOptions {
  horizontal?: boolean;
  /** Measures from this index on draw on the secondary axis when they carry no `axis` (combo's default). */
  secondaryFrom?: number;
}

/**
 * Resolve the series of a cartesian chart. With one measure on the value
 * shelf it is pivoted by the Color dimension (one series per color label);
 * with several measures each becomes a series named after its pill (the Color
 * dimension is not applied, `__meta.colorIgnored` tells the canvas). Time
 * axes are sorted by x.
 */
export function cartesianModel(ctx: BuildContext, opts: ModelOptions = {}): CartesianModel {
  const spec = ctx.spec;
  const horizontal = opts.horizontal ?? false;
  const catShelf = horizontal ? 'rows' : 'columns';
  const mShelf = horizontal ? 'columns' : 'rows';
  const xPill = dimsOn(spec, catShelf)[0] ?? dimsOn(spec, mShelf)[0] ?? firstDim(spec);
  let measures = measuresOn(spec, mShelf);
  if (measures.length === 0) measures = measuresOn(spec, catShelf);
  if (measures.length === 0) measures = classify(spec).measures.slice(0, 1);
  if (measures.length === 0) throw new Error(`${spec.chartType}: needs a measure`);
  const colorPill = spec.shelves.color[0] && isDimPill(spec.shelves.color[0]) && spec.shelves.color[0].id !== xPill?.id ? spec.shelves.color[0] : undefined;
  const xDim = dimOf(ctx, xPill);
  const n = ctx.result.groups;
  const requested = (p: Pill, i: number): 'primary' | 'secondary' => p.axis ? axisOf(p) : (opts.secondaryFrom !== undefined && i >= opts.secondaryFrom ? 'secondary' : 'primary');
  // A dual axis needs a primary measure: when every remaining measure asks for the right axis (the primary pill was
  // removed, or the only measure still carries `axis: 'secondary'`), everything draws on the primary axis (D-19).
  const resolved = measures.map(requested);
  const anyPrimary = resolved.includes('primary');
  const axisFor = (_p: Pill, i: number): 'primary' | 'secondary' => (anyPrimary ? resolved[i]! : 'primary');
  const pivotOf = (m: Pill, sDim: ResultDim | undefined): Pivot => {
    const rm = requireMeasure(ctx, m, 'the measure');
    const p = xDim
      ? pivot(n, xDim, sDim, rm, pillLabel(m), sDim ? seriesOrder(ctx) : undefined)
      : { x: [pillLabel(m)], series: [{ name: pillLabel(m), values: [measureCells(rm, n).reduce<Cell>((t, v) => (v === null ? t : (t ?? 0) + v), null)] }] };
    return axisKind(xPill) === 'time' ? sortByX(p) : p;
  };
  const series: ValueSeries[] = [];
  let x: Array<string | number> = [];
  if (measures.length === 1) {
    const m = measures[0]!;
    const p = pivotOf(m, dimOf(ctx, colorPill));
    x = p.x;
    const axis = axisFor(m, 0);
    for (const s of p.series) series.push({ name: axis === 'secondary' ? `${s.name}${SECONDARY_SUFFIX}` : s.name, values: s.values, pill: m, axis });
  } else {
    measures.forEach((m, i) => {
      const p = pivotOf(m, undefined);
      if (i === 0) x = p.x;
      const axis = axisFor(m, i);
      const s = p.series[0]!;
      series.push({ name: axis === 'secondary' ? `${s.name}${SECONDARY_SUFFIX}` : s.name, values: s.values, pill: m, axis });
    });
  }
  return { x, xPill, colorPill: measures.length === 1 ? colorPill : undefined, measures, series, hasSecondary: series.some((s) => s.axis === 'secondary') };
}

/** Pivot the first Columns/Rows dimension against the Color dimension for the first measure (v1 shape, kept for bump/slope/histogram). */
export function cartesianPivot(ctx: BuildContext, horizontal: boolean): { pivot: Pivot; xPill: Pill | undefined; mPill: Pill; colorPill: Pill | undefined } {
  const m = cartesianModel(ctx, { horizontal });
  return { pivot: { x: m.x, series: m.series.map((s) => ({ name: s.name, values: s.values })) }, xPill: m.xPill, mPill: m.measures[0]!, colorPill: m.colorPill };
}

/** Round an extent outwards to a "nice" step so a copied range still ends on a tick. */
export function niceExtent(lo: number, hi: number): [number, number] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo > 0) lo = 0;
  if (hi < 0) hi = 0;
  if (lo === hi) return [lo, lo + 1];
  const span = hi - lo;
  const step = 10 ** Math.floor(Math.log10(span)) / 2;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

/** Data extent of the series on one axis (null cells skipped). */
export function axisExtent(series: ValueSeries[], axis: 'primary' | 'secondary'): [number, number] {
  let lo = Infinity; let hi = -Infinity;
  for (const s of series) if (s.axis === axis) for (const v of s.values) if (v !== null) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

/**
 * The value axes of a model: the primary from `axes.y`, and when any series is
 * secondary a second one from `axes.y2` on the right (top when horizontal).
 * `axes.synchronized` copies the primary data range onto both axes unless the
 * spec pins a numeric min/max on that axis. Axis titles join the measure labels.
 */
export function valueAxes(ctx: BuildContext, model: CartesianModel, horizontal: boolean, primaryExtra: OptionObject = {}): OptionObject[] {
  const which: AxisId = horizontal ? 'x' : 'y';
  const primaryPills = model.series.filter((s) => s.axis === 'primary').map((s) => s.pill);
  const secondaryPills = model.series.filter((s) => s.axis === 'secondary').map((s) => s.pill);
  const title = (pills: Pill[]) => [...new Set(pills.map(pillLabel))].join(' · ');
  const primaryPill = primaryPills[0] ?? model.measures[0];
  const primary = valueAxis(ctx, which, primaryPill, { ...(primaryPills.length > 1 ? { name: title(primaryPills) } : {}), ...primaryExtra });
  if (!model.hasSecondary) return [primary];
  const secondary = valueAxis(ctx, 'y2', secondaryPills[0], { position: horizontal ? 'top' : 'right', ...(secondaryPills.length > 1 ? { name: title(secondaryPills) } : {}) });
  if (horizontal) secondary.nameGap = 28;
  if (ctx.spec.axes.synchronized) {
    const [lo, hi] = niceExtent(...axisExtent(model.series, 'primary'));
    for (const [ax, id] of [[primary, which], [secondary, 'y2']] as Array<[OptionObject, AxisId]>) {
      const a = ctx.spec.axes[id];
      if (typeof a.min !== 'number') ax.min = lo;
      if (typeof a.max !== 'number') ax.max = hi;
    }
  }
  return [primary, secondary];
}

/** Tooltip params of an axis trigger, as the builders read them. */
interface AxisTooltipPoint { seriesName: string; seriesIndex: number; value: unknown; color: string; axisValue?: string | number; axisValueLabel?: string; name?: string }

/** Options of `axisTooltipFormatter`. */
export interface AxisTooltipOptions {
  xKind: 'category' | 'time' | 'value';
  dimFmt: (v: string | number) => string;
  /** Formatter for a data series by its index in the option. */
  fmtFor: (seriesIndex: number) => ValueFormatter;
  /** Value → display override (percent stacks, ranks). */
  valueText?: (v: number, seriesIndex: number) => string;
  decorations?: Decorations;
}

/** Shared axis-trigger tooltip: header is the x value, one row per series, trend rows only when `showEquation`. */
export function axisTooltipFormatter(ctx: BuildContext, opts: AxisTooltipOptions): (params: unknown) => string {
  const theme = themeOf(ctx);
  const showEq = ctx.spec.trendLine.showEquation;
  return (params: unknown) => {
    const list = (Array.isArray(params) ? params : [params]) as AxisTooltipPoint[];
    const head = list[0];
    const rows: string[] = [];
    for (const pt of list) {
      const trend = trendTooltipText(pt.seriesName, opts.decorations, showEq);
      if (trend === null) continue;
      if (trend !== undefined) { rows.push(tooltipRow(pt.seriesName, trend, pt.color)); continue; }
      const raw = Array.isArray(pt.value) ? pt.value[pt.value.length - 1] : pt.value;
      if (raw === null || raw === undefined || Number.isNaN(Number(raw))) continue;
      const v = Number(raw);
      rows.push(tooltipRow(pt.seriesName, opts.valueText ? opts.valueText(v, pt.seriesIndex) : opts.fmtFor(pt.seriesIndex)(v), pt.color));
    }
    const label = opts.xKind === 'time' && typeof head?.axisValue === 'number' ? opts.dimFmt(head.axisValue) : opts.dimFmt(String(head?.axisValueLabel ?? head?.axisValue ?? head?.name ?? ''));
    return `<div style="color:${theme.textMuted};margin-bottom:4px">${escapeHtml(label)}</div>${rows.join('')}`;
  };
}

/** Build the decorations of a model (reference lines, trend lines, annotations) or `undefined` when the spec has none. */
export function decorationsFor(ctx: BuildContext, model: CartesianModel, horizontal: boolean, colors: string[], xKind: 'category' | 'time' | 'value' = axisKind(model.xPill)): Decorations | undefined {
  if (!hasDecorations(ctx.spec)) return undefined;
  const series: DecorationSeries[] = model.series.map((s) => ({ name: s.name, values: s.values, axis: s.axis, pill: s.pill }));
  return cartesianDecorations({
    spec: ctx.spec, theme: themeOf(ctx), horizontal, xKind, x: model.x, series, colors,
    formatters: model.series.map((s) => formatterFor(ctx, s.pill)), fontSize: styleFonts(ctx).label,
  });
}

/** Stack id per value axis: series on different axes never stack together. */
export function stackId(axis: 'primary' | 'secondary'): string {
  return axis === 'primary' ? 'total' : 'total-secondary';
}

/** `__meta` entries shared by the cartesian builders. */
function cartesianMeta(spec: VizSpec, model: CartesianModel, deco: Decorations | undefined): OptionObject {
  const notes = deco?.skipped ?? [];
  const colorDim = spec.shelves.color[0];
  return {
    seriesCount: model.series.length,
    measure: pillLabel(model.measures[0]!),
    measures: model.measures.map(pillLabel),
    colorPill: model.colorPill?.id ?? null,
    /** Several measures on the value shelf: the Color dimension is not applied (one series per measure instead). */
    colorIgnored: model.measures.length > 1 && colorDim !== undefined && isDimPill(colorDim),
    dualAxis: model.hasSecondary,
    annotations: deco?.annotations ?? [],
    ...(notes.length ? { notes } : {}),
  };
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

/** Bar / horizontal / grouped / stacked / 100 % builder; secondary-axis measures draw on the right axis. */
export function cartesianBars(ctx: BuildContext, opts: BarOptions = {}): OptionObject {
  const horizontal = opts.horizontal ?? false;
  const model = cartesianModel(ctx, { horizontal });
  const stack = opts.stack ?? 'none';
  const names = model.series.map((s) => s.name);
  const colors = opts.colors ?? seriesColors(ctx, names);
  const theme = themeOf(ctx);
  const dimFmt = dimFormatter(ctx, model.xPill);
  const points = pointCount(ctx, model.series.length);
  const grouped = stack === 'none' && model.series.length > 1;
  const fmts = model.series.map((s) => formatterFor(ctx, s.pill));
  const axisIndexKey = horizontal ? 'xAxisIndex' : 'yAxisIndex';
  const series: OptionObject[] = model.series.map((s, i) => ({
    type: 'bar',
    name: s.name,
    data: s.values.map(cellData),
    stack: stack === 'none' ? undefined : stackId(s.axis),
    [axisIndexKey]: s.axis === 'secondary' ? 1 : 0,
    barGap: grouped ? '10%' : `${Math.round(ctx.spec.marks.barGap * 100)}%`,
    barCategoryGap: `${Math.round(ctx.spec.marks.barGap * 100)}%`,
    barMaxWidth: 48,
    itemStyle: { color: colors[i] ?? theme.border, opacity: ctx.spec.marks.opacity, borderRadius: stack === 'none' ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0, borderColor: theme.bg, borderWidth: stack === 'none' ? 0 : 1 },
    emphasis: { focus: 'series' },
    label: seriesLabel(ctx, fmts[i]!, horizontal ? 'right' : 'top'),
    large: points > LARGE_SCATTER_POINTS,
  }));
  const deco = decorationsFor(ctx, model, horizontal, colors, 'category');
  const catAxis = categoryAxis(ctx, horizontal ? 'y' : 'x', model.xPill, model.x);
  const percentExtra: OptionObject = stack === 'percent' ? { max: 1, axisLabel: { color: theme.axisText, fontSize: styleFonts(ctx).axisLabel, formatter: (v: number) => `${Math.round(v * 100)}%` } } : {};
  const valAxes = valueAxes(ctx, model, horizontal, percentExtra);
  const valAxis = valAxes.length === 1 ? valAxes[0]! : valAxes;
  const tooltipFmt = axisTooltipFormatter(ctx, {
    xKind: 'category', dimFmt, fmtFor: (i) => fmts[i] ?? fmts[0]!, decorations: deco,
    ...(stack === 'percent' ? { valueText: (v: number) => `${(v * 100).toFixed(1)}%` } : {}),
  });
  return {
    ...baseOption(ctx, points),
    tooltip: tooltip(ctx, 'axis', tooltipFmt),
    legend: legend(ctx, names),
    grid: gridBox(ctx, names.length, model.hasSecondary && !horizontal ? { right: ctx.spec.legend.show && names.length >= 2 && ctx.spec.legend.position === 'right' ? 140 : 24 } : {}),
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series: deco ? applyDecorations(series, deco) : series,
    __meta: { ...cartesianMeta(ctx.spec, model, deco), stack },
  };
}

/** Inputs for the line family. */
export interface LineOptions {
  area?: boolean;
  stack?: boolean;
  /** Each x column as shares of its total (100 % area). */
  percent?: boolean;
  smooth?: boolean;
  /** Ranks: invert the y axis and show integer ticks. */
  inverted?: boolean;
  /** Pre-built pivot (bump, slope); default `cartesianModel`. */
  pivot?: Pivot;
  xPill?: Pill | undefined;
  mPill?: Pill;
  colors?: string[];
  yAxisName?: string;
  showPoints?: boolean;
  step?: boolean;
}

/** Line / area / bump / slope builder: one series per color value or measure, LTTB above 2K points, nulls per `marks.nullHandling`. */
export function cartesianLines(ctx: BuildContext, opts: LineOptions = {}): OptionObject {
  let model: CartesianModel;
  if (opts.pivot) {
    if (!opts.mPill) throw new Error(`${ctx.spec.chartType}: needs a measure`);
    const m = opts.mPill;
    model = { x: opts.pivot.x, xPill: opts.xPill, colorPill: undefined, measures: [m], series: opts.pivot.series.map((s) => ({ name: s.name, values: s.values, pill: m, axis: 'primary' as const })), hasSecondary: false };
  } else {
    model = cartesianModel(ctx, { horizontal: false });
  }
  let excludedNegatives = 0;
  if (opts.percent) {
    const r = percentStack({ x: model.x, series: model.series.map((s) => ({ name: s.name, values: s.values })) });
    excludedNegatives = r.excludedNegatives;
    model = { ...model, series: model.series.map((s, i) => ({ ...s, values: r.pivot.series[i]!.values })) };
  }
  const names = model.series.map((s) => s.name);
  const colors = opts.colors ?? seriesColors(ctx, names);
  const fmts = model.series.map((s) => formatterFor(ctx, s.pill));
  const dimFmt = dimFormatter(ctx, model.xPill);
  const theme = themeOf(ctx);
  const marks = ctx.spec.marks;
  const kind = axisKind(model.xPill);
  const points = pointCount(ctx, model.series.length);
  const perSeries = model.x.length;
  const connect = marks.nullHandling === 'connect';
  const series = model.series.map((s, i) => {
    const data = applyNullHandling(s.values, marks.nullHandling);
    const obj: OptionObject = {
      type: 'line',
      name: s.name,
      data: kind === 'time' ? data.map((v, xi) => [model.x[xi], v]) : data,
      yAxisIndex: s.axis === 'secondary' ? 1 : 0,
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
      label: seriesLabel(ctx, fmts[i]!, 'top'),
    };
    if (opts.area) {
      obj.areaStyle = { color: colors[i] ?? theme.border, opacity: opts.stack ? Math.min(marks.opacity, 0.85) : Math.min(marks.opacity, 0.5) };
      if (opts.stack) obj.stack = stackId(s.axis);
    } else {
      obj.lineStyle = { ...(obj.lineStyle as OptionObject), opacity: marks.opacity };
    }
    return obj;
  });
  const deco = opts.inverted ? undefined : decorationsFor(ctx, model, false, colors, kind);
  const xAxis = kind === 'time' ? timeAxis(ctx, 'x', model.xPill) : kind === 'value' ? valueAxis(ctx, 'x', model.xPill) : { ...categoryAxis(ctx, 'x', model.xPill, model.x), boundaryGap: false };
  const fonts = styleFonts(ctx);
  const primaryExtra: OptionObject = opts.inverted
    ? { inverse: !ctx.spec.axes.y.reversed, min: 1, max: Math.max(1, model.series.length), minInterval: 1, name: opts.yAxisName ?? 'Rank', axisLabel: { color: theme.axisText, fontSize: fonts.axisLabel, formatter: (v: number) => `#${v}` } }
    : opts.percent ? { max: 1, axisLabel: { color: theme.axisText, fontSize: fonts.axisLabel, formatter: (v: number) => `${Math.round(v * 100)}%` } } : {};
  const yAxes = opts.inverted
    ? [valueAxis(ctx, 'y', undefined, primaryExtra)]
    : valueAxes(ctx, model, false, primaryExtra);
  const tooltipFmt = axisTooltipFormatter(ctx, {
    xKind: kind, dimFmt, fmtFor: (i) => fmts[i] ?? fmts[0]!, decorations: deco,
    ...(opts.inverted ? { valueText: (v: number) => `#${v}` } : opts.percent ? { valueText: (v: number) => `${(v * 100).toFixed(1)}%` } : {}),
  });
  return {
    ...baseOption(ctx, points),
    tooltip: tooltip(ctx, 'axis', tooltipFmt),
    legend: legend(ctx, names),
    grid: gridBox(ctx, names.length, model.hasSecondary ? { right: ctx.spec.legend.show && names.length >= 2 && ctx.spec.legend.position === 'right' ? 140 : 24 } : {}),
    xAxis,
    yAxis: yAxes.length === 1 ? yAxes[0]! : yAxes,
    dataZoom: dataZoomInside('x'),
    series: deco ? applyDecorations(series, deco) : series,
    __meta: { ...cartesianMeta(ctx.spec, model, deco), sampled: perSeries > LTTB_MIN_POINTS, ...(opts.percent ? { excludedNegatives } : {}) },
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
