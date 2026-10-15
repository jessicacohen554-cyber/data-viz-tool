import { describe, expect, it } from 'vitest';
import type { FieldMeta } from '../core/types';
import { autoDateFormat, autoFormat, makeAxisFormatter, makeFormatter } from './formatter';
import { isNegativeMarked as isNegativeMarkedExport } from './number-format';

/** Minimal FieldMeta fixture. */
function meta(partial: Partial<FieldMeta>): FieldMeta {
  return {
    name: 'f', index: 0, type: 'number', role: 'measure', defaultContinuity: 'continuous', defaultAggregation: 'sum',
    storage: 'f64', rowCount: 3, nullCount: 0, cardinality: 3, highCardinality: false, min: 0, max: 1,
    topValues: [], dateFormat: null, dateAmbiguous: false, parseErrors: 0, confidence: 1, ...partial,
  };
}

describe('autoFormat', () => {
  it('numbers: thousands + up to 2 decimals; integers 0 decimals', () => {
    expect(autoFormat(meta({ type: 'number' }))).toEqual({ kind: 'automatic', thousands: true, decimals: 2 });
    expect(autoFormat(meta({ type: 'integer', storage: 'i32' }))).toEqual({ kind: 'automatic', thousands: true, decimals: 0 });
  });
  it('dates by type, booleans True/False, strings automatic', () => {
    expect(autoFormat(meta({ type: 'date', storage: 'date' }))).toEqual({ kind: 'date', datePattern: 'yyyy-MM-dd' });
    expect(autoFormat(meta({ type: 'datetime', storage: 'date' }))).toEqual({ kind: 'date', datePattern: 'yyyy-MM-dd HH:mm:ss' });
    expect(autoFormat(meta({ type: 'boolean', storage: 'bool' }))).toEqual({ kind: 'boolean', booleanLabels: ['True', 'False'] });
    expect(autoFormat(meta({ type: 'string', storage: 'dict' }))).toEqual({ kind: 'automatic' });
  });
  it('autoDateFormat: trunc → level pattern, part → automatic', () => {
    expect(autoDateFormat({ level: 'quarter', mode: 'trunc' })).toEqual({ kind: 'date', datePattern: 'Q yyyy' });
    expect(autoDateFormat({ level: 'month', mode: 'part' })).toEqual({ kind: 'automatic' });
  });
});

describe('makeFormatter', () => {
  it('automatic number field', () => {
    const f = makeFormatter(meta({ type: 'number' }));
    expect(f(1234567.891)).toBe('1,234,567.89');
    expect(f(2.5)).toBe('2.5');
    expect(f(null)).toBe('');
    expect(f('abc')).toBe('abc');
  });
  it('automatic integer field', () => {
    const f = makeFormatter(meta({ type: 'integer', storage: 'i32' }));
    expect(f(1234567)).toBe('1,234,567');
  });
  it('explicit spec overrides', () => {
    const f = makeFormatter(meta({ type: 'number' }), { kind: 'currency', decimals: 0 });
    expect(f(1234.5)).toBe('$1,235');
    const r = makeFormatter(meta({ type: 'number' }), { kind: 'number', negative: 'red' });
    expect(isNegativeMarkedExport(r(-1))).toBe(true);
  });
  it('date and datetime fields by automatic pattern', () => {
    const t = Date.UTC(2024, 1, 5, 14, 7, 9);
    expect(makeFormatter(meta({ type: 'date', storage: 'date' }))(t)).toBe('2024-02-05');
    expect(makeFormatter(meta({ type: 'datetime', storage: 'date' }))(t)).toBe('2024-02-05 14:07:09');
    expect(makeFormatter(meta({ type: 'datetime', storage: 'date' }), { kind: 'date', datePattern: 'MMM d, yyyy' })(t)).toBe('Feb 5, 2024');
    expect(makeFormatter(meta({ type: 'date', storage: 'date' }))(null)).toBe('');
  });
  it('booleans use labels, including custom ones and numeric 0/1', () => {
    const f = makeFormatter(meta({ type: 'boolean', storage: 'bool' }));
    expect(f(true)).toBe('True');
    expect(f(false)).toBe('False');
    expect(f(1)).toBe('True');
    expect(f(0)).toBe('False');
    const g = makeFormatter(meta({ type: 'boolean', storage: 'bool' }), { kind: 'boolean', booleanLabels: ['Yes', 'No'] });
    expect(g(false)).toBe('No');
  });
  it('units auto is none in label context', () => {
    expect(makeFormatter(meta({ type: 'number' }), { kind: 'number', units: 'auto' })(1234567.891)).toBe('1,234,567.89');
  });
});

describe('makeAxisFormatter', () => {
  it('automatic picks a shared unit from the axis max', () => {
    const f = makeAxisFormatter(meta({ type: 'number' }), undefined, 1234567.891);
    expect(f(1234567.891)).toBe('1.2M');
    expect(f(500000)).toBe('0.5M');
    expect(f(0)).toBe('0M');
  });
  it('explicit units auto follows the axis max; fixed units ignore it', () => {
    expect(makeAxisFormatter(meta({ type: 'number' }), { kind: 'number', units: 'auto', decimals: 1 }, 5000)(2500)).toBe('2.5K');
    expect(makeAxisFormatter(meta({ type: 'number' }), { kind: 'number', units: 'K', decimals: 1 }, 5e9)(2500)).toBe('2.5K');
  });
  it('small axes stay unscaled', () => {
    expect(makeAxisFormatter(meta({ type: 'integer', storage: 'i32' }), undefined, 90)(45)).toBe('45');
  });
});
