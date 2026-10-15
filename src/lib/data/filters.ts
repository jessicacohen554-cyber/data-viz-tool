/**
 * Row masks for `FilterSpec`s (shard S1).
 *
 * `buildMask(store, filters)` ANDs one `Uint8Array` mask per filter (1 = row
 * passes) and returns `null` when there is nothing to filter. Per-filter masks
 * are cached on `store.maskCache` under the filter's canonical key, so a query
 * that only changes the pills reuses them (docs/ARCHITECTURE.md §3). All five
 * kinds of docs/TABLEAU-SPEC.md §6.2 are covered; Top N is evaluated with the
 * inner aggregate computed over the rows that survive every *other* filter,
 * then turned into a mask (Tableau's context-free Top N).
 *
 * Imports the aggregation kernel from `engine.ts`, which imports `buildMask`
 * back: the cycle is function-level only (both are hoisted declarations used
 * at call time), never at module evaluation.
 *
 * Must not import svelte or DOM (R-PURE). Returned masks are shared with the
 * cache: callers never mutate them.
 */
import type { FilterSpec } from '../core/types';
import { stableStringify } from '../core/query-of';
import { BOOL_NULL, I32_NULL, labelAt, type Column, type ColumnStore } from './column-store';
import { periodEnd } from './date-parse';
import { aggregateMeasure, fieldCodes } from './engine';

/** Masks kept per store; the oldest entry is evicted beyond this. */
const MASK_CACHE_SIZE = 32;

/** Canonical cache key of a filter (pill id excluded, keys sorted). */
export function filterKey(f: FilterSpec): string {
  const { pillId: _omit, ...rest } = f;
  return stableStringify(rest);
}

/**
 * AND of every filter's mask; `null` when `filters` is empty. Throws on an
 * unknown field (the worker reports it as `bad-request`).
 */
export function buildMask(store: ColumnStore, filters: readonly FilterSpec[]): Uint8Array | null {
  if (filters.length === 0) return null;
  let out: Uint8Array | null = null;
  for (const f of filters) {
    const m = maskFor(store, f, filters);
    if (!out) { out = m; continue; }
    if (out === m) continue;
    const next = new Uint8Array(store.rowCount);
    for (let i = 0; i < next.length; i++) next[i] = (out[i]! & m[i]!) as 0 | 1;
    out = next;
  }
  return out;
}

/** Count the rows a mask passes (`null` = every row). */
export function countMask(mask: Uint8Array | null, rowCount: number): number {
  if (!mask) return rowCount;
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i]!;
  return n;
}

function maskFor(store: ColumnStore, f: FilterSpec, all: readonly FilterSpec[]): Uint8Array {
  let key = filterKey(f);
  if (f.kind === 'topN') {
    const others = all.filter((g) => g !== f).map(filterKey).sort();
    key = `${key}|ctx:${others.join('|')}`;
  }
  const hit = store.maskCache.get(key);
  if (hit) return hit;
  if (store.indexOf(f.field) < 0) throw new Error(`unknown field in filter: ${f.field}`);
  const mask = compute(store, f, all);
  if (store.maskCache.size >= MASK_CACHE_SIZE) {
    const oldest = store.maskCache.keys().next().value;
    if (oldest !== undefined) store.maskCache.delete(oldest);
  }
  store.maskCache.set(key, mask);
  return mask;
}

function compute(store: ColumnStore, f: FilterSpec, all: readonly FilterSpec[]): Uint8Array {
  switch (f.kind) {
    case 'categorical': return categorical(store, f);
    case 'range': return range(store, f);
    case 'dateRange': return dateRange(store, f);
    case 'wildcard': return wildcard(store, f);
    case 'topN': return topN(store, f, all);
  }
}

// ---------------------------------------------------------------------------

