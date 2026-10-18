/**
 * Cartesian decorations (docs/CHARTS.md §Decorations): reference lines and
 * bands (`spec.referenceLines` → `markLine` / `markArea`), trend lines
 * (`spec.trendLine` → extra dashed `line` series from `fit`) and annotations
 * (`spec.annotations` → `markPoint` anchors with the note as label), built
 * from the series a cartesian builder already has. Statistics come from
 * `lib/data/stats` (`summary`) and fits from `lib/data/regression` (`fit`),
 * the same code the worker runs. Framework-free (rule R-PURE); imports only
 * types from `option-common` so the two modules never form a runtime cycle.
 */
import type { Annotation, Pill, ReferenceLine, VizSpec } from '../core/types';
import { fit } from '../data/regression';
import { summary } from '../data/stats';
import type { ValueFormatter } from '../format/formatter';
import type { ChartTheme, OptionObject } from './option-common';
import type { Cell } from './transforms';

/** One drawn series as the decorator sees it. */
export interface DecorationSeries {
  /** Series name as it appears in the option (legend / tooltip). */
  name: string;
  /** Values aligned to `DecorationInput.x`. */
  values: Cell[];
  axis: 'primary' | 'secondary';
  pill: Pill;
}

/** What a cartesian builder hands to `cartesianDecorations`. */
export interface DecorationInput {
  spec: VizSpec;
  theme: ChartTheme;
  horizontal: boolean;
  xKind: 'category' | 'time' | 'value';
  /** Category labels, epoch ms or numeric x positions. */
  x: Array<string | number>;
  series: DecorationSeries[];
  /** Series colors by index. */
  colors: string[];
  /** Value formatter per series index. */
  formatters: ValueFormatter[];
  /** Label font size (already scaled by `style.fontScale`). */
  fontSize: number;
}

/** An annotation anchored to a series point, for the canvas's drag handles. */
export interface AnnotationAnchor {
  id: string;
  seriesIndex: number;
  x: string | number;
  y: number;
  text: string;
  offset: [number, number];
}

/** What `cartesianDecorations` returns. */
export interface Decorations {
  /** Mark fragments per series index. */
  marks: Map<number, { markLine?: OptionObject; markArea?: OptionObject; markPoint?: OptionObject }>;
  /** Trend line series to append after the data series. */
  extraSeries: OptionObject[];
  /** Trend series name → fitted equation and R² (tooltip rows when `showEquation`). */
  trendInfo: Map<string, { equation: string; r2: number }>;
  annotations: AnnotationAnchor[];
  /** Reference lines that could not be drawn, with the reason (surfaced in `__meta.notes`). */
  skipped: string[];
}

/** Human prefix per reference-line kind. */
const KIND_LABEL: Record<ReferenceLine['kind'], string> = {
  constant: '', average: 'Avg', median: 'Median', min: 'Min', max: 'Max', percentile: 'P', band: 'Band',
};

/** Milliseconds in a day: trend fits on a time axis use days since the first point so `exp`/`poly` stay well conditioned. */
export const MS_PER_DAY = 86_400_000;

/** ECharts coordinate key for a reference target, given the builder's orientation. */
export function axisKeyFor(target: ReferenceLine['axis'], horizontal: boolean): 'xAxis' | 'yAxis' {
  const valueAxis = target === 'y' || target === 'y2';
  return valueAxis === !horizontal ? 'yAxis' : 'xAxis';
}

/** Resolve a statistic name or constant against a sample. */
function statOf(kind: string | number, values: number[], percentile?: number): number {
  if (typeof kind === 'number') return kind;
  const s = summary(values);
  switch (kind) {
    case 'average': return s.avg;
    case 'median': return s.median;
    case 'min': return s.min;
    case 'max': return s.max;
    case 'p25': return s.p25;
    case 'p75': return s.p75;
    case 'percentile': return s.percentile(percentile ?? 50);
    default: return NaN;
  }
}

/** Finite values of a series list. */
function finite(series: DecorationSeries[]): number[] {
  const out: number[] = [];
  for (const s of series) for (const v of s.values) if (v !== null && Number.isFinite(v)) out.push(v);
  return out;
}

/** Numeric x positions for fitting: index for categories, days since first for time, raw for values. */
function fitXs(input: DecorationInput): { xs: number[]; toX: (fx: number) => number | string; note: string } {
  if (input.xKind === 'category') return { xs: input.x.map((_, i) => i), toX: (fx) => input.x[fx] ?? fx, note: 'x = point index' };
  const nums = input.x.map((v) => Number(v));
  if (input.xKind === 'time') {
    const t0 = Math.min(...nums.filter(Number.isFinite));
    return { xs: nums.map((t) => (t - t0) / MS_PER_DAY), toX: (fx) => t0 + fx * MS_PER_DAY, note: 'x = days since first point' };
  }
  return { xs: nums, toX: (fx) => fx, note: '' };
}

