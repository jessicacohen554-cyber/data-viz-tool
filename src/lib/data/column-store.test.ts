import { describe, expect, it } from 'vitest';
import type { FieldMeta } from '../core/types';
import {
  BOOL_NULL, BoolBuilder, ColumnStore, DateBuilder, DictBuilder, F64Builder, I32Builder, I32_NULL, compareLabels,
  finalizeMeta, keysOf, labelAt,
} from './column-store';
import { compileParser } from './date-parse';

function meta(name: string): FieldMeta {
  return {
    name, index: 0, type: 'string', role: 'dimension', defaultContinuity: 'discrete', defaultAggregation: 'count',
    storage: 'dict', rowCount: 0, nullCount: 0, cardinality: 0, highCardinality: false, min: null, max: null,
    topValues: [], dateFormat: null, dateAmbiguous: false, parseErrors: 0, confidence: 1,
  };
}

describe('DictBuilder', () => {
  it('sorts the dictionary case-insensitively, remaps codes and keeps nulls as −1', () => {
    const b = new DictBuilder(2);
    for (const v of ['West', 'north', 'West', 'NULL', 'East', '', 'Apple', 'apple']) b.push(v);
    const { column, parseErrors } = b.finish();
    expect(parseErrors).toBe(0);
    if (column.storage !== 'dict') throw new Error('expected dict');
    expect(column.dict).toEqual(['Apple', 'apple', 'East', 'north', 'West']);
    expect(Array.from(column.codes)).toEqual([4, 3, 4, -1, 2, -1, 0, 1]);
    const m = finalizeMeta(meta('x'), column, 0);
    expect(m).toMatchObject({ rowCount: 8, nullCount: 2, cardinality: 5, highCardinality: false, min: null, max: null });
    expect(m.topValues[0]).toEqual(['West', 2]);
    expect(m.topValues).toHaveLength(5);
  });

  it('compareLabels is deterministic and case-insensitive first', () => {
    expect(['b', 'A', 'a', 'B'].sort(compareLabels)).toEqual(['A', 'a', 'B', 'b']);
  });
});

describe('I32Builder', () => {
  it('stores whole numbers with a null sentinel and counts parse errors', () => {
    const b = new I32Builder(2);
    for (const v of ['1', '-2', 'NA', 'abc', ' 7 ', '2147483647']) b.push(v);
    b.pushNull();
    const { column, parseErrors } = b.finish();
    expect(column.storage).toBe('i32');
    if (column.storage !== 'i32') throw new Error();
    expect(Array.from(column.values)).toEqual([1, -2, I32_NULL, I32_NULL, 7, 2147483647, I32_NULL]);
    expect(parseErrors).toBe(1);
    const m = finalizeMeta(meta('x'), column, parseErrors);
    expect(m).toMatchObject({ nullCount: 3, cardinality: 4, min: -2, max: 2147483647, parseErrors: 1 });
  });

  it('promotes to f64 when a decimal or out-of-range value appears, at any row', () => {
    const b = new I32Builder(2);
    for (let i = 0; i < 20; i++) b.push(String(i));
    b.push('NULL');
    b.push('20.5');
    b.push('3000000000');
    b.push('x');
    const { column, parseErrors } = b.finish();
    expect(column.storage).toBe('f64');
    if (column.storage !== 'f64') throw new Error();
    expect(column.values.length).toBe(24);
    expect(column.values[3]).toBe(3);
    expect(column.values[20]).toBeNaN();
    expect(column.values[21]).toBe(20.5);
    expect(column.values[22]).toBe(3e9);
    expect(column.values[23]).toBeNaN();
    expect(parseErrors).toBe(1);
  });
});

