import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inferAll, inferType, isNullToken, uniqueHeader } from './type-inference';

describe('isNullToken', () => {
  it('recognises the §1.2 null tokens case-insensitively after trimming', () => {
    for (const t of ['', 'NULL', 'null', 'NA', 'n/a', 'N/A', 'NaN', '#N/A', '  ', ' null ']) expect(isNullToken(t), t).toBe(true);
    for (const t of ['0', 'none', 'nan1', 'Null value', 'N', 'x']) expect(isNullToken(t), t).toBe(false);
  });
});

describe('inferType', () => {
  it('boolean only when every value is a boolean word; 0/1 stay numeric', () => {
    expect(inferType(['true', 'FALSE', 'yes', 'n', 'T', 'f', 'Y', 'no']).type).toBe('boolean');
    expect(inferType(['0', '1', '1']).type).toBe('integer');
    expect(inferType(['true', '1']).type).toBe('string');
  });

  it('integer needs a signed digit run inside ±2^31; otherwise number', () => {
    expect(inferType(['1', '-2', '+3', '2147483647'])).toMatchObject({ type: 'integer', storage: 'i32' });
    expect(inferType(['1', '2147483648'])).toMatchObject({ type: 'number', storage: 'f64' });
    expect(inferType(['1.5', '2', '.5', '4e2', '-1E-3'])).toMatchObject({ type: 'number', storage: 'f64' });
    expect(inferType(['1,234']).type).toBe('string');
    expect(inferType(['$5']).type).toBe('string');
    expect(inferType(['5%']).type).toBe('string');
  });

  it('dates: ISO first, datetime when a time part exists, ambiguity flagged', () => {
    expect(inferType(['2024-02-05', '2019-12-31'])).toMatchObject({ type: 'date', storage: 'date', dateFormat: 'yyyy-MM-dd', dateAmbiguous: false });
    expect(inferType(['2024-02-05T14:07'])).toMatchObject({ type: 'datetime', dateFormat: "yyyy-MM-dd'T'HH:mm" });
    expect(inferType(['01/02/2024', '03/04/2024'])).toMatchObject({ type: 'date', dateFormat: 'MM/dd/yyyy', dateAmbiguous: true });
    expect(inferType(['13/01/2024', '02/29/2024']).type).toBe('string');
  });

  it('strips null tokens before deciding and reports counts', () => {
    const r = inferType(['NULL', '1', '', '2', 'NA']);
    expect(r).toMatchObject({ type: 'integer', nulls: 3, sampled: 2, confidence: 1 });
    expect(inferType(['', 'NULL'])).toMatchObject({ type: 'string', confidence: 0, nulls: 2, sampled: 0 });
    expect(inferType([' 5 ', '6']).type).toBe('integer');
  });
});

describe('uniqueHeader', () => {
  it('suffixes duplicates and names blank headers', () => {
    expect(uniqueHeader(['a', 'b', 'a', 'a', ''])).toEqual(['a', 'b', 'a (2)', 'a (3)', 'Column 5']);
    expect(uniqueHeader(['a', 'a (2)', 'a'])).toEqual(['a', 'a (2)', 'a (3)']);
  });
});

describe('inferAll on tests/fixtures/types.csv', () => {
  const text = readFileSync(join(__dirname, '../../../tests/fixtures/types.csv'), 'utf8');
  const lines = text.trim().split('\n');
  const header = lines[0]!.split(',');
  const rows = lines.slice(1).map((l) => l.split(','));
  const metas = inferAll(header, rows);
  const by = Object.fromEntries(metas.map((m) => [m.name, m]));

  it('infers every column as the fixture intends', () => {
    expect(by.bool_tf).toMatchObject({ type: 'boolean', storage: 'bool', role: 'dimension', defaultAggregation: 'count' });
    expect(by.bool_yn!.type).toBe('boolean');
    expect(by.int_small).toMatchObject({ type: 'integer', storage: 'i32', role: 'measure', defaultContinuity: 'continuous', defaultAggregation: 'sum' });
    expect(by.int_big).toMatchObject({ type: 'number', storage: 'f64' });
    expect(by.num!.type).toBe('number');
    expect(by.iso_dt).toMatchObject({ type: 'datetime', dateFormat: "yyyy-MM-dd'T'HH:mm:ss.SSS", role: 'dimension', defaultContinuity: 'discrete' });
    expect(by.iso_z).toMatchObject({ type: 'datetime', dateFormat: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" });
    expect(by.date_only).toMatchObject({ type: 'date', dateFormat: 'yyyy-MM-dd' });
    expect(by.us_md).toMatchObject({ type: 'date', dateFormat: 'MM/dd/yyyy', dateAmbiguous: false });
    expect(by.us_dm).toMatchObject({ type: 'date', dateFormat: 'dd/MM/yyyy', dateAmbiguous: false });
    expect(by.us_amb).toMatchObject({ type: 'date', dateFormat: 'MM/dd/yyyy', dateAmbiguous: true });
    expect(by.month_name).toMatchObject({ type: 'date', dateFormat: 'dd-MMM-yyyy' });
    expect(by.str_mixed).toMatchObject({ type: 'string', storage: 'dict', nullCount: 1 });
    expect(by.nulls_only).toMatchObject({ type: 'string', nullCount: 6, confidence: 0 });
    expect(by.int_with_null).toMatchObject({ type: 'integer', nullCount: 2 });
    expect(by.yyyymm).toMatchObject({ type: 'date', dateFormat: 'yyyy-MM' });
    expect(by.time_only).toMatchObject({ type: 'datetime', dateFormat: 'HH:mm:ss' });
  });

  it('dedupes header names and numbers columns by position', () => {
    expect(metas.map((m) => m.name).slice(-2)).toEqual(['dup', 'dup (2)']);
    metas.forEach((m, i) => expect(m.index).toBe(i));
  });
});
