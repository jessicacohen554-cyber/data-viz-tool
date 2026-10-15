import { describe, expect, it } from 'vitest';
import {
  adjacentLinks, bands, dimAccessor, distinct, foldSlices, grid, measureAt, ohlc, pairs, percentStack, pivot, rankPerX, runningTotal, sortByValue, sortByX, toTree,
} from './transforms';
import { resultDim, resultMeasure } from './test-fixtures';

describe('result access', () => {
  it('reads codes through labels and values directly; NaN is a null cell', () => {
    const d = resultDim('d', ['a', 'b', 'a']);
    const at = dimAccessor(d);
    expect([at(0), at(1), at(2)]).toEqual(['a', 'b', 'a']);
    expect(dimAccessor(resultDim('v', [5, 7]))(1)).toBe(7);
    const m = resultMeasure('m', [1, null]);
    expect(measureAt(m, 0)).toBe(1);
    expect(measureAt(m, 1)).toBeNull();
    expect(measureAt(m, 9)).toBeNull();
    expect(distinct(d, 3)).toEqual(['a', 'b']);
  });
});

describe('pivot', () => {
  const x = resultDim('x', ['Jan', 'Jan', 'Feb', 'Mar']);
  const s = resultDim('s', ['wind', 'solar', 'wind', 'solar']);
  const m = resultMeasure('m', [10, 5, 20, null]);

  it('wide form with nulls for missing combinations, series in first-appearance order', () => {
    const p = pivot(4, x, s, m, 'SUM(m)');
    expect(p.x).toEqual(['Jan', 'Feb', 'Mar']);
    expect(p.series.map((q) => q.name)).toEqual(['wind', 'solar']);
    expect(p.series[0]!.values).toEqual([10, 20, null]);
    expect(p.series[1]!.values).toEqual([5, null, null]);
  });

  it('honours an explicit series order (palette order) and keeps unseen series empty', () => {
    const p = pivot(4, x, s, m, 'SUM(m)', ['solar', 'wind', 'hydro']);
    expect(p.series.map((q) => q.name)).toEqual(['solar', 'wind', 'hydro']);
    expect(p.series[2]!.values).toEqual([null, null, null]);
  });

  it('without a series dimension yields one series named after the measure', () => {
    const p = pivot(4, x, undefined, m, 'SUM(m)');
    expect(p.series).toHaveLength(1);
    expect(p.series[0]!.name).toBe('SUM(m)');
    expect(p.series[0]!.values).toEqual([15, 20, null]);
  });

  it('sortByX orders numeric x ascending and leaves strings alone', () => {
    const p = sortByX({ x: [3, 1, 2], series: [{ name: 'a', values: [30, 10, 20] }] });
    expect(p.x).toEqual([1, 2, 3]);
    expect(p.series[0]!.values).toEqual([10, 20, 30]);
    expect(sortByX({ x: ['b', 'a'], series: [] }).x).toEqual(['b', 'a']);
  });
});

describe('percentStack', () => {
  it('shares of the positive total; negatives excluded and counted; zero total → empty column', () => {
    const { pivot: p, excludedNegatives } = percentStack({ x: ['a', 'b', 'c'], series: [{ name: 's1', values: [3, -2, 0] }, { name: 's2', values: [1, 2, 0] }] });
    expect(p.series[0]!.values[0]).toBeCloseTo(0.75);
    expect(p.series[1]!.values[0]).toBeCloseTo(0.25);
    expect(p.series[0]!.values[1]).toBeNull();
    expect(p.series[1]!.values[1]).toBe(1);
    expect(p.series[0]!.values[2]).toBeNull();
    expect(excludedNegatives).toBe(1);
  });
});

describe('runningTotal', () => {
  it('bases and deltas accumulate in the given order with a trailing total', () => {
    const w = runningTotal(['a', 'b', 'c'], [10, -4, 6]);
    expect(w.labels).toEqual(['a', 'b', 'c', 'Total']);
    expect(w.base).toEqual([0, 6, 6, 0]);
    expect(w.delta).toEqual([10, 4, 6, 12]);
    expect(w.kind).toEqual(['up', 'down', 'up', 'total']);
  });

  it('a null step draws nothing and leaves the total unchanged', () => {
    const w = runningTotal(['a', 'b'], [5, null]);
    expect(w.delta[1]).toBeNull();
    expect(w.delta[2]).toBe(5);
  });
});

