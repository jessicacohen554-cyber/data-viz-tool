/**
 * Query engine: `QueryPlan` → `QueryResult` over a `ColumnStore` (shard S1).
 *
 * Algorithms (docs/ARCHITECTURE.md §3, plan §9): every dimension becomes a
 * per-row code array (dict codes, date parts, date-trunc keys, bin indices or
 * distinct-value keys; null = its own last slot). Groups are keyed densely
 * (mixed radix over the dims' cardinalities) while the cell count stays
 * ≤ `DENSE_KEY_MAX_CELLS`, else hashed. Measures take one pass for
 * count/sum/min/max, two for var/stdev, and a counting-sort bucketing pass for
 * median, the P5…P95 percentiles, COUNTD, box statistics and percentile bands
 * (`plan.bands` → `result.bands`, one vector per level). Every percentile is
 * `stats.quantile` (type 7, linear interpolation), so MEDIAN, P50 bands and
 * boxplot medians agree to the bit. Groups come out in natural nested order,
 * re-ordered by `plan.sort` (label / value / manual), then stride-sampled to
 * `plan.limit` with `truncated: true`. `disaggregate` returns rows instead.
 *
 * Also owns `profileField` (filter dialog) and `rowsOf` (text table slices),
 * plus the kernel pieces `fieldCodes` and `aggregateMeasure` that `filters.ts`
 * uses for Top N (function-level import cycle, see that module).
 *
 * Nulls are ignored by every aggregation (docs/TABLEAU-SPEC.md §3). Result
 * typed arrays are always freshly allocated so the worker can transfer them.
 *
 * Must not import svelte or DOM (R-PURE).
 */
import type {
  Aggregation, BoxStats, FieldProfile, FilterSpec, QueryDim, QueryMeasure, QueryPlan, QueryResult, QuerySort,
  ResultDim, ResultMeasure,
} from '../core/types';
import { DENSE_KEY_MAX_CELLS, PERCENTILE_LEVEL } from '../core/constants';
import { queryKey } from '../core/query-of';
import { type ColumnStore, labelAt } from './column-store';
import { datePartLabel, isoLabel } from './date-parse';
import { buildMask, countMask } from './filters';
import { quantile } from './stats';

// ---------------------------------------------------------------------------
// Dimensions → per-row codes
// ---------------------------------------------------------------------------

/** A resolved dimension: effective code of row i is `codes[i] + offset` (codes[i] < 0 → null, slot `K`). */
export interface DimCodes {
  codes: Int32Array;
  offset: number;
  /** Non-null codes are 0 … K−1. */
  K: number;
  kind: 'codes' | 'values';
  label: (code: number) => string;
  value: (code: number) => number;
}

const NULL_LABEL = 'Null';

/** Codes for a field used as a plain discrete dimension (no date treatment, no bin). */
export function fieldCodes(store: ColumnStore, field: string): DimCodes {
  const col = store.column(field);
  if (col.storage === 'dict') {
    const dict = col.dict;
    return { codes: col.codes, offset: 0, K: dict.length, kind: 'codes', label: (c) => dict[c] ?? NULL_LABEL, value: () => NaN };
  }
  const kc = store.distinctKeys(field);
  const vals = kc.values;
  const label =
    col.storage === 'bool' ? (c: number) => (c >= vals.length ? NULL_LABEL : vals[c] === 1 ? 'True' : 'False')
    : col.storage === 'date' ? (c: number) => (c >= vals.length ? NULL_LABEL : isoLabel(vals[c]!))
    : (c: number) => (c >= vals.length ? NULL_LABEL : String(vals[c]));
  return { codes: kc.codes, offset: 0, K: vals.length, kind: 'codes', label, value: (c) => (c < vals.length ? vals[c]! : NaN) };
}

