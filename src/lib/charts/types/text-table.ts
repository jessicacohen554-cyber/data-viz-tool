/**
 * Text table (CHARTS.md #33, DOM renderer): a row header per D (shelf order), a
 * column per M (Rows/Columns/Label/Tooltip), numbers right-aligned in mono;
 * `TextTable.svelte` virtualises above 200 rows. With no pills the canvas shows
 * the dataset's raw rows (served by S1's `rows()`), not this model.
 */
import type { ChartDef } from '../registry';
import { classify, dimFormatter, dimOf, formatterFor, measureOf, pillLabel, svgIcon } from '../option-common';
import { dimAccessor, measureAt } from '../transforms';

/** A table column. */
export interface TableColumn { key: string; label: string; align: 'left' | 'right'; kind: 'dimension' | 'measure' }

/** The DOM model. */
export interface TableModel {
  renderer: 'dom';
  kind: 'table';
  columns: TableColumn[];
  /** Display strings per row, aligned to `columns`. */
  rows: string[][];
  total: number;
  truncated: boolean;
}

export const textTable: ChartDef = {
  id: 'text-table',
  label: 'Text table',
  group: 'table',
  icon: svgIcon('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M10 4v16"/>'),
  requires: { dims: [0, 8], measures: [0, 16] },
  channels: ['label', 'tooltip'],
  renderer: 'dom',
  echartsModules: [],
  build: (ctx) => {
    const spec = ctx.spec;
    const c = classify(spec);
    const dimPills = c.dims;
    const measurePills = [...c.measures, ...spec.shelves.tooltip.filter((p) => p.role === 'measure')].filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
    const dimCols = dimPills.map((p) => ({ pill: p, dim: dimOf(ctx, p), fmt: dimFormatter(ctx, p) })).filter((e) => e.dim !== undefined);
    const mCols = measurePills.map((p) => ({ pill: p, m: measureOf(ctx, p), fmt: formatterFor(ctx, p) })).filter((e) => e.m !== undefined);
    const columns: TableColumn[] = [
      ...dimCols.map((e) => ({ key: e.pill.id, label: pillLabel(e.pill), align: 'left' as const, kind: 'dimension' as const })),
      ...mCols.map((e) => ({ key: e.pill.id, label: pillLabel(e.pill), align: 'right' as const, kind: 'measure' as const })),
    ];
    const n = ctx.result.groups;
    const ats = dimCols.map((e) => dimAccessor(e.dim!));
    const rows: string[][] = new Array<string[]>(n);
    for (let i = 0; i < n; i++) {
      const row: string[] = [];
      dimCols.forEach((e, k) => row.push(e.fmt(ats[k]!(i))));
      for (const e of mCols) { const v = measureAt(e.m!, i); row.push(v === null ? '' : e.fmt(v)); }
      rows[i] = row;
    }
    const model: TableModel = { renderer: 'dom', kind: 'table', columns, rows, total: n, truncated: ctx.result.truncated };
    return model as unknown as Record<string, unknown>;
  },
};
