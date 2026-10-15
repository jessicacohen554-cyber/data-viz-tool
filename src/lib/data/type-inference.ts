/**
 * Tableau-style type inference over a sample of raw CSV cells (shard S1).
 *
 * Owns `isNullToken`, `inferType` (one column) and `inferAll` (a header plus
 * sample rows → `FieldMeta[]` skeletons). Rules are docs/TABLEAU-SPEC.md §1.2:
 * null tokens are stripped first; a type wins only when every sampled non-null
 * value parses; order boolean → integer → number → date/datetime → string.
 * Counts in the returned `FieldMeta` describe the sample only; the column
 * store overwrites them with full-file numbers at build time.
 *
 * Must not import svelte or DOM (R-PURE); may import `lib/core` and siblings.
 */
import type { Aggregation, Continuity, DataType, FieldMeta, Role, Storage } from '../core/types';
import { detectDateFormat } from './date-parse';

/** Null tokens, lower-cased (§1.2): the empty cell plus common export sentinels. */
const NULL_TOKENS: ReadonlySet<string> = new Set(['', 'null', 'na', 'n/a', 'nan', '#n/a']);

/** Boolean tokens, lower-cased (§1.2). `0`/`1` stay numeric. */
const BOOL_TOKENS: ReadonlySet<string> = new Set(['true', 'false', 't', 'f', 'yes', 'no', 'y', 'n']);

/** Lower-cased tokens that mean `true`. */
export const TRUE_TOKENS: ReadonlySet<string> = new Set(['true', 't', 'yes', 'y']);

/** `|v| < 2^31` fits an `Int32Array` (−2^31 itself is the store's null sentinel). */
export const INT32_LIMIT = 2_147_483_648;

/**
 * True when the raw cell is one of the null tokens after trimming. The first
 * character gates the slow path: every null token starts with whitespace, `#`,
 * `N` or `n`, so digits, signs and ordinary words return without allocating.
 */
export function isNullToken(raw: string): boolean {
  const n = raw.length;
  if (n === 0) return true;
  const c = raw.charCodeAt(0);
  if (c > 32 && c !== 35 && c !== 78 && c !== 110) return false;
  return NULL_TOKENS.has(raw.trim().toLowerCase());
}

const INT_RE = /^[+-]?\d+$/;
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Result of `inferType`. */
export interface InferredType {
  type: DataType;
  storage: Storage;
  dateFormat: string | null;
  dateAmbiguous: boolean;
  /** Share of sampled non-null values the winning type parsed (1.0 for rule-based wins). */
  confidence: number;
  /** Non-null sampled values. */
  sampled: number;
  /** Null-token sampled values. */
  nulls: number;
}

/** Parse an integer-looking string already matched by `INT_RE`. */
function toInt(s: string): number {
  return Number(s);
}

/**
 * Infer the type of one column from raw sampled cells (§1.2 order). Values are
 * trimmed and null tokens removed before any rule runs. An all-null sample is `string`.
 */
export function inferType(samples: readonly string[]): InferredType {
  const vals: string[] = [];
  let nulls = 0;
  for (const raw of samples) {
    if (isNullToken(raw)) { nulls++; continue; }
    vals.push(raw.trim());
  }
  const base = { dateFormat: null, dateAmbiguous: false, confidence: 1, sampled: vals.length, nulls };
  if (vals.length === 0) return { type: 'string', storage: 'dict', ...base, confidence: 0 };

  let allBool = true, allInt = true, allNum = true;
  for (const v of vals) {
    if (allBool && !BOOL_TOKENS.has(v.toLowerCase())) allBool = false;
    if (allInt && !(INT_RE.test(v) && Math.abs(toInt(v)) < INT32_LIMIT)) allInt = false;
    if (allNum && !NUM_RE.test(v)) allNum = false;
    if (!allBool && !allInt && !allNum) break;
  }
  if (allBool) return { type: 'boolean', storage: 'bool', ...base };
  if (allInt) return { type: 'integer', storage: 'i32', ...base };
  if (allNum) return { type: 'number', storage: 'f64', ...base };

  const det = detectDateFormat(vals);
  if (det) {
    return { type: det.hasTime ? 'datetime' : 'date', storage: 'date', ...base, dateFormat: det.pattern, dateAmbiguous: det.ambiguous };
  }
  return { type: 'string', storage: 'dict', ...base };
}

/** Default role / continuity / aggregation per type (§2). */
export function defaultsFor(type: DataType): { role: Role; defaultContinuity: Continuity; defaultAggregation: Aggregation } {
  if (type === 'integer' || type === 'number') return { role: 'measure', defaultContinuity: 'continuous', defaultAggregation: 'sum' };
  return { role: 'dimension', defaultContinuity: 'discrete', defaultAggregation: 'count' };
}

/** Storage used for a (possibly overridden) type (§1.1). */
export function storageFor(type: DataType): Storage {
  switch (type) {
    case 'string': return 'dict';
    case 'integer': return 'i32';
    case 'number': return 'f64';
    case 'boolean': return 'bool';
    default: return 'date';
  }
}

/** Make header names unique: duplicates become `name (2)`, `name (3)`…; blanks become `Column N`. */
export function uniqueHeader(header: readonly string[]): string[] {
  const used = new Set<string>();
  return header.map((raw, i) => {
    const base = raw.trim() === '' ? `Column ${i + 1}` : raw.trim();
    let name = base;
    for (let k = 2; used.has(name); k++) name = `${base} (${k})`;
    used.add(name);
    return name;
  });
}

/**
 * Infer every column of a sample. `sampleRows[r][c]` is the raw cell (missing cells
 * are nulls). Returns `FieldMeta` skeletons with sample-based counts; `rowCount`,
 * `nullCount`, `cardinality`, `min`, `max`, `topValues`, `parseErrors` are finalised
 * by the column store once the whole file is built.
 */
export function inferAll(header: readonly string[], sampleRows: readonly (readonly string[])[]): FieldMeta[] {
  const names = uniqueHeader(header);
  const column: string[] = [];
  return names.map((name, index) => {
    column.length = 0;
    for (const row of sampleRows) column.push(row[index] ?? '');
    const inf = inferType(column);
    const d = defaultsFor(inf.type);
    return {
      name, index, type: inf.type, role: d.role,
      defaultContinuity: d.defaultContinuity, defaultAggregation: d.defaultAggregation,
      storage: inf.storage,
      rowCount: sampleRows.length, nullCount: inf.nulls, cardinality: 0, highCardinality: false,
      min: null, max: null, topValues: [],
      dateFormat: inf.dateFormat, dateAmbiguous: inf.dateAmbiguous,
      parseErrors: 0, confidence: inf.confidence,
    };
  });
}
