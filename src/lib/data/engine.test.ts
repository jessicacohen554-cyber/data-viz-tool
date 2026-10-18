import { beforeAll, describe, expect, it } from 'vitest';
import type { Aggregation, FilterSpec, QueryDim, QueryMeasure, QueryPlan, QueryResult } from '../core/types';
import { AGGREGATIONS, PERCENTILE_LEVEL } from '../core/constants';
import { queryKey } from '../core/query-of';
import { loadFixture, loadTable, rng } from '../../../tests/fixtures/load';
import { labelAt, type ColumnStore } from './column-store';
import { datePart, datePartLabel, dateTrunc, isoLabel } from './date-parse';
import { profileField, rowsOf, runQuery } from './engine';
import { buildMask } from './filters';

// ---------------------------------------------------------------------------
// Brute-force reference
// ---------------------------------------------------------------------------

function refLabel(store: ColumnStore, d: QueryDim, i: number): string {
  const col = store.column(d.field);
  if (d.date) {
    const ms = store.numericView(d.field)[i]!;
    if (ms !== ms) return 'Null';
    return d.date.mode === 'part' ? datePartLabel(d.date.level, datePart(ms, d.date.level)) : isoLabel(dateTrunc(ms, d.date.level));
  }
  if (d.bin) {
    const v = store.numericView(d.field)[i]!;
    if (v !== v) return 'Null';
    if ('size' in d.bin) return (Math.floor(v / d.bin.size) * d.bin.size).toFixed(6);
    const vals = store.numericView(d.field);
    let min = Infinity, max = -Infinity;
    for (const x of vals) if (x === x) { if (x < min) min = x; if (x > max) max = x; }
    const w = (max - min) / d.bin.count;
    return (min + Math.min(d.bin.count - 1, Math.floor((v - min) / w)) * w).toFixed(6);
  }
  return labelAt(col, i);
}

function refAgg(values: number[], agg: Aggregation): number {
  const n = values.length;
  if (agg === 'count') return n;
  if (agg === 'countd') return new Set(values).size;
  if (n === 0) return NaN;
  const sum = values.reduce((a, b) => a + b, 0);
  switch (agg) {
    case 'sum': return sum;
    case 'avg': return sum / n;
    case 'min': return Math.min(...values);
    case 'max': return Math.max(...values);
    case 'median': { const s = [...values].sort((a, b) => a - b); return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2; }
    case 'p05': case 'p10': case 'p25': case 'p75': case 'p90': case 'p95': {
      // Type 7: rank (n − 1)·p, linear interpolation between neighbours.
      const s = [...values].sort((a, b) => a - b);
      const pos = (n - 1) * (PERCENTILE_LEVEL[agg]! / 100), lo = Math.floor(pos);
      return s[lo]! + (pos - lo) * ((s[lo + 1] ?? s[lo]!) - s[lo]!);
    }
    case 'var': case 'stdev': {
      if (n < 2) return NaN;
      const mean = sum / n;
      const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
      return agg === 'var' ? v : Math.sqrt(v);
    }
    default: return NaN;
  }
}

function reference(store: ColumnStore, plan: QueryPlan): Map<string, number[]> {
  const mask = buildMask(store, plan.filters);
  const groups = new Map<string, number[][]>();
  const views = plan.measures.map((m) => store.numericView(m.field));
  for (let i = 0; i < store.rowCount; i++) {
    if (mask && !mask[i]) continue;
    const key = plan.dims.map((d) => refLabel(store, d, i)).join('|');
    let g = groups.get(key);
    if (!g) { g = plan.measures.map(() => []); groups.set(key, g); }
    views.forEach((v, k) => { const x = v[i]!; if (x === x) g![k]!.push(x); });
  }
  const out = new Map<string, number[]>();
  for (const [k, lists] of groups) out.set(k, lists.map((l, m) => refAgg(l, plan.measures[m]!.aggregation)));
  return out;
}

function resultMap(res: QueryResult, plan: QueryPlan): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (let j = 0; j < res.groups; j++) {
    const key = res.dims.map((d, di) => {
      if (d.kind === 'codes') return d.labels![d.codes![j]!]!;
      const v = d.values![j]!;
      if (v !== v) return 'Null';
      return plan.dims[di]!.date ? isoLabel(v) : v.toFixed(6);
    }).join('|');
    out.set(key, res.measures.map((m) => m.values[j]!));
  }
  return out;
}

