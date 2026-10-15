/**
 * Typed column storage for one loaded dataset (shard S1).
 *
 * Owns the `Column` variants, the five builders that turn raw CSV cells into
 * them (`DictBuilder`, `F64Builder`, `I32Builder`, `DateBuilder`,
 * `BoolBuilder`), `ColumnStore` (columns + `FieldMeta` + lazily cached derived
 * columns: date parts, date-trunc keys, distinct keys, numeric views, filter
 * masks) and `finalizeMeta`, which fills the full-file statistics of a
 * `FieldMeta` from its column (docs/TABLEAU-SPEC.md §1.3).
 *
 * Storage (docs/ARCHITECTURE.md §3): strings → `Int32Array` codes into a
 * dictionary sorted case-insensitively by code point (code −1 = null); numbers
 * → `Float64Array` (`NaN` null) or `Int32Array` (`I32_NULL` sentinel) when
 * whole and within ±2^31; dates → epoch-ms `Float64Array`; booleans →
 * `Uint8Array` 0/1/255.
 *
 * Must not import svelte or DOM (R-PURE).
 */
import type { DateLevel, FieldMeta, Storage } from '../core/types';
import { HIGH_CARDINALITY_MIN, TOP_VALUES_LIMIT } from '../core/constants';
import { datePart, dateTrunc, isoLabel, type DateParser } from './date-parse';
import { INT32_LIMIT, TRUE_TOKENS, isNullToken } from './type-inference';

/** Null sentinel for `i32` columns (−2^31; never a legal value, §1.2 requires |v| < 2^31). */
export const I32_NULL = -2_147_483_648;

/** Null sentinel for `bool` columns. */
export const BOOL_NULL = 255;

/** Exact distinct counts are computed up to this many rows for f64/date columns (then approximate). */
const EXACT_CARDINALITY_ROWS = 1_000_000;

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/** String column: `codes[i]` indexes `dict`; −1 is null. `dict` is sorted (see module doc). */
export interface DictColumn { storage: 'dict'; codes: Int32Array; dict: string[] }
/** Decimal column; `NaN` is null. */
export interface F64Column { storage: 'f64'; values: Float64Array }
/** Whole-number column; `I32_NULL` is null. */
export interface I32Column { storage: 'i32'; values: Int32Array }
/** Epoch-ms column (UTC); `NaN` is null. */
export interface DateColumn { storage: 'date'; values: Float64Array }
/** Boolean column: 0, 1 or `BOOL_NULL`. */
export interface BoolColumn { storage: 'bool'; values: Uint8Array }

/** Any stored column; discriminated by `storage`. */
export type Column = DictColumn | F64Column | I32Column | DateColumn | BoolColumn;

/** What a builder hands back. */
export interface BuiltColumn { column: Column; parseErrors: number }

/** Incrementally builds one column from raw cells. */
export interface ColumnBuilder {
  readonly storage: Storage;
  /** Append one raw cell (null tokens become null). */
  push(raw: string): void;
  /** Append a null (missing cell). */
  pushNull(): void;
  /** Rows pushed so far. */
  readonly length: number;
  finish(): BuiltColumn;
}

// ---------------------------------------------------------------------------
// Growable typed arrays
// ---------------------------------------------------------------------------

function grow<T extends Int32Array | Float64Array | Uint8Array>(a: T, need: number): T {
  if (need <= a.length) return a;
  const next = new (a.constructor as new (n: number) => T)(Math.max(need, Math.ceil(a.length * 1.75), 1024));
  next.set(a);
  return next;
}

/** True when the cell has a non-whitespace character (`Number('')` and `Number('  ')` are both 0). */
function isNonBlank(raw: string): boolean {
  for (let i = 0; i < raw.length; i++) if (raw.charCodeAt(i) > 32) return true;
  return false;
}

