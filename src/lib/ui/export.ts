/**
 * Export and import (shard S5): the aggregated result as a formatted CSV, the
 * spec as JSON, a JSON file back into a validated `VizSpec`, and the chart
 * canvas as a PNG. The string builders (`csvOf`, `jsonOf`, `parseSpecJson`)
 * are pure and unit-tested; the `export*` wrappers add the browser download.
 * Lives under `lib/ui` because it touches the DOM; `lib/core` must stay pure.
 */
import type { FieldMeta, FormatSpec, Pill, QueryResult, ResultDim, ShelfId, VizSpec } from '../core/types';
import { AGGREGATION_LABEL } from '../core/constants';
import { migrateSpec } from '../core/url-codec';
import { validateSpec } from '../core/validate-spec';
import { makeFormatter, type ValueFormatter } from '../format/formatter';

/** Base file name for downloads: the title, else the dataset id, else `viz`. */
export function fileStem(spec: VizSpec): string {
  const raw = spec.title.trim() || spec.datasetId || 'viz';
  return raw.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'viz';
}

/** Quote one CSV cell per RFC 4180 (quotes only when needed). */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Tableau-style pill caption: alias, `YEAR(field)`, `field (bin)`, `SUM(field)` or the field. */
export function pillLabel(pill: Pill): string {
  if (pill.alias) return pill.alias;
  if (pill.date) return `${pill.date.level.toUpperCase()}(${pill.field})`;
  if (pill.bin) return `${pill.field} (bin)`;
  if (pill.role === 'measure' && pill.aggregation !== 'none') return `${AGGREGATION_LABEL[pill.aggregation]}(${pill.field})`;
  return pill.field;
}

function findPill(spec: VizSpec, id: string): Pill | undefined {
  for (const shelf of Object.keys(spec.shelves) as ShelfId[]) {
    const p = spec.shelves[shelf].find((pp) => pp.id === id);
    if (p) return p;
  }
  return undefined;
}

/** The formatter a pill's values display with: the pill's own format, else the field default, else automatic. */
export function formatterFor(pill: Pill | undefined, field: string, spec: VizSpec, meta: FieldMeta[]): ValueFormatter {
  const fm = meta.find((m) => m.name === field);
  if (!fm) return (v) => (v === null || v === undefined ? '' : String(v));
  const fs: FormatSpec | undefined = pill?.format ?? spec.fieldFormats[field];
  return makeFormatter(fm, fs);
}

function dimCell(dim: ResultDim, i: number, fmt: ValueFormatter): string {
  if (dim.kind === 'codes') {
    const code = dim.codes?.[i];
    if (code === undefined || code < 0) return '';
    return dim.labels?.[code] ?? '';
  }
  const v = dim.values?.[i];
  return v === undefined || Number.isNaN(v) ? '' : fmt(v);
}

/**
 * The aggregated table as CSV: one column per result dimension then per
 * measure, headers from the pills, cells formatted as the chart shows them
 * (docs/CHARTS.md #33: "CSV export is this table"). Null groups are empty cells.
 */
export function csvOf(result: QueryResult, spec: VizSpec, meta: FieldMeta[]): string {
  const columns: Array<{ header: string; cell: (i: number) => string }> = [];
  for (const dim of result.dims) {
    const pill = findPill(spec, dim.key);
    const field = pill?.field ?? dim.key;
    const fmt = formatterFor(pill, field, spec, meta);
    columns.push({ header: pill ? pillLabel(pill) : dim.key, cell: (i) => dimCell(dim, i, fmt) });
  }
  for (const m of result.measures) {
    const pill = findPill(spec, m.key);
    const field = pill?.field ?? m.key;
    const fmt = formatterFor(pill, field, spec, meta);
    columns.push({
      header: pill ? pillLabel(pill) : m.key,
      cell: (i) => { const v = m.values[i]; return v === undefined || Number.isNaN(v) ? '' : fmt(v); },
    });
  }
  const lines: string[] = [columns.map((c) => csvCell(c.header)).join(',')];
  for (let i = 0; i < result.groups; i++) lines.push(columns.map((c) => csvCell(c.cell(i))).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** The spec as pretty JSON (the import format). */
export function jsonOf(spec: VizSpec): string {
  return JSON.stringify(spec, null, 2) + '\n';
}

/**
 * Parse JSON text into a validated `VizSpec`, migrating older versions.
 * With `meta`, every pill must name a loaded field. Throws an `Error` whose
 * message lists the problems.
 */
export function parseSpecJson(text: string, meta?: FieldMeta[]): VizSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON');
  }
  const migrated = migrateSpec(parsed);
  const problems = validateSpec(migrated, meta);
  if (problems.length > 0) throw new Error(`Not a valid view: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? '; …' : ''}`);
  return migrated as VizSpec;
}

/** Read a JSON file from the device into a validated `VizSpec` (rejects with the problems). */
export async function importJson(file: Blob, meta?: FieldMeta[]): Promise<VizSpec> {
  return parseSpecJson(await file.text(), meta);
}

/** Trigger a browser download of `blob` as `name`. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Download the aggregated table as `<stem>.csv`. */
export function exportCsv(result: QueryResult, spec: VizSpec, meta: FieldMeta[]): void {
  downloadBlob(`${fileStem(spec)}.csv`, new Blob([csvOf(result, spec, meta)], { type: 'text/csv;charset=utf-8' }));
}

/** Download the spec as `<stem>.viz.json`. */
export function exportJson(spec: VizSpec): void {
  downloadBlob(`${fileStem(spec)}.viz.json`, new Blob([jsonOf(spec)], { type: 'application/json' }));
}

/** What the chart canvas hands back for a PNG: a data URL, a Blob, or null when nothing is rendered. */
export type CanvasToPng = () => Promise<string | Blob | null> | string | Blob | null;

/** Decode a `data:` URL into a Blob (no fetch, so it works offline and in file:// contexts). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const mime = /^data:([^;,]+)/.exec(header)?.[1] ?? 'application/octet-stream';
  if (/;base64/i.test(header)) {
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

/** Download the chart as `<stem>.png`. Resolves false when the canvas had nothing to give. */
export async function exportPng(canvasToPng: CanvasToPng, spec: VizSpec): Promise<boolean> {
  const out = await canvasToPng();
  if (!out) return false;
  const blob = typeof out === 'string' ? dataUrlToBlob(out) : out;
  downloadBlob(`${fileStem(spec)}.png`, blob);
  return true;
}