function expectSame(actual: Map<string, number[]>, expected: Map<string, number[]>, label: string): void {
  expect([...actual.keys()].sort(), `${label}: group keys`).toEqual([...expected.keys()].sort());
  for (const [k, exp] of expected) {
    const act = actual.get(k)!;
    exp.forEach((e, i) => {
      const a = act[i]!;
      if (e !== e) expect(a, `${label} ${k}[${i}]`).toBeNaN();
      else expect(a, `${label} ${k}[${i}]`).toBeCloseTo(e, Math.abs(e) > 1e6 ? 2 : 6);
    });
  }
}

const plan = (dims: QueryDim[], measures: QueryMeasure[], extra: Partial<QueryPlan> = {}): QueryPlan => ({
  datasetId: 'test', dims, measures, filters: [], disaggregate: false, limit: 50_000, ...extra,
});

// ---------------------------------------------------------------------------
// Synthetic store: 20K rows, nulls everywhere
// ---------------------------------------------------------------------------

let syn: ColumnStore;
let sample: ColumnStore;

beforeAll(async () => {
  const r = rng(42);
  const cats = ['Alpha', 'beta', 'Gamma', 'delta', 'Epsilon', 'zeta'];
  const subs = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'];
  const rows: string[][] = [];
  const start = Date.UTC(2019, 0, 1);
  for (let i = 0; i < 20_000; i++) {
    const cat = r() < 0.03 ? '' : cats[Math.floor(r() * cats.length)]!;
    const sub = subs[Math.floor(r() * subs.length)]!;
    const ts = r() < 0.02 ? 'NULL' : isoLabel(start + Math.floor(r() * 2000 * 24) * 3_600_000).replace(' ', 'T').slice(0, 16);
    const v1 = r() < 0.05 ? '' : ((r() - 0.5) * 1000).toFixed(3);
    const v2 = r() < 0.02 ? 'NA' : String(Math.floor(r() * 1000));
    const flag = r() < 0.5 ? 'true' : 'false';
    rows.push([cat, sub, ts.length === 16 ? ts : ts, v1, v2, flag, String(i)]);
  }
  // Make the ISO timestamps uniform: 'yyyy-MM-ddTHH:mm'; midnight labels from isoLabel lack a time part.
  for (const row of rows) if (row[2]!.length === 10) row[2] = `${row[2]}T00:00`;
  syn = (await loadTable(['cat', 'sub', 'ts', 'v1', 'v2', 'flag', 'u'], rows)).store;
  sample = (await loadFixture('sample.csv')).store;
});

