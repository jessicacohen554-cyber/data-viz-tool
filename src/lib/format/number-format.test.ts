/**
 * Oracle: docs/TABLEAU-SPEC.md §7.2 examples table and the negative-style table.
 */
import { describe, expect, it } from 'vitest';
import {
  NEGATIVE_MARK, formatCustom, formatNumber, formatNumberParts, isNegativeMarked,
  roundDecimalString, roundHalfAway, stripNegativeMark,
} from './number-format';

const V = 1234567.891;

describe('rounding (half away from zero on the decimal string)', () => {
  it('rounds 2.5 → 3 and −2.5 → −3', () => {
    expect(roundHalfAway(2.5, 0)).toBe(3);
    expect(roundHalfAway(-2.5, 0)).toBe(-3);
  });
  it('rounds 1.005 → 1.01 (decimal string, not binary)', () => {
    expect(roundDecimalString(1.005, 2)).toBe('1.01');
  });
  it('carries across digits and pads', () => {
    expect(roundDecimalString(9.995, 2)).toBe('10.00');
    expect(roundDecimalString(0.5, 0)).toBe('1');
    expect(roundDecimalString(3, 2)).toBe('3.00');
    expect(roundDecimalString(1e21, 0)).toBe('1000000000000000000000');
    expect(roundDecimalString(1.5e-7, 8)).toBe('0.00000015');
  });
});

describe('§7.2 examples on 1234567.891', () => {
  const rows: Array<[string, Parameters<typeof formatNumber>[1], string, number?]> = [
    ['Automatic (number field, label)', { kind: 'automatic' }, '1,234,567.89'],
    ['Number (Standard)', { kind: 'number' }, '1,234,567.89'],
    ['Number (Custom) decimals 0', { kind: 'number', decimals: 0 }, '1,234,568'],
    ['Number (Custom) decimals 1, units K', { kind: 'number', decimals: 1, units: 'K' }, '1,234.6K'],
    ['Number (Custom) decimals 2, units M', { kind: 'number', decimals: 2, units: 'M' }, '1.23M'],
    ['Number (Custom) decimals 2, units B', { kind: 'number', decimals: 2, units: 'B' }, '0.00B'],
    ['Number (Custom) decimals 3, thousands off', { kind: 'number', decimals: 3, thousands: false }, '1234567.891'],
    ['Number (Custom) prefix ~ suffix MW', { kind: 'number', prefix: '~', suffix: ' MW' }, '~1,234,567.89 MW'],
    ['Currency (Standard, USD)', { kind: 'currency' }, '$1,234,567.89'],
    ['Currency (Custom) decimals 0, units M', { kind: 'currency', decimals: 0, units: 'M' }, '$1M'],
    ['Currency (Standard, EUR, de-DE)', { kind: 'currency', currency: 'EUR', locale: 'de-DE' }, '1.234.567,89 €'],
    ['Scientific decimals 2', { kind: 'scientific', decimals: 2 }, '1.23E+06'],
    ['Scientific decimals 0', { kind: 'scientific', decimals: 0 }, '1E+06'],
    ['Percentage decimals 1', { kind: 'percent', decimals: 1 }, '123,456,789.1%'],
    ['Percentage on 0.1234, decimals 2', { kind: 'percent', decimals: 2 }, '12.34%', 0.1234],
    ['Custom #,##0.00;(#,##0.00)', { kind: 'custom', custom: '#,##0.00;(#,##0.00)' }, '1,234,567.89'],
    ['Custom #,##0,"K"', { kind: 'custom', custom: '#,##0,"K"' }, '1,235K'],
    ['Custom 0.0% on 0.1234', { kind: 'custom', custom: '0.0%' }, '12.3%', 0.1234],
  ];
  for (const [name, spec, expected, value] of rows) {
    it(name, () => {
      // Intl separates "89 €" with U+00A0; the oracle table prints a plain space.
      expect(formatNumber(value ?? V, spec).replace(/ /g, ' ')).toBe(expected);
    });
  }

  it('Automatic (integer field) on 1234567', () => {
    expect(formatNumber(1234567, { kind: 'automatic' }, { integer: true })).toBe('1,234,567');
  });
  it('Automatic (axis tick, units auto)', () => {
    expect(formatNumber(V, { kind: 'automatic' }, { axis: true, axisMax: V })).toBe('1.2M');
    expect(formatNumber(1000000, { kind: 'automatic' }, { axis: true, axisMax: 2_000_000 })).toBe('1M');
    expect(formatNumber(500, { kind: 'automatic' }, { axis: true, axisMax: 900 })).toBe('500');
  });
  it('units auto is none outside an axis', () => {
    expect(formatNumber(V, { kind: 'number', units: 'auto' })).toBe('1,234,567.89');
    expect(formatNumber(V, { kind: 'number', units: 'auto', decimals: 1 }, { axisMax: 5e9 })).toBe('0.0B');
  });
  it('automatic trims trailing zeros', () => {
    expect(formatNumber(2.5, { kind: 'automatic' })).toBe('2.5');
    expect(formatNumber(3, { kind: 'automatic' })).toBe('3');
    expect(formatNumber(1.005, { kind: 'automatic' })).toBe('1.01');
  });
});

