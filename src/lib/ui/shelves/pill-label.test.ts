import { describe, expect, it } from 'vitest';
import { newPill } from '../../core/spec-defaults';
import { meta } from '../../core/spec-defaults.test';
import { pillDescription, pillLabel, pillName } from './pill-label';

describe('pill labels', () => {
  it('a measure reads AGG(field) with Tableau prefixes', () => {
    const p = newPill(meta('price', 'number'), 'rows');
    expect(pillLabel(p)).toBe('SUM(price)');
    expect(pillLabel({ ...p, aggregation: 'avg' })).toBe('AVG(price)');
    expect(pillLabel({ ...p, aggregation: 'countd' })).toBe('CNTD(price)');
    expect(pillLabel({ ...p, aggregation: 'median' })).toBe('MEDIAN(price)');
  });

  it('a disaggregated measure reads the bare field', () => {
    const p = newPill(meta('price', 'number'), 'rows');
    expect(pillLabel({ ...p, aggregation: 'none' })).toBe('price');
  });

  it('a dimension reads the bare field and ignores its default aggregation', () => {
    const p = newPill(meta('zone', 'string'), 'columns');
    expect(p.aggregation).toBe('count');
    expect(pillLabel(p)).toBe('zone');
  });

  it('a dimension used as a measure reads CNT(field)', () => {
    const p = newPill(meta('zone', 'string'), 'rows');
    expect(pillLabel({ ...p, role: 'measure', continuity: 'continuous' })).toBe('CNT(zone)');
  });

  it('a date pill reads LEVEL(field) in part and trunc modes', () => {
    const p = newPill(meta('ts', 'datetime'), 'columns');
    expect(pillLabel(p)).toBe('YEAR(ts)');
    expect(pillLabel({ ...p, date: { level: 'month', mode: 'trunc' }, continuity: 'continuous' })).toBe('MONTH(ts)');
    expect(pillLabel({ ...p, date: { level: 'quarter', mode: 'part' } })).toBe('QUARTER(ts)');
  });

  it('a binned measure reads "field (bin)"', () => {
    const p = newPill(meta('price', 'number'), 'columns');
    expect(pillLabel({ ...p, bin: { count: 20 } })).toBe('price (bin)');
  });

  it('an alias replaces the field name inside the label', () => {
    const p = newPill(meta('price_usd_mwh', 'number'), 'rows');
    expect(pillName({ ...p, alias: 'Price' })).toBe('Price');
    expect(pillLabel({ ...p, alias: 'Price' })).toBe('SUM(Price)');
    expect(pillLabel({ ...p, alias: '   ' })).toBe('SUM(price_usd_mwh)');
  });

  it('the accessible description names the continuity', () => {
    const p = newPill(meta('ts', 'date'), 'columns');
    expect(pillDescription(p)).toBe('YEAR(ts), discrete, date part');
    expect(pillDescription(newPill(meta('price', 'number'), 'rows'))).toBe('SUM(price), continuous');
  });
});
