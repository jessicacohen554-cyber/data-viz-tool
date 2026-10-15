/**
 * Highlight table (CHARTS.md #19, DOM renderer): ≥ 1 D (+ a second D for a
 * matrix) + 1 M; cell background from the measure through the continuous
 * ramp, text color by the WCAG contrast rule. `build` returns the model
 * `HighlightTable.svelte` renders (virtualised above 200 rows).
 */
import type { ChartDef } from '../registry';
import {
  classify, continuousStops, dimFormatter, dimsOn, formatterFor, interpolateStops, pillLabel, requireDim, requireMeasure, svgIcon, textOn, themeOf,
} from '../option-common';
import { grid } from '../transforms';

/** One rendered cell. */
export interface HighlightCell { text: string; bg: string | null; fg: string }

/** The DOM model. */
export interface HighlightModel {
  renderer: 'dom';
  kind: 'highlight';
  /** Header of the row-label column. */
  rowHeader: string;
  /** Column headers (x labels); a single `measure` column when only one D is present. */
  columns: string[];
  rows: Array<{ label: string; cells: HighlightCell[] }>;
  min: number;
  max: number;
}

export const highlightTable: ChartDef = {
  id: 'highlight-table',
  label: 'Highlight table',
  group: 'table',
  icon: svgIcon('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16M15 4v16"/><rect x="9" y="9" width="6" height="5" fill="currentColor" fill-opacity="0.5"/>'),
  requires: { dims: [1, 2], measures: [1, 1] },
  channels: ['color', 'label', 'tooltip'],
  renderer: 'dom',
  echartsModules: [],
  build: (ctx) => {
    const spec = ctx.spec;
    const c = classify(spec);
    const yPill = dimsOn(spec, 'rows')[0] ?? c.dims[0];
    const xPill = dimsOn(spec, 'columns').find((d) => d.id !== yPill?.id) ?? c.dims.find((d) => d.id !== yPill?.id);
    const mPill = (spec.shelves.color[0]?.role === 'measure' ? spec.shelves.color[0] : undefined) ?? c.measures[0];
    const yDim = requireDim(ctx, yPill, 'Rows');
    const xDim = xPill ? requireDim(ctx, xPill, 'Columns') : undefined;
    const m = requireMeasure(ctx, mPill, 'the measure');
    const g = grid(ctx.result.groups, yDim, xDim, m);
    const theme = themeOf(ctx);
    const fmt = formatterFor(ctx, mPill);
    const yFmt = dimFormatter(ctx, yPill); const xFmt = dimFormatter(ctx, xPill);
    const { stops, domain, midpoint } = continuousStops(ctx);
    let lo = domain ? domain[0] : g.min; let hi = domain ? domain[1] : g.max;
    if (midpoint !== undefined) { const span = Math.max(Math.abs(hi - midpoint), Math.abs(lo - midpoint)); lo = midpoint - span; hi = midpoint + span; }
    const ramp = spec.palette.reverse ? [...stops].reverse() : stops;
    const t = (v: number) => (hi === lo ? 0.5 : (v - lo) / (hi - lo));
    const columns = xDim ? g.ys.map((y) => xFmt(y)) : [pillLabel(mPill!)];
    // `grid` was called with the row dimension first, so cells are [rowIndex, columnIndex, value].
    const rows = g.xs.map((x) => ({ label: yFmt(x), cells: columns.map((): HighlightCell => ({ text: '', bg: null, fg: theme.text })) }));
    for (const [ri, ci, v] of g.cells) {
      const row = rows[ri];
      if (!row) continue;
      const bg = interpolateStops(ramp, t(v));
      row.cells[xDim ? ci : 0] = { text: fmt(v), bg, fg: textOn(bg, theme) };
    }
    const model: HighlightModel = { renderer: 'dom', kind: 'highlight', rowHeader: yPill ? pillLabel(yPill) : '', columns, rows, min: g.min, max: g.max };
    return model as unknown as Record<string, unknown>;
  },
};