function resolveDim(store: ColumnStore, d: QueryDim): DimCodes {
  if (d.date) {
    if (store.column(d.field).storage !== 'date') throw new Error(`${d.field} is not a date field`);
    const level = d.date.level;
    if (d.date.mode === 'part') {
      const pc = store.datePart(d.field, level);
      const K = pc.max >= pc.min ? pc.max - pc.min + 1 : 0;
      const min = pc.min;
      return { codes: pc.parts, offset: -min, K, kind: 'codes', label: (c) => (c >= K ? NULL_LABEL : datePartLabel(level, c + min)), value: (c) => (c >= K ? NaN : c + min) };
    }
    const kc = store.dateTruncKeys(d.field, level);
    const vals = kc.values;
    return { codes: kc.codes, offset: 0, K: vals.length, kind: 'values', label: (c) => (c >= vals.length ? NULL_LABEL : isoLabel(vals[c]!)), value: (c) => (c < vals.length ? vals[c]! : NaN) };
  }
  if (d.bin) return binCodes(store, d.field, d.bin);
  return fieldCodes(store, d.field);
}

/** Equal-width bins labelled by their lower edge (§4.3); `size` bins start at multiples of the size. */
function binCodes(store: ColumnStore, field: string, bin: NonNullable<QueryDim['bin']>): DimCodes {
  const vals = store.numericView(field);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < vals.length; i++) { const v = vals[i]!; if (v === v) { if (v < min) min = v; if (v > max) max = v; } }
  const codes = new Int32Array(vals.length);
  if (min === Infinity) { codes.fill(-1); return { codes, offset: 0, K: 0, kind: 'values', label: () => NULL_LABEL, value: () => NaN }; }
  if ('size' in bin) {
    const s = bin.size > 0 && Number.isFinite(bin.size) ? bin.size : 1;
    const minCode = Math.floor(min / s);
    const K = Math.floor(max / s) - minCode + 1;
    for (let i = 0; i < vals.length; i++) { const v = vals[i]!; codes[i] = v !== v ? -1 : Math.floor(v / s) - minCode; }
    const value = (c: number) => (c >= K ? NaN : (c + minCode) * s);
    return { codes, offset: 0, K, kind: 'values', label: (c) => (c >= K ? NULL_LABEL : String(value(c))), value };
  }
  const cnt = Math.max(1, Math.floor(bin.count));
  const width = max > min ? (max - min) / cnt : 1;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i]!;
    codes[i] = v !== v ? -1 : Math.min(cnt - 1, Math.floor((v - min) / width));
  }
  const value = (c: number) => (c >= cnt ? NaN : min + c * width);
  return { codes, offset: 0, K: cnt, kind: 'values', label: (c) => (c >= cnt ? NULL_LABEL : String(value(c))), value };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

interface Grouping {
  /** Group of row i, −1 when filtered out. */
  groupOf: Int32Array;
  nGroups: number;
  /** `groupCodes[d][g]` = effective code of dim d in group g (`K_d` = null). */
  groupCodes: Int32Array[];
}

function groupRows(dims: DimCodes[], mask: Uint8Array | null, rows: number): Grouping {
  const nd = dims.length;
  const groupOf = new Int32Array(rows);
  if (nd === 0) {
    if (mask) for (let i = 0; i < rows; i++) groupOf[i] = mask[i]! ? 0 : -1;
    return { groupOf, nGroups: 1, groupCodes: [] };
  }
  const slots = dims.map((d) => d.K + 1);
  let total = 1;
  for (const s of slots) total *= s;
  return total <= DENSE_KEY_MAX_CELLS ? groupDense(dims, slots, total, mask, groupOf) : groupHashed(dims, slots, total, mask, groupOf);
}