describe('runQuery equals the brute-force reference', () => {
  const dimSets: Record<string, QueryDim[]> = {
    none: [],
    cat: [{ key: 'a', field: 'cat' }],
    'cat×sub': [{ key: 'a', field: 'cat' }, { key: 'b', field: 'sub' }],
    'cat×sub×YEAR': [{ key: 'a', field: 'cat' }, { key: 'b', field: 'sub' }, { key: 'y', field: 'ts', date: { level: 'year', mode: 'part' } }],
    'MONTH trunc': [{ key: 't', field: 'ts', date: { level: 'month', mode: 'trunc' } }],
    'WEEK part × flag': [{ key: 'w', field: 'ts', date: { level: 'week', mode: 'part' } }, { key: 'f', field: 'flag' }],
    'bin size 100': [{ key: 'bn', field: 'v2', bin: { size: 100 } }],
    'bin count 10': [{ key: 'bc', field: 'v1', bin: { count: 10 } }],
    'numeric discrete': [{ key: 'n', field: 'v2' }],
    'QUARTER × DAY trunc': [{ key: 'q', field: 'ts', date: { level: 'quarter', mode: 'part' } }, { key: 'd', field: 'ts', date: { level: 'day', mode: 'trunc' } }],
  };

  for (const [name, dims] of Object.entries(dimSets)) {
    it(`dims ${name}: every aggregation on v1, v2 and cat`, () => {
      const measures: QueryMeasure[] = [];
      for (const agg of AGGREGATIONS) if (agg !== 'none') {
        measures.push({ key: `v1-${agg}`, field: 'v1', aggregation: agg });
        measures.push({ key: `v2-${agg}`, field: 'v2', aggregation: agg });
      }
      measures.push({ key: 'cat-count', field: 'cat', aggregation: 'count' }, { key: 'cat-countd', field: 'cat', aggregation: 'countd' });
      const p = plan(dims, measures);
      const res = runQuery(syn, p);
      expect(res.key).toBe(queryKey(p));
      expect(res.scannedRows).toBe(20_000);
      expect(res.filteredRows).toBe(20_000);
      expect(res.truncated).toBe(false);
      expectSame(resultMap(res, p), reference(syn, p), name);
    });
  }

  it('with filters, scannedRows stays the file and filteredRows the survivors', () => {
    const filters: FilterSpec[] = [
      { pillId: 'f1', field: 'cat', kind: 'categorical', mode: 'exclude', values: ['beta'], includeNull: false },
      { pillId: 'f2', field: 'v2', kind: 'range', min: 100, max: 800, includeNull: false },
      { pillId: 'f3', field: 'ts', kind: 'dateRange', from: Date.UTC(2020, 0, 1), to: Date.UTC(2022, 0, 1), level: 'year' },
    ];
    const p = plan([{ key: 'a', field: 'cat' }, { key: 'y', field: 'ts', date: { level: 'year', mode: 'part' } }], [{ key: 'm', field: 'v1', aggregation: 'avg' }, { key: 'c', field: 'v1', aggregation: 'count' }], { filters });
    const res = runQuery(syn, p);
    const ref = reference(syn, p);
    expectSame(resultMap(res, p), ref, 'filtered');
    expect(res.scannedRows).toBe(20_000);
    expect(res.filteredRows).toBeLessThan(20_000);
    let sum = 0; for (const v of ref.values()) sum += v[1]!;
    expect(res.measures[1]!.values.reduce((a, b) => a + b, 0)).toBe(sum);
    const years = res.dims[1]!.labels!;
    expect(years.every((y) => y === '2020' || y === '2021' || y === '2022' || y === 'Null')).toBe(true);
  });

  it('hashed keying (Π cardinalities > 4M) matches the reference and keeps natural order', () => {
    const p = plan([{ key: 'n', field: 'v2' }, { key: 'u', field: 'u' }], [{ key: 'c', field: 'v1', aggregation: 'count' }, { key: 's', field: 'v1', aggregation: 'sum' }]);
    const res = runQuery(syn, p);
    expect(res.groups).toBe(20_000);
    expectSame(resultMap(res, p), reference(syn, p), 'hashed');
    const d0 = res.dims[0]!, d1 = res.dims[1]!;
    for (let j = 1; j < res.groups; j++) {
      const a0 = d0.codes![j - 1]!, b0 = d0.codes![j]!;
      expect(b0 >= a0).toBe(true);
      if (a0 === b0) expect(Number(d1.labels![d1.codes![j]!])).toBeGreaterThan(Number(d1.labels![d1.codes![j - 1]!]));
    }
    expect(d0.labels!.at(-1)).toBe('Null'); // null slot sorts last
  });

  it('a group of only-null measure values reports count 0 and NaN for the rest', async () => {
    const { store } = await loadTable(['k', 'v'], [['a', '1'], ['b', ''], ['b', 'NULL'], ['', '5']]);
    const p = plan([{ key: 'k', field: 'k' }], ['sum', 'avg', 'count', 'countd', 'min', 'max', 'median', 'stdev', 'var'].map((a) => ({ key: a, field: 'v', aggregation: a as Aggregation })));
    const res = runQuery(store, p);
    expect(res.dims[0]!.labels).toEqual(['a', 'b', 'Null']);
    const b = res.measures.map((m) => m.values[1]!);
    expect(b.slice(0, 2).every((x) => x !== x)).toBe(true);
    expect(b[2]).toBe(0); expect(b[3]).toBe(0);
    expect(b.slice(4).every((x) => x !== x)).toBe(true);
    expect(res.measures[0]!.values[2]).toBe(5);
    expect(res.measures[7]!.values[0]).toBeNaN(); // stdev of one value
  });
});