describe('negative styles on −1234567.891, Number (Custom) 2 decimals', () => {
  const N = -V;
  it('- → -1,234,567.89', () => expect(formatNumber(N, { kind: 'number', negative: '-' })).toBe('-1,234,567.89'));
  it('() → (1,234,567.89)', () => expect(formatNumber(N, { kind: 'number', negative: '()' })).toBe('(1,234,567.89)'));
  it('red → marker + 1,234,567.89 (no sign)', () => {
    const s = formatNumber(N, { kind: 'number', negative: 'red' });
    expect(isNegativeMarked(s)).toBe(true);
    expect(stripNegativeMark(s)).toBe('1,234,567.89');
    expect(formatNumberParts(N, { kind: 'number', negative: 'red' })).toEqual({ text: '1,234,567.89', negative: true });
  });
  it('-red → marker + -1,234,567.89', () => {
    const s = formatNumber(N, { kind: 'number', negative: '-red' });
    expect(s).toBe(NEGATIVE_MARK + '-1,234,567.89');
    expect(formatNumberParts(N, { kind: 'number', negative: '-red' }).negative).toBe(true);
  });
  it('positive values are never marked', () => {
    expect(formatNumberParts(V, { kind: 'number', negative: 'red' })).toEqual({ text: '1,234,567.89', negative: false });
    expect(isNegativeMarked(formatNumber(V, { kind: 'number', negative: '-red' }))).toBe(false);
  });
  it('wraps units and prefix/suffix: (1.23M), -$1.23M, ($1.23M)', () => {
    expect(formatNumber(N, { kind: 'number', units: 'M', negative: '()' })).toBe('(1.23M)');
    expect(formatNumber(N, { kind: 'currency', units: 'M', negative: '-' })).toBe('-$1.23M');
    expect(formatNumber(N, { kind: 'currency', units: 'M', negative: '()' })).toBe('($1.23M)');
  });
});

describe('custom format strings (§7.3)', () => {
  it('two sections: negative uses the second on |v|', () => {
    expect(formatCustom(-V, '#,##0.00;(#,##0.00)')).toBe('(1,234,567.89)');
  });
  it('one section: negatives get a minus', () => {
    expect(formatCustom(-1.5, '0.00')).toBe('-1.50');
  });
  it('three sections: zero uses the third', () => {
    expect(formatCustom(0, '0.0;(0.0);"-"')).toBe('-');
    expect(formatCustom(2, '0.0;(0.0);"-"')).toBe('2.0');
  });
  it('# leaves insignificant digits blank, 0 pads', () => {
    expect(formatCustom(5, '#.##')).toBe('5');
    expect(formatCustom(5.1, '#.##')).toBe('5.1');
    expect(formatCustom(5, '000.00')).toBe('005.00');
    expect(formatCustom(0.5, '#.##')).toBe('.5');
  });
  it('scales by trailing commas and supports literals', () => {
    expect(formatCustom(2_500_000, '#,##0,,"M"')).toBe('3M');
    expect(formatCustom(12, '\\$0 "units"')).toBe('$12 units');
    expect(formatCustom(12, 'MW 0')).toBe('MW 12');
  });
  it('scientific sections', () => {
    expect(formatCustom(V, '0.00E+00')).toBe('1.23E+06');
    expect(formatCustom(0.00123, '0.0E-00')).toBe('1.2E-03');
    expect(formatCustom(V, '0E-00')).toBe('1E06');
  });
  it('percent multiplies by 100', () => {
    expect(formatCustom(0.5, '0%')).toBe('50%');
  });
});

describe('edge inputs', () => {
  it('NaN / Infinity render empty', () => {
    expect(formatNumber(NaN, { kind: 'number' })).toBe('');
    expect(formatNumber(Infinity, { kind: 'number' })).toBe('');
  });
  it('zero', () => {
    expect(formatNumber(0, { kind: 'number' })).toBe('0.00');
    expect(formatNumber(0, { kind: 'scientific' })).toBe('0.00E+00');
    expect(formatNumber(0, { kind: 'automatic' })).toBe('0');
  });
  it('a non-ISO currency string is a literal symbol', () => {
    expect(formatNumber(12, { kind: 'currency', currency: '€' })).toBe('€12.00');
  });
  it('an unknown locale falls back to en-US', () => {
    expect(formatNumber(V, { kind: 'number', locale: 'xx-INVALID-!!' })).toBe('1,234,567.89');
  });
  it('decimals are clamped to 0..15', () => {
    expect(formatNumber(1.5, { kind: 'number', decimals: -3 })).toBe('2');
    expect(formatNumber(1.5, { kind: 'number', decimals: 40 })).toBe('1.500000000000000');
  });
});