function groupDense(dims: DimCodes[], slots: number[], total: number, mask: Uint8Array | null, groupOf: Int32Array): Grouping {
  const nd = dims.length;
  const rows = groupOf.length;
  const strides = new Array<number>(nd);
  let s = 1;
  for (let d = nd - 1; d >= 0; d--) { strides[d] = s; s *= slots[d]!; }
  const cellToGroup = new Int32Array(total).fill(-1);

  if (nd === 1) {
    const { codes, offset, K } = dims[0]!;
    for (let i = 0; i < rows; i++) {
      if (mask && !mask[i]) { groupOf[i] = -1; continue; }
      const c = codes[i]!;
      const cell = c < 0 ? K : c + offset;
      groupOf[i] = cell; cellToGroup[cell] = 0;
    }
  } else if (nd === 2) {
    const a = dims[0]!, b = dims[1]!, sa = strides[0]!;
    for (let i = 0; i < rows; i++) {
      if (mask && !mask[i]) { groupOf[i] = -1; continue; }
      const ca = a.codes[i]!, cb = b.codes[i]!;
      const cell = (ca < 0 ? a.K : ca + a.offset) * sa + (cb < 0 ? b.K : cb + b.offset);
      groupOf[i] = cell; cellToGroup[cell] = 0;
    }
  } else if (nd === 3) {
    const a = dims[0]!, b = dims[1]!, c = dims[2]!, sa = strides[0]!, sb = strides[1]!;
    for (let i = 0; i < rows; i++) {
      if (mask && !mask[i]) { groupOf[i] = -1; continue; }
      const ca = a.codes[i]!, cb = b.codes[i]!, cc = c.codes[i]!;
      const cell = (ca < 0 ? a.K : ca + a.offset) * sa + (cb < 0 ? b.K : cb + b.offset) * sb + (cc < 0 ? c.K : cc + c.offset);
      groupOf[i] = cell; cellToGroup[cell] = 0;
    }
  } else {
    for (let i = 0; i < rows; i++) {
      if (mask && !mask[i]) { groupOf[i] = -1; continue; }
      let cell = 0;
      for (let d = 0; d < nd; d++) {
        const dim = dims[d]!;
        const c = dim.codes[i]!;
        cell += (c < 0 ? dim.K : c + dim.offset) * strides[d]!;
      }
      groupOf[i] = cell; cellToGroup[cell] = 0;
    }
  }

  // Compact occupied cells into group ids in cell order (= natural nested order) and decode their codes.
  let nGroups = 0;
  for (let cell = 0; cell < total; cell++) if (cellToGroup[cell] === 0) cellToGroup[cell] = nGroups++;
  const groupCodes = dims.map(() => new Int32Array(nGroups));
  for (let cell = 0; cell < total; cell++) {
    const g = cellToGroup[cell]!;
    if (g < 0) continue;
    let rest = cell;
    for (let d = 0; d < nd; d++) {
      const code = Math.floor(rest / strides[d]!);
      groupCodes[d]![g] = code;
      rest -= code * strides[d]!;
    }
  }
  for (let i = 0; i < rows; i++) { const cell = groupOf[i]!; if (cell >= 0) groupOf[i] = cellToGroup[cell]!; }
  return { groupOf, nGroups, groupCodes };
}

function groupHashed(dims: DimCodes[], slots: number[], total: number, mask: Uint8Array | null, groupOf: Int32Array): Grouping {
  const nd = dims.length;
  const rows = groupOf.length;
  const numeric = total <= Number.MAX_SAFE_INTEGER;
  const byNumber = new Map<number, number>();
  const byString = new Map<string, number>();
  const strides = new Array<number>(nd);
  let s = 1;
  for (let d = nd - 1; d >= 0; d--) { strides[d] = s; s *= slots[d]!; }
  const codeLists: number[][] = dims.map(() => []);
  const tmp = new Array<number>(nd);
  let nGroups = 0;
  for (let i = 0; i < rows; i++) {
    if (mask && !mask[i]) { groupOf[i] = -1; continue; }
    let key = 0;
    for (let d = 0; d < nd; d++) {
      const dim = dims[d]!;
      const c = dim.codes[i]!;
      const e = c < 0 ? dim.K : c + dim.offset;
      tmp[d] = e;
      if (numeric) key += e * strides[d]!;
    }
    let g: number | undefined;
    if (numeric) {
      g = byNumber.get(key);
      if (g === undefined) { g = nGroups++; byNumber.set(key, g); for (let d = 0; d < nd; d++) codeLists[d]!.push(tmp[d]!); }
    } else {
      const sk = tmp.join(',');
      g = byString.get(sk);
      if (g === undefined) { g = nGroups++; byString.set(sk, g); for (let d = 0; d < nd; d++) codeLists[d]!.push(tmp[d]!); }
    }
    groupOf[i] = g;
  }
  // Natural nested order: sort groups lexicographically by code and remap.
  const order = Array.from({ length: nGroups }, (_, g) => g).sort((a, b) => {
    for (let d = 0; d < nd; d++) { const diff = codeLists[d]![a]! - codeLists[d]![b]!; if (diff !== 0) return diff; }
    return 0;
  });
  const remap = new Int32Array(nGroups);
  order.forEach((old, pos) => { remap[old] = pos; });
  const groupCodes = dims.map((_, d) => { const out = new Int32Array(nGroups); order.forEach((old, pos) => { out[pos] = codeLists[d]![old]!; }); return out; });
  for (let i = 0; i < rows; i++) { const g = groupOf[i]!; if (g >= 0) groupOf[i] = remap[g]!; }
  return { groupOf, nGroups, groupCodes };
}