/**
 * Build the decorations for one cartesian option. Reference lines target the
 * axis they name (`y` primary, `y2` secondary, `x`); `scope: 'all'` draws one
 * mark on the first series of that axis from the pooled values, `per-series`
 * one per series from its own values. A statistic on a category x axis has no
 * numeric sample and is skipped with a note; a constant there names a category.
 */
export function cartesianDecorations(input: DecorationInput): Decorations {
  const { spec, theme, horizontal } = input;
  const out: Decorations = { marks: new Map(), extraSeries: [], trendInfo: new Map(), annotations: [], skipped: [] };
  const fragment = (i: number) => { let f = out.marks.get(i); if (!f) { f = {}; out.marks.set(i, f); } return f; };
  const lineItems = new Map<number, OptionObject[]>();
  const areaItems = new Map<number, OptionObject[]>();
  const push = (map: Map<number, OptionObject[]>, i: number, item: OptionObject) => { const l = map.get(i); if (l) l.push(item); else map.set(i, [item]); };
  const xNumeric = input.xKind !== 'category' ? input.x.map(Number).filter(Number.isFinite) : [];

  // Reference lines and bands.
  for (const rl of spec.referenceLines) {
    const key = axisKeyFor(rl.axis, horizontal);
    const onAxis = rl.axis === 'x' ? input.series.map((_, i) => i) : input.series.map((s, i) => (s.axis === (rl.axis === 'y2' ? 'secondary' : 'primary') ? i : -1)).filter((i) => i >= 0);
    if (onAxis.length === 0) { out.skipped.push(`${rl.kind} line: no series on the ${rl.axis} axis`); continue; }
    const targets = rl.scope === 'per-series' && rl.axis !== 'x' ? onAxis : [onAxis[0]!];
    const sampleFor = (i: number): number[] => rl.axis === 'x' ? xNumeric : rl.scope === 'per-series' ? finite([input.series[i]!]) : finite(onAxis.map((j) => input.series[j]!));
    for (const i of targets) {
      const fmt = rl.axis === 'x' ? (v: number) => String(v) : input.formatters[i] ?? ((v: number) => String(v));
      const color = rl.color ?? theme.textMuted;
      const style = { color, type: rl.dash ? 'dashed' : 'solid', width: 1 };
      if (rl.axis === 'x' && input.xKind === 'category') {
        if (rl.kind !== 'constant' || rl.value === undefined) { out.skipped.push(`${rl.kind} line on a category axis needs a constant`); continue; }
        push(lineItems, i, { name: rl.label ?? String(rl.value), [key]: input.x.indexOf(rl.value) >= 0 ? input.x.indexOf(rl.value) : rl.value, lineStyle: style, label: { show: true, formatter: rl.label ?? String(rl.value), position: 'insideEndTop', color, fontSize: input.fontSize } });
        continue;
      }
      if (rl.kind === 'band') {
        const sample = sampleFor(i);
        const from = statOf(rl.from ?? 'min', sample); const to = statOf(rl.to ?? 'max', sample);
        if (!Number.isFinite(from) || !Number.isFinite(to)) { out.skipped.push('band: no values to compute from'); continue; }
        const name = rl.label ?? `${fmt(Math.min(from, to))} – ${fmt(Math.max(from, to))}`;
        push(areaItems, i, [{ name, [key]: Math.min(from, to), itemStyle: { color, opacity: 0.08 }, label: { show: Boolean(rl.label), position: 'insideTopLeft', color, fontSize: input.fontSize } }, { [key]: Math.max(from, to) }] as unknown as OptionObject);
        continue;
      }
      const v = rl.kind === 'constant' ? (rl.value ?? NaN) : statOf(rl.kind, sampleFor(i), rl.value);
      if (!Number.isFinite(v)) { out.skipped.push(`${rl.kind} line: no values to compute from`); continue; }
      const prefix = rl.kind === 'percentile' ? `P${rl.value ?? 50}` : KIND_LABEL[rl.kind];
      const text = rl.label ?? `${prefix}${prefix ? ' ' : ''}${fmt(v)}`;
      push(lineItems, i, { name: text, [key]: v, lineStyle: style, label: { show: true, formatter: text, position: 'insideEndTop', color, fontSize: input.fontSize } });
    }
  }
  for (const [i, data] of lineItems) fragment(i).markLine = { silent: true, symbol: 'none', animation: false, data };
  for (const [i, data] of areaItems) fragment(i).markArea = { silent: true, animation: false, data };

  // Trend lines.
  const tl = spec.trendLine;
  if (tl.enabled && input.series.length > 0) {
    const { xs, toX, note } = fitXs(input);
    const groups: Array<{ name: string; idx: number[]; axis: 'primary' | 'secondary'; color: string }> = tl.perSeries
      ? input.series.map((s, i) => ({ name: s.name, idx: [i], axis: s.axis, color: tl.color ?? input.colors[i] ?? theme.textMuted }))
      : [{ name: 'All', idx: input.series.map((_, i) => i), axis: input.series[0]!.axis, color: tl.color ?? theme.textMuted }];
    for (const g of groups) {
      const fx: number[] = []; const fy: number[] = [];
      for (const i of g.idx) input.series[i]!.values.forEach((v, xi) => { if (v !== null && Number.isFinite(xs[xi] ?? NaN)) { fx.push(xs[xi]!); fy.push(v); } });
      const f = fit(fx, fy, tl.model, tl.degree);
      // A degenerate fit (too few points, constant x, singular system) has NaN coefficients.
      if (f.coef.length === 0 || !f.coef.every(Number.isFinite)) { out.skipped.push(`trend (${g.name}): not enough points to fit`); continue; }
      let data: unknown[];
      if (input.xKind === 'value') {
        const lo = Math.min(...fx); const hi = Math.max(...fx); const n = 50;
        data = Array.from({ length: n }, (_, k) => { const x = lo + ((hi - lo) * k) / (n - 1); const y = f.predict(x); return Number.isFinite(y) ? [x, y] : null; }).filter((p) => p !== null);
      } else if (input.xKind === 'time') {
        data = xs.map((x) => { const y = f.predict(x); return Number.isFinite(y) ? [toX(x), y] : null; }).filter((p) => p !== null);
      } else {
        data = xs.map((x) => { const y = f.predict(x); return Number.isFinite(y) ? y : null; });
      }
      const name = `${g.name} trend`;
      const axisIndex = g.axis === 'secondary' ? 1 : 0;
      out.trendInfo.set(name, { equation: note ? `${f.equation} (${note})` : f.equation, r2: f.r2 });
      out.extraSeries.push({
        type: 'line', name, data, showSymbol: false, symbol: 'none', smooth: tl.model !== 'linear', silent: true, z: 3,
        lineStyle: { type: 'dashed', width: 1.5, color: g.color }, itemStyle: { color: g.color }, emphasis: { disabled: true }, animation: false,
        ...(horizontal ? { xAxisIndex: axisIndex } : { yAxisIndex: axisIndex }),
      });
    }
  }

  // Annotations.
  const byIndex = new Map<number, OptionObject[]>();
  for (const a of spec.annotations) {
    const si = Math.max(0, input.series.findIndex((s) => s.name === a.seriesKey || s.pill.id === a.seriesKey));
    const s = input.series[si];
    if (!s) continue;
    const xi = input.x.findIndex((x) => x === a.x || String(x) === String(a.x));
    const y = a.y ?? (xi >= 0 ? s.values[xi] ?? null : null);
    if (y === null || y === undefined || !Number.isFinite(y)) { out.skipped.push(`annotation "${a.text}": no point at ${String(a.x)}`); continue; }
    const xCoord = input.xKind === 'category' ? (xi >= 0 ? xi : a.x) : a.x;
    const coord = horizontal ? [y, xCoord] : [xCoord, y];
    push(byIndex, si, {
      name: a.id, coord, value: a.text,
      label: {
        show: true, formatter: a.text, position: 'top', offset: a.offset, color: theme.text, fontSize: input.fontSize,
        backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1, borderRadius: 4, padding: [4, 6],
      },
    });
    out.annotations.push({ id: a.id, seriesIndex: si, x: a.x, y, text: a.text, offset: a.offset });
  }
  for (const [i, data] of byIndex) fragment(i).markPoint = { symbol: 'circle', symbolSize: 7, itemStyle: { color: theme.navy, borderColor: theme.bg, borderWidth: 1 }, animation: false, data };
  return out;
}