describe('sort, limit, disaggregate, boxstats', () => {
  it('sorts by label, value and manual order; nested dims sort within their parent', () => {
    const base = plan([{ key: 'a', field: 'cat' }, { key: 'b', field: 'sub' }], [{ key: 'm', field: 'v1', aggregation: 'sum' }]);
    const labelsOf = (res: QueryResult, d: number) => Array.from(res.dims[d]!.codes!, (c) => res.dims[d]!.labels![c]!);

    const asc = runQuery(syn, { ...base, sort: { dimKey: 'a', by: 'label', dir: 'asc' } });
    expect([...new Set(labelsOf(asc, 0))]).toEqual(['Alpha', 'beta', 'delta', 'Epsilon', 'Gamma', 'zeta', 'Null']);
    const desc = runQuery(syn, { ...base, sort: { dimKey: 'a', by: 'label', dir: 'desc' } });
    expect([...new Set(labelsOf(desc, 0))]).toEqual(['zeta', 'Gamma', 'Epsilon', 'delta', 'beta', 'Alpha', 'Null']);

    // By value on the inner dim: within each cat, subs ordered by SUM(v1) over the whole data.
    const byVal = runQuery(syn, { ...base, sort: { dimKey: 'b', by: 'value', measureKey: 'm', dir: 'desc' } });
    const totals = runQuery(syn, plan([{ key: 'b', field: 'sub' }], [{ key: 'm', field: 'v1', aggregation: 'sum' }]));
    const totalOf = new Map(Array.from(totals.dims[0]!.codes!, (c, j) => [totals.dims[0]!.labels![c]!, totals.measures[0]!.values[j]!]));
    const cats = labelsOf(byVal, 0), subs = labelsOf(byVal, 1);
    for (let j = 1; j < byVal.groups; j++) {
      if (cats[j] !== cats[j - 1]) continue;
      expect(totalOf.get(subs[j]!)!).toBeLessThanOrEqual(totalOf.get(subs[j - 1]!)!);
    }
    expect([...new Set(cats)]).toEqual(['Alpha', 'beta', 'delta', 'Epsilon', 'Gamma', 'zeta', 'Null']);

    // By value on the outer dim, ascending.
    const outer = runQuery(syn, { ...base, sort: { dimKey: 'a', by: 'value', measureKey: 'm', dir: 'asc' } });
    const catTotals = runQuery(syn, plan([{ key: 'a', field: 'cat' }], [{ key: 'm', field: 'v1', aggregation: 'sum' }]));
    const ct = new Map(Array.from(catTotals.dims[0]!.codes!, (c, j) => [catTotals.dims[0]!.labels![c]!, catTotals.measures[0]!.values[j]!]));
    const order = [...new Set(labelsOf(outer, 0))];
    for (let j = 1; j < order.length; j++) expect(ct.get(order[j]!)!).toBeGreaterThanOrEqual(ct.get(order[j - 1]!)!);

    const manual = runQuery(syn, { ...base, sort: { dimKey: 'a', by: 'manual', dir: 'asc', manual: ['zeta', 'Alpha'] } });
    expect([...new Set(labelsOf(manual, 0))]).toEqual(['zeta', 'Alpha', 'beta', 'delta', 'Epsilon', 'Gamma', 'Null']);
  });

  it('date parts come out in natural order and trunc dims carry epoch ms', () => {
    const res = runQuery(syn, plan([{ key: 'm', field: 'ts', date: { level: 'month', mode: 'part' } }], [{ key: 'c', field: 'v1', aggregation: 'count' }]));
    expect(res.dims[0]!.labels).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Null']);
    const tr = runQuery(syn, plan([{ key: 't', field: 'ts', date: { level: 'year', mode: 'trunc' } }], [{ key: 'c', field: 'v1', aggregation: 'count' }]));
    expect(tr.dims[0]!.kind).toBe('values');
    expect(Array.from(tr.dims[0]!.values!).slice(0, 2)).toEqual([Date.UTC(2019, 0, 1), Date.UTC(2020, 0, 1)]);
    expect(tr.dims[0]!.values!.at(-1)).toBeNaN();
  });

  it('limit stride-samples the ordered groups and flags truncation', () => {
    const p = plan([{ key: 'n', field: 'v2' }], [{ key: 'c', field: 'v1', aggregation: 'count' }], { limit: 10 });
    const full = runQuery(syn, { ...p, limit: 50_000 });
    const res = runQuery(syn, p);
    expect(full.groups).toBe(1001);
    expect(res.groups).toBe(10);
    expect(res.truncated).toBe(true);
    const picked = Array.from(res.dims[0]!.codes!, (c) => res.dims[0]!.labels![c]!);
    const all = Array.from(full.dims[0]!.codes!, (c) => full.dims[0]!.labels![c]!);
    expect(picked).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => all[Math.floor(k * 100.1)]!));
  });

  it('disaggregate returns rows with raw values and compact dim labels', () => {
    const filters: FilterSpec[] = [{ pillId: 'f', field: 'cat', kind: 'categorical', mode: 'include', values: ['Alpha'], includeNull: false }];
    const p = plan([{ key: 'a', field: 'cat' }, { key: 'y', field: 'ts', date: { level: 'year', mode: 'part' } }], [{ key: 'x', field: 'v1', aggregation: 'none' }, { key: 'z', field: 'v2', aggregation: 'none' }], { disaggregate: true, filters });
    const res = runQuery(syn, p);
    const mask = buildMask(syn, filters)!;
    let n = 0; for (const b of mask) n += b;
    expect(res.groups).toBe(n);
    expect(res.filteredRows).toBe(n);
    expect(res.dims[0]!.labels).toEqual(['Alpha']);
    const v1 = syn.numericView('v1'), v2 = syn.numericView('v2');
    let j = 0;
    for (let i = 0; i < syn.rowCount && j < 50; i++) {
      if (!mask[i]) continue;
      const a = res.measures[0]!.values[j]!, e = v1[i]!;
      if (e !== e) expect(a).toBeNaN(); else expect(a).toBe(e);
      expect(res.measures[1]!.values[j]).toBe(v2[i]! === v2[i]! ? v2[i]! : res.measures[1]!.values[j]);
      j++;
    }
    const capped = runQuery(syn, { ...p, limit: 100 });
    expect(capped.groups).toBe(100);
    expect(capped.truncated).toBe(true);
    const col = syn.column('cat');
    if (col.storage !== 'dict') throw new Error();
    expect(res.dims[0]!.codes!.buffer).not.toBe(col.codes.buffer);
  });

  it('boxstats match quantile-7 statistics and 1.5 IQR whiskers', () => {
    const p = plan([{ key: 'a', field: 'cat' }], [{ key: 'm', field: 'v1', aggregation: 'avg' }], { boxstats: { measureKey: 'm' } });
    const res = runQuery(syn, p);
    const bs = res.boxstats!;
    const v1 = syn.numericView('v1');
    const col = syn.column('cat');
    if (col.storage !== 'dict') throw new Error();
    for (let j = 0; j < res.groups; j++) {
      const label = res.dims[0]!.labels![res.dims[0]!.codes![j]!]!;
      const vals: number[] = [];
      for (let i = 0; i < syn.rowCount; i++) {
        const c = col.codes[i]!;
        if ((c < 0 ? 'Null' : col.dict[c]) === label && v1[i]! === v1[i]!) vals.push(v1[i]!);
      }
      vals.sort((a, b) => a - b);
      const q = (p: number) => { const pos = (vals.length - 1) * p, lo = Math.floor(pos); return vals[lo]! + (pos - lo) * ((vals[lo + 1] ?? vals[lo]!) - vals[lo]!); };
      expect(bs.q1[j]).toBeCloseTo(q(0.25), 9);
      expect(bs.med[j]).toBeCloseTo(q(0.5), 9);
      expect(bs.q3[j]).toBeCloseTo(q(0.75), 9);
      const iqr = q(0.75) - q(0.25);
      const inside = vals.filter((v) => v >= q(0.25) - 1.5 * iqr && v <= q(0.75) + 1.5 * iqr);
      expect(bs.lo[j]).toBe(inside[0]);
      expect(bs.hi[j]).toBe(inside.at(-1));
      expect(bs.outliers[j]!.length).toBe(vals.length - inside.length);
    }
  });

  it('percentiles on small groups: one value is every percentile, two values interpolate', async () => {
    const { store } = await loadTable(['k', 'v'], [['one', '7'], ['two', '10'], ['two', '20'], ['three', '1'], ['three', '2'], ['three', '3']]);
    const p = plan([{ key: 'k', field: 'k' }], ['p05', 'p10', 'p25', 'median', 'p75', 'p90', 'p95'].map((a) => ({ key: a, field: 'v', aggregation: a as Aggregation })));
    const res = runQuery(store, p);
    const row = (label: string) => res.measures.map((m) => m.values[res.dims[0]!.labels!.indexOf(label)]!);
    expect(row('one')).toEqual([7, 7, 7, 7, 7, 7, 7]);
    row('two').forEach((v, i) => expect(v).toBeCloseTo([10.5, 11, 12.5, 15, 17.5, 19, 19.5][i]!, 12));
    row('three').forEach((v, i) => expect(v).toBeCloseTo([1.1, 1.2, 1.5, 2, 2.5, 2.8, 2.9][i]!, 12));
  });

  it('bands: one vector per level equal to the per-group percentiles, NaN for an empty group', async () => {
    const levels = [5, 10, 25, 50, 75, 90, 95];
    const aggs: Aggregation[] = ['p05', 'p10', 'p25', 'median', 'p75', 'p90', 'p95'];
    const p = plan([{ key: 'a', field: 'cat' }], [{ key: 'm', field: 'v1', aggregation: 'avg' }, ...aggs.map((a) => ({ key: a, field: 'v1', aggregation: a }))], { bands: { measureKey: 'm', levels } });
    const res = runQuery(syn, p);
    expect(res.bands).toHaveLength(levels.length);
    res.bands!.forEach((band, k) => {
      expect(band).toBeInstanceOf(Float64Array);
      expect(band.length).toBe(res.groups);
      const viaAgg = res.measures[k + 1]!.values;
      for (let j = 0; j < res.groups; j++) expect(band[j], `level ${levels[k]} group ${j}`).toBe(viaAgg[j]);
    });
    // Reference: brute-force type-7 per group on the raw values.
    const ref = reference(syn, plan([{ key: 'a', field: 'cat' }], aggs.map((a) => ({ key: a, field: 'v1', aggregation: a }))));
    for (let j = 0; j < res.groups; j++) {
      const label = res.dims[0]!.labels![res.dims[0]!.codes![j]!]!;
      ref.get(label)!.forEach((e, k) => expect(res.bands![k]![j]!).toBeCloseTo(e, 9));
    }

    const { store } = await loadTable(['k', 'v'], [['a', '1'], ['a', '3'], ['b', ''], ['b', 'NULL']]);
    const small = runQuery(store, plan([{ key: 'k', field: 'k' }], [{ key: 'm', field: 'v', aggregation: 'sum' }], { bands: { measureKey: 'm', levels: [25, 75] } }));
    expect(small.dims[0]!.labels).toEqual(['a', 'b']);
    expect(Array.from(small.bands![0]!)).toEqual([1.5, NaN]);
    expect(Array.from(small.bands![1]!)).toEqual([2.5, NaN]);
  });

  it('bands follow sort and limit, and are absent for an unknown measure key', () => {
    const base = plan([{ key: 'n', field: 'v2' }], [{ key: 'm', field: 'v1', aggregation: 'p25' }], { bands: { measureKey: 'm', levels: [25] }, sort: { dimKey: 'n', by: 'value', measureKey: 'm', dir: 'desc' } });
    const full = runQuery(syn, { ...base, limit: 50_000 });
    expect(full.groups).toBe(1001);
    for (let j = 0; j < full.groups; j++) expect(full.bands![0]![j]).toBe(full.measures[0]!.values[j]);
    const cut = runQuery(syn, { ...base, limit: 10 });
    expect(cut.truncated).toBe(true);
    expect(cut.bands![0]!.length).toBe(10);
    for (let j = 0; j < 10; j++) expect(cut.bands![0]![j]).toBe(cut.measures[0]!.values[j]);
    expect(runQuery(syn, { ...base, bands: { measureKey: 'ghost', levels: [50] } }).bands).toBeUndefined();
    expect(runQuery(syn, plan([{ key: 'a', field: 'cat' }], [{ key: 'm', field: 'v1', aggregation: 'sum' }])).bands).toBeUndefined();
  });

  it('zero dimensions is one group (KPI)', () => {
    const res = runQuery(sample, plan([], [{ key: 'm', field: 'price', aggregation: 'avg' }, { key: 'c', field: 'id', aggregation: 'count' }]));
    expect(res.groups).toBe(1);
    expect(res.measures[1]!.values[0]).toBe(8);
    expect(res.measures[0]!.values[0]).toBeCloseTo((25.5 - 3.25 + 30 + 45.75 + 12 + 18.125 + 99.9) / 7, 9);
    const empty = runQuery(sample, plan([], [{ key: 'c', field: 'id', aggregation: 'count' }], { filters: [{ pillId: 'f', field: 'region', kind: 'categorical', mode: 'include', values: ['nowhere'], includeNull: false }] }));
    expect(empty.groups).toBe(1);
    expect(empty.measures[0]!.values[0]).toBe(0);
    expect(empty.filteredRows).toBe(0);
  });

  it('rejects unknown fields and date treatment of non-date fields', () => {
    expect(() => runQuery(sample, plan([{ key: 'x', field: 'nope' }], []))).toThrow(/unknown field/);
    expect(() => runQuery(sample, plan([{ key: 'x', field: 'region', date: { level: 'year', mode: 'part' } }], []))).toThrow(/not a date/);
  });
});