// ---------------------------------------------------------------------------
// Aggregation kernel
// ---------------------------------------------------------------------------

interface Stats { count: Int32Array; sum: Float64Array; min: Float64Array; max: Float64Array }
interface Bucket { offsets: Int32Array; sorted: Float64Array }

/** Per-query caches so several measures on one field share passes. */
interface Ctx { stats: Map<string, Stats>; buckets: Map<string, Bucket> }

function newCtx(): Ctx { return { stats: new Map(), buckets: new Map() }; }

function basicStats(groupOf: Int32Array, nGroups: number, vals: Float64Array, mask: Uint8Array | null): Stats {
  const count = new Int32Array(nGroups);
  const sum = new Float64Array(nGroups);
  const min = new Float64Array(nGroups).fill(Infinity);
  const max = new Float64Array(nGroups).fill(-Infinity);
  const n = groupOf.length;
  for (let i = 0; i < n; i++) {
    const g = groupOf[i]!;
    if (g < 0 || (mask && !mask[i])) continue;
    const v = vals[i]!;
    if (v !== v) continue;
    count[g]!++;
    sum[g]! += v;
    if (v < min[g]!) min[g] = v;
    if (v > max[g]!) max[g] = v;
  }
  return { count, sum, min, max };
}

/** Counting-sort bucketing: values of each group contiguous and sorted ascending. */
function bucketValues(groupOf: Int32Array, nGroups: number, vals: Float64Array, mask: Uint8Array | null): Bucket {
  const n = groupOf.length;
  const counts = new Int32Array(nGroups);
  for (let i = 0; i < n; i++) {
    const g = groupOf[i]!;
    if (g < 0 || (mask && !mask[i])) continue;
    const v = vals[i]!;
    if (v === v) counts[g]!++;
  }
  const offsets = new Int32Array(nGroups + 1);
  for (let g = 0; g < nGroups; g++) offsets[g + 1] = offsets[g]! + counts[g]!;
  const sorted = new Float64Array(offsets[nGroups]!);
  const cursor = offsets.slice(0, nGroups);
  for (let i = 0; i < n; i++) {
    const g = groupOf[i]!;
    if (g < 0 || (mask && !mask[i])) continue;
    const v = vals[i]!;
    if (v === v) sorted[cursor[g]!++] = v;
  }
  for (let g = 0; g < nGroups; g++) {
    const a = offsets[g]!, b = offsets[g + 1]!;
    if (b - a > 1) sorted.subarray(a, b).sort();
  }
  return { offsets, sorted };
}

/** The field's bucketing (sorted values per group), computed once per query and shared by every rank statistic. */
function bucketsFor(store: ColumnStore, groupOf: Int32Array, nGroups: number, field: string, mask: Uint8Array | null, ctx: Ctx): Bucket {
  let b = ctx.buckets.get(field);
  if (!b) { b = bucketValues(groupOf, nGroups, store.numericView(field), mask); ctx.buckets.set(field, b); }
  return b;
}