describe('F64Builder / DateBuilder / BoolBuilder', () => {
  it('F64 parses decimals and exponents, nulls the rest', () => {
    const b = new F64Builder(1);
    for (const v of ['1.5', '4e2', '.5', 'NaN', 'Infinity', '1,2']) b.push(v);
    const { column, parseErrors } = b.finish();
    if (column.storage !== 'f64') throw new Error();
    expect(Array.from(column.values).map((v) => (v !== v ? null : v))).toEqual([1.5, 400, 0.5, null, null, null]);
    expect(parseErrors).toBe(2); // NaN is a null token, not an error
    const m = finalizeMeta(meta('x'), column, parseErrors);
    expect(m).toMatchObject({ nullCount: 3, cardinality: 3, min: 0.5, max: 400 });
  });

  it('Date uses the compiled parser and counts failures', () => {
    const b = new DateBuilder(compileParser('yyyy-MM-dd'), 1);
    for (const v of ['2024-02-05', '', '2024-02-30', '2019-01-01']) b.push(v);
    const { column, parseErrors } = b.finish();
    if (column.storage !== 'date') throw new Error();
    expect(column.values[0]).toBe(Date.UTC(2024, 1, 5));
    expect(column.values[1]).toBeNaN();
    expect(column.values[2]).toBeNaN();
    expect(parseErrors).toBe(1);
    const m = finalizeMeta(meta('x'), column, parseErrors);
    expect(m).toMatchObject({ nullCount: 2, cardinality: 2, min: Date.UTC(2019, 0, 1), max: Date.UTC(2024, 1, 5) });
  });

  it('Bool maps the word set and nulls anything else', () => {
    const b = new BoolBuilder(1);
    for (const v of ['true', 'No', 'Y', 'f', 'maybe', 'NA']) b.push(v);
    const { column, parseErrors } = b.finish();
    if (column.storage !== 'bool') throw new Error();
    expect(Array.from(column.values)).toEqual([1, 0, 1, 0, BOOL_NULL, BOOL_NULL]);
    expect(parseErrors).toBe(1);
    const m = finalizeMeta(meta('x'), column, parseErrors);
    expect(m).toMatchObject({ nullCount: 2, cardinality: 2 });
    expect(m.topValues).toEqual([['True', 2], ['False', 2]]);
  });

  it('labelAt renders every storage', () => {
    const d = new DictBuilder(); d.push('a'); d.pushNull();
    const i = new I32Builder(); i.push('3'); i.pushNull();
    const f = new F64Builder(); f.push('2.5'); f.pushNull();
    const t = new DateBuilder(compileParser('yyyy-MM-dd')); t.push('2024-02-05'); t.pushNull();
    const o = new BoolBuilder(); o.push('yes'); o.pushNull();
    const cols = [d, i, f, t, o].map((b) => b.finish().column);
    expect(cols.map((c) => labelAt(c, 0))).toEqual(['a', '3', '2.5', '2024-02-05', 'True']);
    expect(cols.map((c) => labelAt(c, 1))).toEqual(['Null', 'Null', 'Null', 'Null', 'Null']);
  });
});

describe('ColumnStore derived columns', () => {
  function store() {
    const dates = new DateBuilder(compileParser("yyyy-MM-dd'T'HH:mm"));
    for (const v of ['2024-01-05T10:30', '2024-01-05T11:30', '2024-03-01T00:00', '', '2023-12-31T23:59']) dates.push(v);
    const nums = new I32Builder();
    for (const v of ['5', '3', '5', '', '1']) nums.push(v);
    const built = [dates.finish(), nums.finish()];
    const metas = [meta('ts'), meta('n')];
    built.forEach((b, i) => finalizeMeta(metas[i]!, b.column, b.parseErrors));
    return new ColumnStore(metas, built.map((b) => b.column), 5);
  }

  it('computes and caches date parts with min/max', () => {
    const s = store();
    const p = s.datePart('ts', 'month');
    expect(Array.from(p.parts)).toEqual([1, 1, 3, -1, 12]);
    expect([p.min, p.max]).toEqual([1, 12]);
    expect(s.datePart('ts', 'month')).toBe(p);
    expect(Array.from(s.datePart('ts', 'hour').parts)).toEqual([10, 11, 0, -1, 23]);
    expect(Array.from(s.datePart('ts', 'year').parts)).toEqual([2024, 2024, 2024, -1, 2023]);
  });

  it('date-trunc keys are sorted distinct period starts', () => {
    const s = store();
    const k = s.dateTruncKeys('ts', 'day');
    expect(Array.from(k.values)).toEqual([Date.UTC(2023, 11, 31), Date.UTC(2024, 0, 5), Date.UTC(2024, 2, 1)]);
    expect(Array.from(k.codes)).toEqual([1, 1, 2, -1, 0]);
    expect(s.dateTruncKeys('ts', 'day')).toBe(k);
  });

  it('distinctKeys and numericView cover i32 with nulls', () => {
    const s = store();
    expect(Array.from(s.numericView('n')).map((v) => (v !== v ? null : v))).toEqual([5, 3, 5, null, 1]);
    const k = s.distinctKeys('n');
    expect(Array.from(k.values)).toEqual([1, 3, 5]);
    expect(Array.from(k.codes)).toEqual([2, 1, 2, -1, 0]);
    expect(s.indexOf('n')).toBe(1);
    expect(s.indexOf('zzz')).toBe(-1);
    expect(() => s.column('zzz')).toThrow(/unknown field/);
    expect(() => s.datePart('n', 'year')).toThrow(/not a date/);
  });

  it('replaceColumn swaps storage, refreshes meta and drops derived caches', () => {
    const s = store();
    const before = s.distinctKeys('n');
    const f = new F64Builder();
    for (const v of ['5.5', '3', '5', '', '1']) f.push(v);
    const m = s.replaceColumn('n', f.finish(), { type: 'number', storage: 'f64' });
    expect(m).toMatchObject({ type: 'number', storage: 'f64', min: 1, max: 5.5, nullCount: 1, cardinality: 4 });
    expect(s.distinctKeys('n')).not.toBe(before);
    expect(Array.from(s.distinctKeys('n').values)).toEqual([1, 3, 5, 5.5]);
  });

  it('keysOf maps NaN to −1', () => {
    const k = keysOf(Float64Array.from([2, NaN, 1, 2]));
    expect(Array.from(k.values)).toEqual([1, 2]);
    expect(Array.from(k.codes)).toEqual([1, -1, 0, 1]);
  });
});
