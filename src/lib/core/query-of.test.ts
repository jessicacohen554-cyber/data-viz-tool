import { describe, expect, it } from 'vitest';
import { createDefaultSpec, newPill } from './spec-defaults';
import { pillKeyMap, queryKey, queryOf, stableStringify } from './query-of';
import { meta } from './spec-defaults.test';

function sample() {
  const s = createDefaultSpec('ercot');
  const zone = newPill(meta('zone', 'string'), 'columns');
  const price = newPill(meta('price', 'number'), 'rows');
  s.shelves.columns = [zone];
  s.shelves.rows = [price];
  return { s, zone, price };
}

describe('queryOf', () => {
  it('splits pills into dims and measures', () => {
    const { s, zone, price } = sample();
    const plan = queryOf(s);
    expect(plan.dims).toEqual([{ key: zone.id, field: 'zone' }]);
    expect(plan.measures).toEqual([{ key: price.id, field: 'price', aggregation: 'sum' }]);
    expect(plan.disaggregate).toBe(false);
  });

  it('ignores render-only changes in the key', () => {
    const { s } = sample();
    const k1 = queryKey(queryOf(s));
    s.chartType = 'bar';
    s.title = 'x';
    s.marks.opacity = 0.5;
    s.palette = { mode: 'manual', categorical: 'okabe-ito' };
    s.fieldFormats.price = { kind: 'currency' };
    expect(queryKey(queryOf(s))).toBe(k1);
  });

  it('changes the key when a filter, aggregation or date level changes', () => {
    const { s, price } = sample();
    const k1 = queryKey(queryOf(s));
    price.aggregation = 'avg';
    const k2 = queryKey(queryOf(s));
    expect(k2).not.toBe(k1);
    const f = newPill(meta('zone', 'string'), 'filters');
    s.shelves.filters = [f];
    s.filters = [{ pillId: f.id, field: 'zone', kind: 'categorical', mode: 'include', values: ['West'], includeNull: false }];
    expect(queryKey(queryOf(s))).not.toBe(k2);
  });

  it('keys are independent of pill ids', () => {
    const a = sample().s;
    const b = sample().s;
    expect(queryKey(queryOf(a))).toBe(queryKey(queryOf(b)));
  });

  it('dedupes the same dimension on two shelves and maps both pills to one key', () => {
    const { s, zone } = sample();
    const again = newPill(meta('zone', 'string'), 'color');
    s.shelves.color = [again];
    const plan = queryOf(s);
    expect(plan.dims).toHaveLength(1);
    const map = pillKeyMap(s);
    expect(map.get(again.id)).toBe(zone.id);
  });

  it('a measure with aggregation none disaggregates; chart needs add boxstats', () => {
    const { s, price } = sample();
    price.aggregation = 'none';
    expect(queryOf(s).disaggregate).toBe(true);
    price.aggregation = 'sum';
    const plan = queryOf(s, { boxstats: true });
    expect(plan.boxstats).toEqual({ measureKey: price.id });
  });

  it('sort by measure resolves to the measure key', () => {
    const { s, zone, price } = sample();
    zone.sort = { by: 'field', dir: 'desc', field: 'price', aggregation: 'sum' };
    const plan = queryOf(s);
    expect(plan.sort).toEqual({ dimKey: zone.id, by: 'value', measureKey: price.id, dir: 'desc' });
  });

  it('stableStringify sorts keys recursively', () => {
    expect(stableStringify({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  });
});