/** Merge the mark fragments into the data series (by index) and append the trend series. */
export function applyDecorations(series: OptionObject[], deco: Decorations): OptionObject[] {
  const out = series.map((s, i) => { const f = deco.marks.get(i); return f ? { ...s, ...f } : s; });
  return [...out, ...deco.extraSeries];
}

/** Tooltip row text for a trend series, or `null` to hide it (no equation requested). */
export function trendTooltipText(name: string, deco: Decorations | undefined, show: boolean): string | null | undefined {
  const info = deco?.trendInfo.get(name);
  if (!info) return undefined;
  return show ? `${info.equation} · R² ${info.r2.toFixed(3)}` : null;
}

/** The annotation anchors of an option (`__meta.annotations`), typed. */
export function annotationAnchors(option: OptionObject): AnnotationAnchor[] {
  const meta = option.__meta as { annotations?: AnnotationAnchor[] } | undefined;
  return meta?.annotations ?? [];
}

/** True when the spec carries anything to decorate (lets builders skip the pass). */
export function hasDecorations(spec: VizSpec): boolean {
  return spec.referenceLines.length > 0 || spec.trendLine.enabled || spec.annotations.length > 0;
}

/** Annotations of a spec keyed by id. */
export function annotationById(spec: VizSpec): Map<string, Annotation> {
  return new Map(spec.annotations.map((a) => [a.id, a]));
}