/** Type-7 percentile at `level` (0..100) of every group of a bucketing; NaN for an empty group. */
function percentiles(b: Bucket, nGroups: number, level: number): Float64Array {
  const out = new Float64Array(nGroups);
  const p = level / 100;
  for (let g = 0; g < nGroups; g++) out[g] = quantile(b.sorted, b.offsets[g]!, b.offsets[g + 1]!, p);
  return out;
}

/**
 * Aggregate one measure per group. `groupOf[i]` < 0 or a 0 in `mask` skips the
 * row; null values are ignored (§3). Empty groups yield `NaN` except count/countd → 0.
 * MEDIAN and P5…P95 are type-7 percentiles (`PERCENTILE_LEVEL`) over the shared bucketing.
 */
export function aggregateMeasure(store: ColumnStore, groupOf: Int32Array, nGroups: number, m: QueryMeasure, mask: Uint8Array | null, ctx: Ctx = newCtx()): Float64Array {
  const vals = store.numericView(m.field);
  const agg: Aggregation = m.aggregation;
  const level = PERCENTILE_LEVEL[agg];
  if (level !== undefined) return percentiles(bucketsFor(store, groupOf, nGroups, m.field, mask, ctx), nGroups, level);
  const out = new Float64Array(nGroups);
  if (agg === 'countd') {
    const b = bucketsFor(store, groupOf, nGroups, m.field, mask, ctx);
    for (let g = 0; g < nGroups; g++) {
      const a = b.offsets[g]!, z = b.offsets[g + 1]!;
      let d = 0;
      for (let i = a; i < z; i++) if (i === a || b.sorted[i] !== b.sorted[i - 1]) d++;
      out[g] = d;
    }
    return out;
  }
  let st = ctx.stats.get(m.field);
  if (!st) { st = basicStats(groupOf, nGroups, vals, mask); ctx.stats.set(m.field, st); }
  switch (agg) {
    case 'count': for (let g = 0; g < nGroups; g++) out[g] = st.count[g]!; break;
    case 'sum': for (let g = 0; g < nGroups; g++) out[g] = st.count[g]! > 0 ? st.sum[g]! : NaN; break;
    case 'avg': for (let g = 0; g < nGroups; g++) out[g] = st.count[g]! > 0 ? st.sum[g]! / st.count[g]! : NaN; break;
    case 'min': for (let g = 0; g < nGroups; g++) out[g] = st.count[g]! > 0 ? st.min[g]! : NaN; break;
    case 'max': for (let g = 0; g < nGroups; g++) out[g] = st.count[g]! > 0 ? st.max[g]! : NaN; break;
    case 'var': case 'stdev': {
      // Two-pass sample variance: exact mean first, then squared deviations (stable for large offsets).
      const m2 = new Float64Array(nGroups);
      const n = groupOf.length;
      for (let i = 0; i < n; i++) {
        const g = groupOf[i]!;
        if (g < 0 || (mask && !mask[i])) continue;
        const v = vals[i]!;
        if (v !== v) continue;
        const d = v - st.sum[g]! / st.count[g]!;
        m2[g]! += d * d;
      }
      for (let g = 0; g < nGroups; g++) {
        const c = st.count[g]!;
        const variance = c > 1 ? m2[g]! / (c - 1) : NaN;
        out[g] = agg === 'var' ? variance : Math.sqrt(variance);
      }
      break;
    }
    default: out.fill(NaN);
  }
  return out;
}