describe('profileField and rowsOf', () => {
  it('profiles dict fields by count desc with search and truncation', () => {
    const p = profileField(sample, 'region', 10);
    expect(p.labels).toEqual(['Houston', 'North', 'South', 'West']);
    expect(Array.from(p.counts)).toEqual([2, 2, 2, 2]);
    expect(p).toMatchObject({ min: null, max: null, nullCount: 0, truncated: false });
    const s = profileField(sample, 'region', 10, 'OU');
    expect(s.labels).toEqual(['Houston', 'South']);
    const t = profileField(sample, 'fuel', 2);
    expect(t.labels).toEqual(['Gas', 'Wind']);
    expect(t.truncated).toBe(true);
    const n = profileField(sample, 'note', 20);
    expect(n.nullCount).toBe(1);
    expect(n.labels).not.toContain('Null');
  });

  it('profiles numbers, dates and booleans', () => {
    const mw = profileField(sample, 'mw', 100);
    expect(mw.labels).toEqual(['0', '600', '850', '1200', '1350', '1500', '1800', '2000']);
    expect(mw).toMatchObject({ min: 0, max: 2000 });
    const ts = profileField(sample, 'timestamp', 3);
    expect(ts.labels).toEqual(['2024-01-01', '2024-01-01 01:00:00', '2024-01-01 02:00:00']);
    expect(ts.truncated).toBe(true);
    const b = profileField(sample, 'is_peak', 5);
    expect(b.labels.sort()).toEqual(['False', 'True']);
    const price = profileField(sample, 'price', 100);
    expect(price.nullCount).toBe(1);
    expect(price.labels[0]).toBe('-3.25');
  });

  it('slices filtered rows with offset and limit', () => {
    const r = rowsOf(sample, 1, 2, ['region', 'price', 'is_peak', 'timestamp'], [{ pillId: 'f', field: 'fuel', kind: 'categorical', mode: 'include', values: ['Gas'], includeNull: false }]);
    expect(r.total).toBe(4);
    expect(r.fields).toEqual(['region', 'price', 'is_peak', 'timestamp']);
    expect(r.columns[0]).toEqual(['North', 'Houston']);
    expect(r.columns[1]).toBeInstanceOf(Float64Array);
    expect(Array.from(r.columns[1] as Float64Array)).toEqual([30, 45.75]);
    expect(r.columns[2]).toEqual(['True', 'True']);
    expect(Array.from(r.columns[3] as Float64Array)).toEqual([Date.UTC(2024, 0, 1, 2), Date.UTC(2024, 1, 29, 4)]);
    const all = rowsOf(sample, 0, 100, ['note'], []);
    expect(all.total).toBe(8);
    expect((all.columns[0] as string[])[3]).toBe('Null');
  });
});
