import { describe, expect, it } from 'vitest';
import { csvCell, csvOf, dataUrlToBlob, fileStem, jsonOf, parseSpecJson, pillLabel } from './export';
import { createDefaultSpec, newPill } from '../core/spec-defaults';
import { meta } from '../core/spec-defaults.test';
import type { QueryResult, VizSpec } from '../core/types';

function fixture(): { spec: VizSpec; result: QueryResult } {
  const spec = createDefaultSpec('ds');
  const zone = newPill(meta('zone', 'string'), 'columns');
  const price = newPill(meta('price', 'number'), 'rows');
  price.aggregation = 'avg';
  const ts = newPill(meta('ts', 'datetime'), 'columns');
  ts.date = { level: 'month', mode: 'trunc' };
  ts.continuity = 'continuous';
  spec.shelves.columns = [zone, ts];
  spec.shelves.rows = [price];
  const result: QueryResult = {
    key: 'k',
    groups: 3,
    dims: [
      { key: zone.id, kind: 'codes', codes: new Int32Array([0, 1, -1]), labels: ['West, TX', 'Says "hi"'] },
      { key: ts.id, kind: 'values', values: new Float64Array([1704067200000, 1706745600000, NaN]) },
    ],
    measures: [{ key: price.id, values: new Float64Array([25.5, NaN, -3]) }],
    scannedRows: 3,
    filteredRows: 3,
    truncated: false,
    elapsedMs: 1,
  };
  return { spec, result };
}

describe('CSV export', () => {
  it('writes headers from the pills and quotes cells per RFC 4180; null groups are empty', () => {
    const { spec, result } = fixture();
    const csv = csvOf(result, spec, [meta('zone', 'string'), meta('price', 'number'), meta('ts', 'datetime')]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('zone,MONTH(ts),AVG(price)');
    expect(lines[1]).toBe('"West, TX",1704067200000,25.5');
    expect(lines[2]).toBe('"Says ""hi""",1706745600000,');
    expect(lines[3]).toBe(',,-3');
    expect(lines[4]).toBe('');
    expect(lines).toHaveLength(5);
  });

  it('uses an alias when set and falls back to the key for an unknown pill', () => {
    const { spec, result } = fixture();
    spec.shelves.rows[0]!.alias = 'Price ($/MWh)';
    result.dims[1]!.key = 'orphan';
    const csv = csvOf(result, spec, []);
    expect(csv.split('\r\n')[0]).toBe('zone,orphan,Price ($/MWh)');
  });

  it('csvCell quotes only when needed', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell('')).toBe('');
  });

  it('pill labels follow Tableau captions', () => {
    const d = newPill(meta('zone', 'string'), 'columns');
    const m = newPill(meta('price', 'number'), 'rows');
    const t = newPill(meta('ts', 'date'), 'columns');
    const b = newPill(meta('price', 'number'), 'columns');
    b.bin = { size: 10 };
    const none = newPill(meta('price', 'number'), 'rows');
    none.aggregation = 'none';
    expect(pillLabel(d)).toBe('zone');
    expect(pillLabel(m)).toBe('SUM(price)');
    expect(pillLabel(t)).toBe('YEAR(ts)');
    expect(pillLabel(b)).toBe('price (bin)');
    expect(pillLabel(none)).toBe('price');
  });
});

describe('JSON export and import', () => {
  it('round-trips a spec', () => {
    const { spec } = fixture();
    expect(parseSpecJson(jsonOf(spec))).toEqual(spec);
    expect(jsonOf(spec).endsWith('\n')).toBe(true);
  });

  it('rejects malformed JSON and invalid specs with the problems named', () => {
    expect(() => parseSpecJson('{nope')).toThrow('Not valid JSON');
    expect(() => parseSpecJson('{"version":1}')).toThrow(/Not a valid view: .*missing datasetId/);
    expect(() => parseSpecJson('[]')).toThrow(/spec is not an object/);
  });

  it('with the loaded fields, every pill must name a known field', () => {
    const { spec } = fixture();
    const text = jsonOf(spec);
    expect(parseSpecJson(text, [meta('zone', 'string'), meta('price', 'number'), meta('ts', 'datetime')])).toEqual(spec);
    expect(() => parseSpecJson(text, [meta('zone', 'string')])).toThrow(/unknown field "price"/);
  });
});

describe('file helpers', () => {
  it('derives a safe file stem', () => {
    const s = createDefaultSpec('ercot-2024');
    expect(fileStem(s)).toBe('ercot-2024');
    s.title = 'Avg price / zone: 2024?';
    expect(fileStem(s)).toBe('Avg-price-zone-2024');
    expect(fileStem(createDefaultSpec(''))).toBe('viz');
  });

  it('decodes a base64 data URL into a typed blob', async () => {
    const blob = dataUrlToBlob('data:image/png;base64,' + btoa('\x89PNG'));
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(4);
    const text = dataUrlToBlob('data:text/plain,hi%20there');
    expect(await text.text()).toBe('hi there');
  });
});