function boxStats(store: ColumnStore, groupOf: Int32Array, nGroups: number, field: string, mask: Uint8Array | null, ctx: Ctx): BoxStats {
  const b = bucketsFor(store, groupOf, nGroups, field, mask, ctx);
  const q1 = new Float64Array(nGroups), med = new Float64Array(nGroups), q3 = new Float64Array(nGroups);
  const lo = new Float64Array(nGroups), hi = new Float64Array(nGroups);
  const outliers: Float64Array[] = [];
  for (let g = 0; g < nGroups; g++) {
    const a = b.offsets[g]!, z = b.offsets[g + 1]!;
    q1[g] = quantile(b.sorted, a, z, 0.25);
    med[g] = quantile(b.sorted, a, z, 0.5);
    q3[g] = quantile(b.sorted, a, z, 0.75);
    if (z === a) { lo[g] = NaN; hi[g] = NaN; outliers.push(new Float64Array(0)); continue; }
    const iqr = q3[g]! - q1[g]!;
    const fenceLo = q1[g]! - 1.5 * iqr, fenceHi = q3[g]! + 1.5 * iqr;
    let i = a; while (i < z && b.sorted[i]! < fenceLo) i++;
    let j = z - 1; while (j > i && b.sorted[j]! > fenceHi) j--;
    lo[g] = b.sorted[i]!; hi[g] = b.sorted[j]!;
    const out = new Float64Array((i - a) + (z - 1 - j));
    let k = 0;
    for (let t = a; t < i; t++) out[k++] = b.sorted[t]!;
    for (let t = j + 1; t < z; t++) out[k++] = b.sorted[t]!;
    outliers.push(out);
  }
  return { q1, med, q3, lo, hi, outliers };
}

// ---------------------------------------------------------------------------
// Ordering, limiting, output
// ---------------------------------------------------------------------------

/** Order of group indices after `plan.sort` (natural nested order when absent or unresolvable). */
function orderGroups(store: ColumnStore, plan: QueryPlan, dims: DimCodes[], grouping: Grouping, mask: Uint8Array | null): Int32Array {
  const { nGroups, groupCodes } = grouping;
  const order = new Int32Array(nGroups);
  for (let g = 0; g < nGroups; g++) order[g] = g;
  const sort: QuerySort | undefined = plan.sort;
  if (!sort) return order;
  const sd = plan.dims.findIndex((d) => d.key === sort.dimKey);
  if (sd < 0) return order;
  const dim = dims[sd]!;
  const K = dim.K;
  let rank: Float64Array | null = null;
  if (sort.by === 'value') {
    const m = plan.measures.find((mm) => mm.key === sort.measureKey);
    if (m) {
      const groupOf = new Int32Array(store.rowCount);
      for (let i = 0; i < groupOf.length; i++) { const c = dim.codes[i]!; groupOf[i] = c < 0 ? K : c + dim.offset; }
      const v = aggregateMeasure(store, groupOf, K + 1, m, mask);
      const codes = Array.from({ length: K + 1 }, (_, c) => c).sort((a, b) => {
        const va = v[a]!, vb = v[b]!;
        const na = va !== va, nb = vb !== vb;
        if (na || nb) return na === nb ? a - b : na ? 1 : -1;
        return va - vb || a - b;
      });
      rank = new Float64Array(K + 1);
      codes.forEach((c, pos) => { rank![c] = pos; });
    }
  } else if (sort.by === 'manual') {
    const pos = new Map<string, number>();
    (sort.manual ?? []).forEach((label, i) => { if (!pos.has(label)) pos.set(label, i); });
    rank = new Float64Array(K + 1);
    for (let c = 0; c <= K; c++) rank[c] = pos.get(dim.label(c)) ?? pos.size + c;
  }
  const desc = sort.dir === 'desc';
  const nd = dims.length;
  const arr = Array.from(order);
  arr.sort((ga, gb) => {
    for (let d = 0; d < nd; d++) {
      const a = groupCodes[d]![ga]!, b = groupCodes[d]![gb]!;
      if (d !== sd) { if (a !== b) return a - b; continue; }
      if (a === b) continue;
      if (a === K || b === K) return a === K ? 1 : -1; // null last
      const ra = rank ? rank[a]! : a, rb = rank ? rank[b]! : b;
      return desc ? rb - ra : ra - rb;
    }
    return 0;
  });
  order.set(arr);
  return order;
}

