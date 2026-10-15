import { beforeAll, describe, expect, it } from 'vitest';
import type { FilterSpec } from '../core/types';
import { loadFixture } from '../../../tests/fixtures/load';
import type { ColumnStore } from './column-store';
import { buildMask, countMask, filterKey, wildcardMatch } from './filters';

let store: ColumnStore;
beforeAll(async () => { store = (await loadFixture('sample.csv')).store; });

const bits = (m: Uint8Array | null) => (m ? Array.from(m) : null);
/** Distributive omit: keeps each union member's own fields. */
type NoPill<T> = T extends unknown ? Omit<T, 'pillId'> & { pillId?: string } : never;
const f = (spec: NoPill<FilterSpec>): FilterSpec => ({ pillId: 'p', ...spec } as FilterSpec);

describe('buildMask', () => {
  it('returns null for no filters', () => {
    expect(buildMask(store, [])).toBeNull();
    expect(countMask(null, 8)).toBe(8);
  });

  it('categorical include / exclude with null handling', () => {
    expect(bits(buildMask(store, [f({ field: 'region', kind: 'categorical', mode: 'include', values: ['West', 'South'], includeNull: false })]))).toEqual([1, 1, 0, 0, 0, 0, 1, 1]);
    expect(bits(buildMask(store, [f({ field: 'region', kind: 'categorical', mode: 'exclude', values: ['West'], includeNull: false })]))).toEqual([0, 0, 1, 1, 1, 1, 1, 1]);
    // note has a null in row 4 (index 3)
    expect(bits(buildMask(store, [f({ field: 'note', kind: 'categorical', mode: 'include', values: ['x'], includeNull: true })]))).toEqual([0, 0, 0, 1, 0, 1, 0, 0]);
    expect(bits(buildMask(store, [f({ field: 'note', kind: 'categorical', mode: 'include', values: ['x'], includeNull: false })]))).toEqual([0, 0, 0, 0, 0, 1, 0, 0]);
    // numeric and boolean fields compare by value
    expect(bits(buildMask(store, [f({ field: 'mw', kind: 'categorical', mode: 'include', values: ['1200', '600'], includeNull: false })]))).toEqual([1, 0, 0, 0, 0, 1, 0, 0]);
    expect(bits(buildMask(store, [f({ field: 'is_peak', kind: 'categorical', mode: 'include', values: ['True'], includeNull: false })]))).toEqual([1, 0, 1, 0, 1, 0, 1, 0]);
    expect(bits(buildMask(store, [f({ field: 'timestamp', kind: 'categorical', mode: 'include', values: ['2024-01-01'], includeNull: false })]))).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('range is inclusive, open-ended, and excludes nulls unless asked', () => {
    expect(bits(buildMask(store, [f({ field: 'price', kind: 'range', min: 25.5, max: 45.75, includeNull: false })]))).toEqual([1, 0, 1, 0, 1, 0, 0, 0]);
    expect(bits(buildMask(store, [f({ field: 'price', kind: 'range', min: null, max: 20, includeNull: true })]))).toEqual([0, 1, 0, 1, 0, 1, 1, 0]);
    expect(bits(buildMask(store, [f({ field: 'price', kind: 'range', min: 30, max: null, includeNull: false })]))).toEqual([0, 0, 1, 0, 1, 0, 0, 1]);
  });

  it('dateRange treats `to` as the end of its period at `level`', () => {
    const jan1 = Date.UTC(2024, 0, 1);
    expect(bits(buildMask(store, [f({ field: 'timestamp', kind: 'dateRange', from: jan1, to: jan1, level: 'day' })]))).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
    expect(bits(buildMask(store, [f({ field: 'timestamp', kind: 'dateRange', from: jan1, to: jan1 })]))).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(bits(buildMask(store, [f({ field: 'timestamp', kind: 'dateRange', from: Date.UTC(2024, 1, 1), to: Date.UTC(2024, 1, 1), level: 'month' })]))).toEqual([0, 0, 0, 0, 1, 0, 0, 0]);
    expect(bits(buildMask(store, [f({ field: 'timestamp', kind: 'dateRange', from: null, to: Date.UTC(2024, 2, 1), level: 'year' })]))).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(bits(buildMask(store, [f({ field: 'timestamp', kind: 'dateRange', from: Date.UTC(2024, 11, 1), to: null })]))).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it('wildcard matches labels case-insensitively; nulls never match', () => {
    expect(wildcardMatch('Houston', 'hou', 'starts')).toBe(true);
    expect(wildcardMatch('Houston', 'ton', 'ends')).toBe(true);
    expect(wildcardMatch('Houston', 'ust', 'contains')).toBe(true);
    expect(wildcardMatch('Houston', 'houston', 'exact')).toBe(true);
    expect(wildcardMatch('Houston', 'hous', 'exact')).toBe(false);
    expect(bits(buildMask(store, [f({ field: 'region', kind: 'wildcard', pattern: 'th', mode: 'ends' })]))).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
    expect(bits(buildMask(store, [f({ field: 'note', kind: 'wildcard', pattern: '', mode: 'contains' })]))).toEqual([1, 1, 1, 0, 1, 1, 1, 1]);
    expect(bits(buildMask(store, [f({ field: 'mw', kind: 'wildcard', pattern: '1', mode: 'starts' })]))).toEqual([1, 0, 1, 0, 0, 0, 1, 1]);
  });

  it('topN ranks by the measure over rows passing every other filter', () => {
    // SUM(mw) by region: West 2050, North 1500, Houston 2600, South 3150 → top 2 = South, Houston
    expect(bits(buildMask(store, [f({ field: 'region', kind: 'topN', n: 2, dir: 'top', by: { field: 'mw', aggregation: 'sum' } })]))).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(bits(buildMask(store, [f({ field: 'region', kind: 'topN', n: 1, dir: 'bottom', by: { field: 'mw', aggregation: 'sum' } })]))).toEqual([0, 0, 1, 1, 0, 0, 0, 0]);
    // With fuel = Gas as context: West 1200, North 1500, Houston 2000, South 1800 → top 1 = Houston; the AND keeps Gas rows only.
    const ctx = f({ pillId: 'q', field: 'fuel', kind: 'categorical', mode: 'include', values: ['Gas'], includeNull: false });
    const top = f({ field: 'region', kind: 'topN', n: 1, dir: 'top', by: { field: 'mw', aggregation: 'sum' } });
    expect(bits(buildMask(store, [ctx, top]))).toEqual([0, 0, 0, 0, 1, 0, 0, 0]);
    // AVG(price) with a null price in North/Solar: North avg = 30 (null ignored) → bottom 1 by avg = Houston? Houston avg 28.875, North 30, South 59.0125, West 11.125 → West.
    expect(bits(buildMask(store, [f({ field: 'region', kind: 'topN', n: 1, dir: 'bottom', by: { field: 'price', aggregation: 'avg' } })]))).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('ANDs several filters and caches each mask on the store', () => {
    const a = f({ pillId: 'a', field: 'region', kind: 'categorical', mode: 'include', values: ['West', 'North'], includeNull: false });
    const b = f({ pillId: 'b', field: 'is_peak', kind: 'categorical', mode: 'include', values: ['True'], includeNull: false });
    expect(bits(buildMask(store, [a, b]))).toEqual([1, 0, 1, 0, 0, 0, 0, 0]);
    const m1 = buildMask(store, [a]);
    const m2 = buildMask(store, [{ ...a, pillId: 'other' }]);
    expect(m2).toBe(m1); // pill id is not part of the key
    expect(store.maskCache.has(filterKey(a))).toBe(true);
    expect(countMask(m1, 8)).toBe(4);
  });

  it('throws on an unknown field', () => {
    expect(() => buildMask(store, [f({ field: 'nope', kind: 'range', min: 0, max: 1, includeNull: false })])).toThrow(/unknown field/);
  });
});