/** Case-insensitive code-point comparison with a code-point tiebreak: deterministic on every device. */
export function compareLabels(a: string, b: string): number {
  const la = a.toLowerCase(), lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Builds a `dict` column; codes are assigned in first-seen order then remapped to the sorted dictionary at `finish`. */
export class DictBuilder implements ColumnBuilder {
  readonly storage = 'dict' as const;
  private codes: Int32Array;
  private readonly index = new Map<string, number>();
  private readonly values: string[] = [];
  private n = 0;

  constructor(capacity = 1024) { this.codes = new Int32Array(Math.max(capacity, 16)); }
  get length(): number { return this.n; }

  push(raw: string): void {
    if (isNullToken(raw)) { this.pushNull(); return; }
    let code = this.index.get(raw);
    if (code === undefined) { code = this.values.length; this.index.set(raw, code); this.values.push(raw); }
    this.codes = grow(this.codes, this.n + 1);
    this.codes[this.n++] = code;
  }

  pushNull(): void {
    this.codes = grow(this.codes, this.n + 1);
    this.codes[this.n++] = -1;
  }

  finish(): BuiltColumn {
    const order = this.values.map((_, i) => i).sort((x, y) => compareLabels(this.values[x]!, this.values[y]!));
    const remap = new Int32Array(order.length);
    const dict = new Array<string>(order.length);
    order.forEach((old, pos) => { remap[old] = pos; dict[pos] = this.values[old]!; });
    const codes = this.codes.length === this.n ? this.codes : this.codes.slice(0, this.n);
    for (let i = 0; i < this.n; i++) { const c = codes[i]!; if (c >= 0) codes[i] = remap[c]!; }
    return { column: { storage: 'dict', codes, dict }, parseErrors: 0 };
  }
}

/** Builds an `f64` column; unparsable cells become null and count as parse errors. */
export class F64Builder implements ColumnBuilder {
  readonly storage = 'f64' as const;
  private values: Float64Array;
  private n = 0;
  private errors = 0;

  constructor(capacity = 1024) { this.values = new Float64Array(Math.max(capacity, 16)); }
  get length(): number { return this.n; }

  push(raw: string): void {
    if (this.n >= this.values.length) this.values = grow(this.values, this.n + 1);
    // Fast path first: `Number` accepts every numeric cell; only 0 can also mean a blank cell.
    const v = Number(raw);
    if (v === v && v !== Infinity && v !== -Infinity && (v !== 0 || isNonBlank(raw))) { this.values[this.n++] = v; return; }
    if (!isNullToken(raw)) this.errors++;
    this.values[this.n++] = NaN;
  }

  pushNull(): void {
    if (this.n >= this.values.length) this.values = grow(this.values, this.n + 1);
    this.values[this.n++] = NaN;
  }

  /** Append an already parsed value (used by `I32Builder` on promotion). */
  pushNumber(v: number): void {
    this.values = grow(this.values, this.n + 1);
    this.values[this.n++] = v;
  }

  finish(): BuiltColumn {
    const values = this.values.length === this.n ? this.values : this.values.slice(0, this.n);
    return { column: { storage: 'f64', values }, parseErrors: this.errors };
  }
}

/**
 * Builds an `i32` column. A non-integer or out-of-range finite value promotes
 * the whole column to `f64` (one copy); the promotion can happen at any row so
 * no value is silently lost, and the reported storage reflects the outcome.
 */
export class I32Builder implements ColumnBuilder {
  readonly storage = 'i32' as const;
  private values: Int32Array;
  private n = 0;
  private errors = 0;
  private promoted: F64Builder | null = null;

  constructor(private readonly capacity = 1024) { this.values = new Int32Array(Math.max(capacity, 16)); }
  get length(): number { return this.promoted ? this.promoted.length : this.n; }

  push(raw: string): void {
    if (this.promoted) { this.promoted.push(raw); return; }
    if (this.n >= this.values.length) this.values = grow(this.values, this.n + 1);
    const v = Number(raw);
    if (Number.isInteger(v) && v > -INT32_LIMIT && v < INT32_LIMIT && (v !== 0 || isNonBlank(raw))) {
      this.values[this.n++] = v;
      return;
    }
    if (!Number.isFinite(v)) {
      if (!isNullToken(raw)) this.errors++;
      this.values[this.n++] = I32_NULL;
      return;
    }
    if (v === 0) { this.values[this.n++] = I32_NULL; return; } // blank cell
    this.promote().pushNumber(v);
  }

  pushNull(): void {
    if (this.promoted) { this.promoted.pushNull(); return; }
    if (this.n >= this.values.length) this.values = grow(this.values, this.n + 1);
    this.values[this.n++] = I32_NULL;
  }

  private promote(): F64Builder {
    const f = new F64Builder(Math.max(this.capacity, this.n * 2));
    for (let i = 0; i < this.n; i++) { const v = this.values[i]!; f.pushNumber(v === I32_NULL ? NaN : v); }
    this.promoted = f;
    this.values = new Int32Array(0);
    return f;
  }

  finish(): BuiltColumn {
    if (this.promoted) {
      const b = this.promoted.finish();
      return { column: b.column, parseErrors: b.parseErrors + this.errors };
    }
    const values = this.values.length === this.n ? this.values : this.values.slice(0, this.n);
    return { column: { storage: 'i32', values }, parseErrors: this.errors };
  }
}

/** Builds a `date` column with a compiled parser; unparsable cells are null parse errors. */
export class DateBuilder implements ColumnBuilder {
  readonly storage = 'date' as const;
  private values: Float64Array;
  private n = 0;
  private errors = 0;

  constructor(private readonly parser: DateParser, capacity = 1024) { this.values = new Float64Array(Math.max(capacity, 16)); }
  get length(): number { return this.n; }

  push(raw: string): void {
    if (isNullToken(raw)) { this.pushNull(); return; }
    const v = this.parser.parse(raw);
    if (v !== v) this.errors++;
    this.values = grow(this.values, this.n + 1);
    this.values[this.n++] = v;
  }

  pushNull(): void {
    this.values = grow(this.values, this.n + 1);
    this.values[this.n++] = NaN;
  }

  finish(): BuiltColumn {
    const values = this.values.length === this.n ? this.values : this.values.slice(0, this.n);
    return { column: { storage: 'date', values }, parseErrors: this.errors };
  }
}

/** Builds a `bool` column from true/false/t/f/yes/no/y/n (case-insensitive); anything else is a null parse error. */
export class BoolBuilder implements ColumnBuilder {
  readonly storage = 'bool' as const;
  private values: Uint8Array;
  private n = 0;
  private errors = 0;

  constructor(capacity = 1024) { this.values = new Uint8Array(Math.max(capacity, 16)); }
  get length(): number { return this.n; }

  push(raw: string): void {
    if (isNullToken(raw)) { this.pushNull(); return; }
    const t = raw.trim().toLowerCase();
    let v = BOOL_NULL;
    if (TRUE_TOKENS.has(t)) v = 1;
    else if (t === 'false' || t === 'f' || t === 'no' || t === 'n') v = 0;
    else this.errors++;
    this.values = grow(this.values, this.n + 1);
    this.values[this.n++] = v;
  }

  pushNull(): void {
    this.values = grow(this.values, this.n + 1);
    this.values[this.n++] = BOOL_NULL;
  }

  finish(): BuiltColumn {
    const values = this.values.length === this.n ? this.values : this.values.slice(0, this.n);
    return { column: { storage: 'bool', values }, parseErrors: this.errors };
  }
}

/** Builder for a storage kind; `date` needs its compiled parser. */
export function builderFor(storage: Storage, capacity: number, parser?: DateParser): ColumnBuilder {
  switch (storage) {
    case 'dict': return new DictBuilder(capacity);
    case 'f64': return new F64Builder(capacity);
    case 'i32': return new I32Builder(capacity);
    case 'bool': return new BoolBuilder(capacity);
    case 'date':
      if (!parser) throw new Error('DateBuilder needs a parser');
      return new DateBuilder(parser, capacity);
  }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/** Is cell `i` null? */
export function isNullAt(col: Column, i: number): boolean {
  switch (col.storage) {
    case 'dict': return col.codes[i]! < 0;
    case 'i32': return col.values[i] === I32_NULL;
    case 'bool': return col.values[i] === BOOL_NULL;
    default: { const v = col.values[i]!; return v !== v; }
  }
}

/** Display label of cell `i` (dict text, number as text, ISO date, `True`/`False`, `Null`). */
export function labelAt(col: Column, i: number): string {
  switch (col.storage) {
    case 'dict': { const c = col.codes[i]!; return c < 0 ? 'Null' : col.dict[c]!; }
    case 'i32': { const v = col.values[i]!; return v === I32_NULL ? 'Null' : String(v); }
    case 'bool': { const v = col.values[i]!; return v === BOOL_NULL ? 'Null' : v === 1 ? 'True' : 'False'; }
    case 'date': return isoLabel(col.values[i]!);
    case 'f64': { const v = col.values[i]!; return v !== v ? 'Null' : String(v); }
  }
}

/** Rows probed to choose between a hash set (few distinct values) and a sort (many) for cardinality. */
const CARDINALITY_PROBE = 50_000;

/**
 * Distinct non-null count of a float array: exact up to `EXACT_CARDINALITY_ROWS`
 * (scaled from a prefix beyond). A probe of the first rows picks the cheaper
 * method: a `Set` when few values repeat rarely, a typed-array sort otherwise.
 */
function floatCardinality(values: Float64Array): number {
  const n = Math.min(values.length, EXACT_CARDINALITY_ROWS);
  const probeN = Math.min(n, CARDINALITY_PROBE);
  const probe = new Set<number>();
  for (let i = 0; i < probeN; i++) { const v = values[i]!; if (v === v) probe.add(v); }
  let distinct: number;
  if (probe.size < probeN * 0.5) {
    for (let i = probeN; i < n; i++) { const v = values[i]!; if (v === v) probe.add(v); }
    distinct = probe.size;
  } else {
    const copy = new Float64Array(n);
    let m = 0;
    for (let i = 0; i < n; i++) { const v = values[i]!; if (v === v) copy[m++] = v; }
    const sorted = copy.subarray(0, m).sort();
    distinct = 0;
    for (let i = 0; i < m; i++) if (i === 0 || sorted[i] !== sorted[i - 1]) distinct++;
  }
  if (n < values.length && distinct > 0) distinct = Math.round(distinct * (values.length / n));
  return distinct;
}

/** Fill the full-file statistics of `meta` from its built column (§1.3). Returns the same object. */
export function finalizeMeta(meta: FieldMeta, column: Column, parseErrors: number): FieldMeta {
  const n = column.storage === 'dict' ? column.codes.length : column.values.length;
  meta.rowCount = n;
  meta.storage = column.storage;
  meta.parseErrors = parseErrors;
  meta.min = null; meta.max = null; meta.topValues = [];
  let nulls = 0;
  switch (column.storage) {
    case 'dict': {
      const counts = new Int32Array(column.dict.length);
      for (let i = 0; i < n; i++) { const c = column.codes[i]!; if (c < 0) nulls++; else counts[c]!++; }
      meta.cardinality = column.dict.length;
      const order = Array.from(counts.keys()).sort((a, b) => counts[b]! - counts[a]! || a - b).slice(0, TOP_VALUES_LIMIT);
      meta.topValues = order.map((c) => [column.dict[c]!, counts[c]!] as [string, number]);
      break;
    }
    case 'i32': {
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < n; i++) { const v = column.values[i]!; if (v === I32_NULL) nulls++; else { if (v < min) min = v; if (v > max) max = v; } }
      if (nulls < n) {
        meta.min = min; meta.max = max;
        const range = max - min + 1;
        if (range <= 4_000_000) {
          const seen = new Uint8Array(range);
          let distinct = 0;
          for (let i = 0; i < n; i++) { const v = column.values[i]!; if (v !== I32_NULL && seen[v - min] === 0) { seen[v - min] = 1; distinct++; } }
          meta.cardinality = distinct;
        } else {
          const set = new Set<number>();
          for (let i = 0; i < n; i++) { const v = column.values[i]!; if (v !== I32_NULL) set.add(v); }
          meta.cardinality = set.size;
        }
      } else meta.cardinality = 0;
      break;
    }
    case 'bool': {
      let t = 0, f = 0;
      for (let i = 0; i < n; i++) { const v = column.values[i]!; if (v === BOOL_NULL) nulls++; else if (v === 1) t++; else f++; }
      meta.cardinality = (t > 0 ? 1 : 0) + (f > 0 ? 1 : 0);
      meta.topValues = ([['True', t], ['False', f]] as [string, number][]).filter((p) => p[1] > 0).sort((a, b) => b[1] - a[1]);
      break;
    }
    default: {
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < n; i++) { const v = column.values[i]!; if (v !== v) nulls++; else { if (v < min) min = v; if (v > max) max = v; } }
      if (nulls < n) { meta.min = min; meta.max = max; }
      meta.cardinality = nulls < n ? floatCardinality(column.values) : 0;
    }
  }
  meta.nullCount = nulls;
  meta.highCardinality = meta.cardinality > Math.max(HIGH_CARDINALITY_MIN, 0.5 * n);
  return meta;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** Cached date-part column: `parts[i]` is the part value (year, 1–12, …) or −1 for null. */
export interface PartColumn { parts: Int32Array; min: number; max: number }

/** Cached key column: `codes[i]` indexes the sorted distinct `values`; −1 is null. */
export interface KeyColumn { codes: Int32Array; values: Float64Array }

/**
 * One loaded dataset: columns in header order, their `FieldMeta`, and lazily
 * computed derived columns. Derived columns are cached per field and dropped by
 * `replaceColumn` (the `setType` path). One store lives in the worker at a time.
 */
export class ColumnStore {
  readonly rowCount: number;
  readonly fields: FieldMeta[];
  readonly columns: Column[];
  private readonly byName = new Map<string, number>();
  private readonly derived = new Map<string, PartColumn | KeyColumn | Float64Array>();
  /** Filter-mask cache keyed by the canonical filter; owned by `filters.ts`. */
  readonly maskCache = new Map<string, Uint8Array>();

  constructor(fields: FieldMeta[], columns: Column[], rowCount: number) {
    if (fields.length !== columns.length) throw new Error('fields/columns length mismatch');
    this.fields = fields;
    this.columns = columns;
    this.rowCount = rowCount;
    fields.forEach((f, i) => { f.index = i; this.byName.set(f.name, i); });
  }

  /** Column index by field name; −1 when unknown. */
  indexOf(field: string): number { return this.byName.get(field) ?? -1; }

  /** Column by field name; throws when unknown. */
  column(field: string): Column {
    const i = this.byName.get(field);
    if (i === undefined) throw new Error(`unknown field: ${field}`);
    return this.columns[i]!;
  }

  /** Metadata by field name; throws when unknown. */
  meta(field: string): FieldMeta {
    const i = this.byName.get(field);
    if (i === undefined) throw new Error(`unknown field: ${field}`);
    return this.fields[i]!;
  }

  /** Swap a column (type override) and refresh its metadata; drops every derived column and mask of that field. */
  replaceColumn(field: string, built: BuiltColumn, patch: Partial<FieldMeta>): FieldMeta {
    const i = this.byName.get(field);
    if (i === undefined) throw new Error(`unknown field: ${field}`);
    const meta = this.fields[i]!;
    Object.assign(meta, patch);
    this.columns[i] = built.column;
    finalizeMeta(meta, built.column, built.parseErrors);
    this.invalidate(field);
    return meta;
  }

  /** Drop cached derived columns and masks for a field. */
  invalidate(field: string): void {
    const prefix = `${field}\u0000`;
    for (const k of [...this.derived.keys()]) if (k.startsWith(prefix)) this.derived.delete(k);
    for (const k of [...this.maskCache.keys()]) if (k.includes(`"field":${JSON.stringify(field)}`)) this.maskCache.delete(k);
  }

  /** Numeric view of any column as `Float64Array` with `NaN` nulls (dict → codes, bool → 0/1). Cached; never mutate. */
  numericView(field: string): Float64Array {
    const key = `${field}\u0000num`;
    const hit = this.derived.get(key);
    if (hit instanceof Float64Array) return hit;
    const col = this.column(field);
    let out: Float64Array;
    switch (col.storage) {
      case 'f64': case 'date': out = col.values; break;
      case 'i32': {
        out = new Float64Array(col.values.length);
        for (let i = 0; i < out.length; i++) { const v = col.values[i]!; out[i] = v === I32_NULL ? NaN : v; }
        break;
      }
      case 'bool': {
        out = new Float64Array(col.values.length);
        for (let i = 0; i < out.length; i++) { const v = col.values[i]!; out[i] = v === BOOL_NULL ? NaN : v; }
        break;
      }
      case 'dict': {
        out = new Float64Array(col.codes.length);
        for (let i = 0; i < out.length; i++) { const c = col.codes[i]!; out[i] = c < 0 ? NaN : c; }
      }
    }
    this.derived.set(key, out);
    return out;
  }

  /** Date part per row at `level` (UTC), cached per (field, level). Non-date columns throw. */
  datePart(field: string, level: DateLevel): PartColumn {
    const key = `${field}\u0000part:${level}`;
    const hit = this.derived.get(key);
    if (hit && 'parts' in hit) return hit;
    const col = this.column(field);
    if (col.storage !== 'date') throw new Error(`${field} is not a date column`);
    const vals = col.values;
    const parts = new Int32Array(vals.length);
    let min = Infinity, max = -Infinity;
    let lastMs = NaN, lastPart = -1;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i]!;
      let p: number;
      if (v !== v) p = -1;
      else if (v === lastMs) p = lastPart;
      else { p = datePart(v, level); lastMs = v; lastPart = p; }
      parts[i] = p;
      if (p >= 0) { if (p < min) min = p; if (p > max) max = p; }
    }
    const out: PartColumn = { parts, min: min === Infinity ? 0 : min, max: max === -Infinity ? -1 : max };
    this.derived.set(key, out);
    return out;
  }

  /** Date truncated to `level` as a key column (sorted distinct period starts), cached per (field, level). */
  dateTruncKeys(field: string, level: DateLevel): KeyColumn {
    const key = `${field}\u0000trunc:${level}`;
    const hit = this.derived.get(key);
    if (hit && 'codes' in hit) return hit;
    const col = this.column(field);
    if (col.storage !== 'date') throw new Error(`${field} is not a date column`);
    const vals = col.values;
    const trunc = new Float64Array(vals.length);
    let lastMs = NaN, lastT = NaN;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i]!;
      if (v !== v) { trunc[i] = NaN; continue; }
      if (v !== lastMs) { lastT = dateTrunc(v, level); lastMs = v; }
      trunc[i] = lastT;
    }
    const out = keysOf(trunc);
    this.derived.set(key, out);
    return out;
  }

  /** Sorted distinct values of a numeric/date column as a key column (discrete numeric dimensions), cached per field. */
  distinctKeys(field: string): KeyColumn {
    const key = `${field}\u0000keys`;
    const hit = this.derived.get(key);
    if (hit && 'codes' in hit) return hit;
    const out = keysOf(this.numericView(field));
    this.derived.set(key, out);
    return out;
  }
}

/** Map a float array to codes into its sorted distinct values (−1 for NaN). */
export function keysOf(values: Float64Array): KeyColumn {
  const index = new Map<number, number>();
  const n = values.length;
  const tmp = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    if (v !== v) { tmp[i] = -1; continue; }
    let c = index.get(v);
    if (c === undefined) { c = index.size; index.set(v, c); }
    tmp[i] = c;
  }
  const distinct = Float64Array.from(index.keys());
  const order = Array.from(distinct.keys()).sort((a, b) => distinct[a]! - distinct[b]!);
  const remap = new Int32Array(order.length);
  const sorted = new Float64Array(order.length);
  order.forEach((old, pos) => { remap[old] = pos; sorted[pos] = distinct[old]!; });
  for (let i = 0; i < n; i++) { const c = tmp[i]!; if (c >= 0) tmp[i] = remap[c]!; }
  return { codes: tmp, values: sorted };
}