/** Evenly spaced subset of `n` positions when `n > limit`. */
function stride(n: number, limit: number): Int32Array | null {
  if (n <= limit || limit <= 0) return null;
  const out = new Int32Array(limit);
  const step = n / limit;
  for (let k = 0; k < limit; k++) out[k] = Math.floor(k * step);
  return out;
}

/** Build a `ResultDim` from the effective codes of the output rows. */
function dimOut(key: string, dim: DimCodes, effective: Int32Array): ResultDim {
  if (dim.kind === 'values') {
    const values = new Float64Array(effective.length);
    for (let j = 0; j < effective.length; j++) values[j] = dim.value(effective[j]!);
    return { key, kind: 'values', values };
  }
  const present = new Uint8Array(dim.K + 1);
  for (let j = 0; j < effective.length; j++) present[effective[j]!] = 1;
  const compact = new Int32Array(dim.K + 1).fill(-1);
  const labels: string[] = [];
  for (let c = 0; c <= dim.K; c++) if (present[c]) { compact[c] = labels.length; labels.push(dim.label(c)); }
  const codes = new Int32Array(effective.length);
  for (let j = 0; j < effective.length; j++) codes[j] = compact[effective[j]!]!;
  return { key, kind: 'codes', codes, labels };
}

/** Execute a plan. Throws on unknown fields or an invalid date/bin treatment (worker → `bad-request`). */
export function runQuery(store: ColumnStore, plan: QueryPlan): QueryResult {
  const t0 = now();
  const mask = buildMask(store, plan.filters);
  const filteredRows = countMask(mask, store.rowCount);
  const dims = plan.dims.map((d) => resolveDim(store, d));
  const key = queryKey(plan);
  const limit = plan.limit > 0 ? plan.limit : Infinity;

  if (plan.disaggregate) return disaggregated(store, plan, dims, mask, filteredRows, key, limit, t0);

  const grouping = groupRows(dims, mask, store.rowCount);
  const ctx = newCtx();
  const measureVals = plan.measures.map((m) => aggregateMeasure(store, grouping.groupOf, grouping.nGroups, m, null, ctx));
  const order = orderGroups(store, plan, dims, grouping, mask);
  const pick = stride(grouping.nGroups, limit);
  const outIdx = pick ? Int32Array.from(pick, (p) => order[p]!) : order;
  const n = outIdx.length;

  const resultDims: ResultDim[] = dims.map((dim, d) => {
    const eff = new Int32Array(n);
    for (let j = 0; j < n; j++) eff[j] = grouping.groupCodes[d]![outIdx[j]!]!;
    return dimOut(plan.dims[d]!.key, dim, eff);
  });
  const measures: ResultMeasure[] = plan.measures.map((m, k) => {
    const src = measureVals[k]!;
    const values = new Float64Array(n);
    for (let j = 0; j < n; j++) values[j] = src[outIdx[j]!]!;
    return { key: m.key, values };
  });

  const result: QueryResult = {
    key, groups: n, dims: resultDims, measures,
    scannedRows: store.rowCount, filteredRows, truncated: pick !== null, elapsedMs: 0,
  };
  const sub = (a: Float64Array) => { const o = new Float64Array(n); for (let j = 0; j < n; j++) o[j] = a[outIdx[j]!]!; return o; };
  if (plan.boxstats) {
    const m = plan.measures.find((mm) => mm.key === plan.boxstats!.measureKey);
    if (m) {
      const full = boxStats(store, grouping.groupOf, grouping.nGroups, m.field, null, ctx);
      result.boxstats = {
        q1: sub(full.q1), med: sub(full.med), q3: sub(full.q3), lo: sub(full.lo), hi: sub(full.hi),
        outliers: Array.from(outIdx, (g) => full.outliers[g]!),
      };
    }
  }
  if (plan.bands) {
    // Envelope bands (D-15): one type-7 percentile vector per level over the measure's
    // field, sharing the bucketing with MEDIAN / P-aggregations / boxstats on that field.
    const m = plan.measures.find((mm) => mm.key === plan.bands!.measureKey);
    if (m) {
      const b = bucketsFor(store, grouping.groupOf, grouping.nGroups, m.field, null, ctx);
      result.bands = plan.bands.levels.map((level) => sub(percentiles(b, grouping.nGroups, level)));
    }
  }
  result.elapsedMs = now() - t0;
  return result;
}