describe('rankPerX', () => {
  it('ranks per x, ties broken by series order, absent values stay null', () => {
    const r = rankPerX({ x: [1, 2], series: [{ name: 'a', values: [5, 5] }, { name: 'b', values: [9, 5] }, { name: 'c', values: [null, 1] }] });
    expect(r.series[0]!.values).toEqual([2, 1]);
    expect(r.series[1]!.values).toEqual([1, 2]);
    expect(r.series[2]!.values).toEqual([null, 3]);
  });
});

describe('pairs, bands, grid', () => {
  it('pairs one row per dimension value', () => {
    const p = pairs(2, resultDim('d', ['x', 'y']), resultMeasure('a', [1, null]), resultMeasure('b', [2, 3]));
    expect(p).toEqual([{ label: 'x', a: 1, b: 2 }, { label: 'y', a: null, b: 3 }]);
  });

  it('bands are 60/80/100 % of the reference', () => {
    expect(bands(100)).toEqual([60, 80, 100]);
  });

  it('grid crosses two dims, skips null cells, tracks min/max', () => {
    const g = grid(4, resultDim('x', ['a', 'a', 'b', 'b']), resultDim('y', ['p', 'q', 'p', 'q']), resultMeasure('m', [1, null, 3, 4]));
    expect(g.xs).toEqual(['a', 'b']);
    expect(g.ys).toEqual(['p', 'q']);
    expect(g.cells).toEqual([[0, 0, 1], [1, 0, 3], [1, 1, 4]]);
    expect([g.min, g.max]).toEqual([1, 4]);
  });
});

describe('adjacentLinks and toTree', () => {
  const d1 = resultDim('d1', ['Gas', 'Wind', 'Gas']);
  const d2 = resultDim('d2', ['North', 'North', 'South']);
  const m = resultMeasure('m', [10, 5, -2]);

  it('links adjacent levels, level-prefixed node ids, negatives dropped', () => {
    const g = adjacentLinks(3, [d1, d2], m);
    expect(g.nodes.map((n) => n.id)).toEqual(['0:Gas', '1:North', '0:Wind']);
    expect(g.links).toEqual([{ source: '0:Gas', target: '1:North', value: 10 }, { source: '0:Wind', target: '1:North', value: 5 }]);
    expect(g.droppedNegative).toBe(1);
  });

  it('nests by dimension order and sums parents; non-positive leaves dropped', () => {
    const t = toTree(3, [d1, d2], m);
    expect(t.dropped).toBe(1);
    expect(t.roots.map((r) => [r.name, r.value])).toEqual([['Gas', 10], ['Wind', 5]]);
    expect(t.roots[0]!.children).toEqual([{ name: 'North', value: 10 }]);
  });
});

describe('ohlc, sortByValue, foldSlices', () => {
  it('drops rows violating low ≤ open,close ≤ high and sorts by time', () => {
    const t = resultDim('t', [2, 1, 3]);
    const r = ohlc(3, t, [resultMeasure('o', [10, 10, 10]), resultMeasure('c', [12, 9, 11]), resultMeasure('l', [9, 9, 10.5]), resultMeasure('h', [13, 11, 12])]);
    expect(r.dropped).toBe(1);
    expect(r.rows.map((row) => row[0])).toEqual([1, 2]);
  });

  it('sortByValue puts nulls last', () => {
    expect(sortByValue(['a', 'b', 'c'], [null, 2, 5], 'desc').labels).toEqual(['c', 'b', 'a']);
  });

  it('foldSlices keeps the largest and folds the rest into Other; negatives dropped', () => {
    const f = foldSlices(['a', 'b', 'c', 'd', 'e'], [5, 1, 3, -1, 2], 3);
    expect(f.labels).toEqual(['a', 'c', 'Other']);
    expect(f.values).toEqual([5, 3, 3]);
    expect(f.folded).toBe(2);
    expect(f.droppedNegative).toBe(1);
  });
});