function categorical(store: ColumnStore, f: Extract<FilterSpec, { kind: 'categorical' }>): Uint8Array {
  const col = store.column(f.field);
  const n = store.rowCount;
  const mask = new Uint8Array(n);
  const include = f.mode === 'include';
  const nullBit = f.includeNull ? 1 : 0;
  if (col.storage === 'dict') {
    const want = new Uint8Array(col.dict.length);
    const pos = new Map<string, number>();
    col.dict.forEach((s, i) => pos.set(s, i));
    for (const v of f.values) { const c = pos.get(v); if (c !== undefined) want[c] = 1; }
    for (let i = 0; i < n; i++) {
      const c = col.codes[i]!;
      mask[i] = c < 0 ? nullBit : (want[c]! === 1) === include ? 1 : 0;
    }
    return mask;
  }
  if (col.storage === 'i32' || col.storage === 'f64' || col.storage === 'bool') {
    const set = new Set<number>();
    for (const v of f.values) {
      if (col.storage === 'bool') { const t = v.toLowerCase(); if (t === 'true') set.add(1); else if (t === 'false') set.add(0); }
      else { const x = Number(v); if (Number.isFinite(x)) set.add(x); }
    }
    for (let i = 0; i < n; i++) {
      const v = col.values[i]!;
      const isNull = col.storage === 'i32' ? v === I32_NULL : col.storage === 'bool' ? v === BOOL_NULL : v !== v;
      mask[i] = isNull ? nullBit : set.has(v) === include ? 1 : 0;
    }
    return mask;
  }
  // Dates compare by their ISO label.
  const labels = new Set(f.values);
  for (let i = 0; i < n; i++) {
    const v = col.values[i]!;
    mask[i] = v !== v ? nullBit : labels.has(labelAt(col, i)) === include ? 1 : 0;
  }
  return mask;
}

function range(store: ColumnStore, f: Extract<FilterSpec, { kind: 'range' }>): Uint8Array {
  const vals = store.numericView(f.field);
  const n = store.rowCount;
  const mask = new Uint8Array(n);
  const lo = f.min ?? -Infinity, hi = f.max ?? Infinity;
  const nullBit = f.includeNull ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const v = vals[i]!;
    mask[i] = v !== v ? nullBit : v >= lo && v <= hi ? 1 : 0;
  }
  return mask;
}

function dateRange(store: ColumnStore, f: Extract<FilterSpec, { kind: 'dateRange' }>): Uint8Array {
  const vals = store.numericView(f.field);
  const n = store.rowCount;
  const mask = new Uint8Array(n);
  const lo = f.from ?? -Infinity;
  const hi = f.to === null ? Infinity : f.level ? periodEnd(f.to, f.level) : f.to;
  for (let i = 0; i < n; i++) {
    const v = vals[i]!;
    mask[i] = v === v && v >= lo && v <= hi ? 1 : 0;
  }
  return mask;
}

/** Case-insensitive match of one label against the wildcard pattern. */
export function wildcardMatch(label: string, pattern: string, mode: 'contains' | 'starts' | 'ends' | 'exact'): boolean {
  const l = label.toLowerCase();
  switch (mode) {
    case 'contains': return l.includes(pattern);
    case 'starts': return l.startsWith(pattern);
    case 'ends': return l.endsWith(pattern);
    case 'exact': return l === pattern;
  }
}

function wildcard(store: ColumnStore, f: Extract<FilterSpec, { kind: 'wildcard' }>): Uint8Array {
  const col: Column = store.column(f.field);
  const n = store.rowCount;
  const mask = new Uint8Array(n);
  const pattern = f.pattern.toLowerCase();
  if (col.storage === 'dict') {
    const want = new Uint8Array(col.dict.length);
    col.dict.forEach((s, i) => { want[i] = wildcardMatch(s, pattern, f.mode) ? 1 : 0; });
    for (let i = 0; i < n; i++) { const c = col.codes[i]!; mask[i] = c < 0 ? 0 : want[c]!; }
    return mask;
  }
  for (let i = 0; i < n; i++) {
    const label = labelAt(col, i);
    mask[i] = label !== 'Null' && wildcardMatch(label, pattern, f.mode) ? 1 : 0;
  }
  return mask;
}

function topN(store: ColumnStore, f: Extract<FilterSpec, { kind: 'topN' }>, all: readonly FilterSpec[]): Uint8Array {
  const others = all.filter((g) => g !== f);
  const context = buildMask(store, others);
  const { codes, offset, K } = fieldCodes(store, f.field);
  const groupOf = new Int32Array(store.rowCount);
  for (let i = 0; i < groupOf.length; i++) { const c = codes[i]!; groupOf[i] = c < 0 ? -1 : c + offset; }
  const values = aggregateMeasure(store, groupOf, K, { key: 'topn', field: f.by.field, aggregation: f.by.aggregation }, context);
  const ranked: number[] = [];
  for (let c = 0; c < K; c++) if (values[c]! === values[c]!) ranked.push(c);
  const sign = f.dir === 'top' ? -1 : 1;
  ranked.sort((a, b) => sign * (values[a]! - values[b]!) || a - b);
  const keep = new Uint8Array(K);
  for (let i = 0; i < Math.min(f.n, ranked.length); i++) keep[ranked[i]!] = 1;
  const mask = new Uint8Array(store.rowCount);
  for (let i = 0; i < mask.length; i++) { const g = groupOf[i]!; mask[i] = g < 0 ? 0 : keep[g]!; }
  return mask;
}