function disaggregated(store: ColumnStore, plan: QueryPlan, dims: DimCodes[], mask: Uint8Array | null, filteredRows: number, key: string, limit: number, t0: number): QueryResult {
  const rows = store.rowCount;
  const passing = new Int32Array(filteredRows);
  let m = 0;
  if (mask) { for (let i = 0; i < rows; i++) if (mask[i]) passing[m++] = i; } else for (let i = 0; i < rows; i++) passing[i] = i;
  const pick = stride(filteredRows, limit);
  const outRows = pick ? Int32Array.from(pick, (p) => passing[p]!) : passing;
  const n = outRows.length;
  const resultDims: ResultDim[] = dims.map((dim, d) => {
    const eff = new Int32Array(n);
    for (let j = 0; j < n; j++) { const c = dim.codes[outRows[j]!]!; eff[j] = c < 0 ? dim.K : c + dim.offset; }
    return dimOut(plan.dims[d]!.key, dim, eff);
  });
  const measures: ResultMeasure[] = plan.measures.map((qm) => {
    const src = store.numericView(qm.field);
    const values = new Float64Array(n);
    for (let j = 0; j < n; j++) values[j] = src[outRows[j]!]!;
    return { key: qm.key, values };
  });
  return {
    key, groups: n, dims: resultDims, measures,
    scannedRows: rows, filteredRows, truncated: pick !== null, elapsedMs: now() - t0,
  };
}

// ---------------------------------------------------------------------------
// Profiles and row slices
// ---------------------------------------------------------------------------

/**
 * Distinct values of a field for the filter dialog: dict/bool by count desc,
 * numbers and dates in natural order; `search` is a case-insensitive substring;
 * `truncated` when more than `limit` labels matched.
 */
export function profileField(store: ColumnStore, field: string, limit: number, search?: string): FieldProfile {
  const meta = store.meta(field);
  const dc = fieldCodes(store, field);
  const counts = new Int32Array(dc.K);
  for (let i = 0; i < dc.codes.length; i++) { const c = dc.codes[i]!; if (c >= 0) counts[c + dc.offset]!++; }
  const needle = search?.toLowerCase() ?? '';
  let codes = Array.from({ length: dc.K }, (_, c) => c);
  if (needle) codes = codes.filter((c) => dc.label(c).toLowerCase().includes(needle));
  const col = store.column(field);
  if (col.storage === 'dict' || col.storage === 'bool') codes.sort((a, b) => counts[b]! - counts[a]! || a - b);
  const truncated = codes.length > limit;
  if (truncated) codes = codes.slice(0, Math.max(0, limit));
  return {
    field,
    labels: codes.map((c) => dc.label(c)),
    counts: Int32Array.from(codes, (c) => counts[c]!),
    min: meta.min, max: meta.max, nullCount: meta.nullCount, truncated,
  };
}

/** A slice of filtered rows for the text table: numeric columns as `Float64Array`, others as labels. */
export function rowsOf(store: ColumnStore, offset: number, limit: number, fields: string[], filters: FilterSpec[]): { fields: string[]; columns: Array<string[] | Float64Array>; total: number } {
  const mask = buildMask(store, filters);
  const total = countMask(mask, store.rowCount);
  const idx: number[] = [];
  let seen = 0;
  for (let i = 0; i < store.rowCount && idx.length < limit; i++) {
    if (mask && !mask[i]) continue;
    if (seen++ < offset) continue;
    idx.push(i);
  }
  const columns = fields.map((f) => {
    const col = store.column(f);
    if (col.storage === 'i32' || col.storage === 'f64' || col.storage === 'date') {
      const view = store.numericView(f);
      return Float64Array.from(idx, (i) => view[i]!);
    }
    return idx.map((i) => labelAt(col, i));
  });
  return { fields, columns, total };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
