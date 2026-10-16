import { describe, expect, it } from 'vitest';
import type { LoadProgress } from '../core/types';
import { fixtureBytes, loadFixture, loadTable } from '../../../tests/fixtures/load';
import { AbortError, loadCsv, reparseColumn } from './csv-loader';
import { F64Builder, DateBuilder } from './column-store';
import { compileParser } from './date-parse';

const T0 = Date.UTC(2024, 0, 1);

describe('loadCsv on tests/fixtures/sample.csv', () => {
  it('parses quoted commas, escaped quotes and multi-line cells into typed columns', async () => {
    const { store, warnings } = await loadFixture('sample.csv');
    expect(store.rowCount).toBe(8);
    const by = Object.fromEntries(store.fields.map((f) => [f.name, f]));
    expect(by.id).toMatchObject({ type: 'integer', storage: 'i32', min: 1, max: 8, cardinality: 8 });
    expect(by.region).toMatchObject({ type: 'string', cardinality: 4, nullCount: 0 });
    expect(by.timestamp).toMatchObject({ type: 'datetime', dateFormat: "yyyy-MM-dd'T'HH:mm", min: T0, max: Date.UTC(2024, 11, 31, 23) });
    expect(by.date_us).toMatchObject({ type: 'string' }); // 13/01 and 02/29 conflict → string
    expect(by.price).toMatchObject({ type: 'number', storage: 'f64', nullCount: 1, min: -3.25, max: 99.9 });
    expect(by.mw).toMatchObject({ type: 'integer', min: 0, max: 2000 });
    expect(by.is_peak).toMatchObject({ type: 'boolean', storage: 'bool' });
    expect(by.note).toMatchObject({ type: 'string', nullCount: 1 });
    const note = store.column('note');
    if (note.storage !== 'dict') throw new Error();
    expect(note.dict).toContain('has, comma');
    expect(note.dict).toContain('has "quotes"');
    expect(note.dict).toContain('multi\nline');
    expect(by.region!.topValues).toEqual([['Houston', 2], ['North', 2], ['South', 2], ['West', 2]]);
    expect(warnings).toEqual([]);
  });

  it('gives the same store whatever the chunk boundaries', async () => {
    const ref = await loadFixture('sample.csv');
    for (const chunk of [1, 3, 7, 16, 64]) {
      const { store } = await loadFixture('sample.csv', { chunkBytes: chunk });
      expect(store.rowCount).toBe(8);
      store.fields.forEach((f, i) => {
        expect(f.type, `${f.name}@${chunk}`).toBe(ref.store.fields[i]!.type);
        expect(f.nullCount).toBe(ref.store.fields[i]!.nullCount);
      });
      const a = store.column('note'), b = ref.store.column('note');
      if (a.storage !== 'dict' || b.storage !== 'dict') throw new Error();
      expect(Array.from(a.codes)).toEqual(Array.from(b.codes));
      expect(Array.from(store.numericView('price'))).toEqual(Array.from(ref.store.numericView('price')));
    }
  });

  it('accepts Blob and ReadableStream sources', async () => {
    const bytes = fixtureBytes('sample.csv');
    const fromBlob = await loadCsv(new Blob([bytes]));
    expect(fromBlob.store.rowCount).toBe(8);
    const fromStream = await loadCsv(new Blob([bytes]).stream());
    expect(fromStream.store.rowCount).toBe(8);
    expect(fromStream.store.fields.map((f) => f.type)).toEqual(fromBlob.store.fields.map((f) => f.type));
  });

  it('reports byte progress and a final build phase', async () => {
    const events: LoadProgress[] = [];
    await loadFixture('sample.csv', { chunkBytes: 50, onProgress: (p) => events.push(p) });
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]!.phase).toBe('parse');
    expect(events.at(-1)).toMatchObject({ phase: 'build', loaded: fixtureBytes('sample.csv').byteLength, total: fixtureBytes('sample.csv').byteLength, rows: 8 });
  });

  it('caps rows with maxRows and warns', async () => {
    const { store, warnings } = await loadFixture('sample.csv', { maxRows: 3, chunkBytes: 20 });
    expect(store.rowCount).toBe(3);
    expect(warnings.some((w) => /row cap/.test(w))).toBe(true);
    expect(Array.from(store.numericView('id'))).toEqual([1, 2, 3]);
  });

  it('aborts on a signal', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(loadFixture('sample.csv', { signal: ctl.signal })).rejects.toBeInstanceOf(AbortError);
    const ctl2 = new AbortController();
    const p = loadFixture('sample.csv', { chunkBytes: 5, signal: ctl2.signal, onProgress: () => ctl2.abort() });
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('applies type and role overrides before building', async () => {
    const { store, warnings } = await loadFixture('sample.csv', {
      typeOverrides: {
        date_us: { type: 'date', dateFormat: 'dd/MM/yyyy' },
        mw: { role: 'dimension' },
        id: { type: 'string' },
      },
    });
    const by = Object.fromEntries(store.fields.map((f) => [f.name, f]));
    expect(by.date_us).toMatchObject({ type: 'date', storage: 'date', dateFormat: 'dd/MM/yyyy', parseErrors: 2, nullCount: 2, dateAmbiguous: false });
    expect(store.numericView('date_us')[0]).toBe(Date.UTC(2024, 1, 1)); // 01/02 read as d/M
    expect(by.mw).toMatchObject({ type: 'integer', role: 'dimension', defaultContinuity: 'discrete', defaultAggregation: 'count' });
    expect(by.id).toMatchObject({ type: 'string', storage: 'dict', role: 'dimension' });
    expect(warnings.some((w) => /date_us: 2 value/.test(w))).toBe(true);
  });

  it('infers geo roles and honours typeOverrides[field].geoRole (null clears, a type change re-infers)', async () => {
    const header = ['zone', 'state', 'lat', 'code'];
    const rows = [['Houston', 'TX', '29.76', '48201'], ['West', 'Texas', '31.9', '48453'], ['North', 'OK', '32.8', '01001']];
    const plain = (await loadTable(header, rows)).store;
    expect(plain.fields.map((f) => f.geoRole)).toEqual(['ercot-zone', 'us-state', 'latitude', null]);

    const over = (await loadTable(header, rows, { typeOverrides: { zone: { geoRole: null }, state: { geoRole: 'country' }, code: { type: 'string', geoRole: 'us-county' } } })).store;
    expect(over.fields.map((f) => f.geoRole)).toEqual([null, 'country', 'latitude', 'us-county']);
    expect(over.meta('code').type).toBe('string');

    // A type override alone re-infers for the new type: lat as a string is no coordinate.
    const retyped = (await loadTable(header, rows, { typeOverrides: { lat: { type: 'string' } } })).store;
    expect(retyped.meta('lat').geoRole).toBeNull();
    expect(retyped.meta('zone').geoRole).toBe('ercot-zone');
  });

  it('detects the format for a date override without one', async () => {
    const { store } = await loadTable(['d'], [['01/15/2024'], ['02/05/2024'], ['x']], { typeOverrides: { d: { type: 'date' } } });
    expect(store.meta('d')).toMatchObject({ type: 'date', dateFormat: 'MM/dd/yyyy', parseErrors: 1 });
  });

  it('keeps raw bytes and re-parses one column identically', async () => {
    const { store, raw } = await loadFixture('sample.csv', { keepRaw: true, chunkBytes: 11 });
    expect(raw).not.toBeNull();
    const rebuilt = reparseColumn(raw!, store.indexOf('price'), new F64Builder());
    if (rebuilt.column.storage !== 'f64') throw new Error();
    expect(Array.from(rebuilt.column.values)).toEqual(Array.from(store.numericView('price')));
    const asDate = reparseColumn(raw!, store.indexOf('date_us'), new DateBuilder(compileParser('MM/dd/yyyy')));
    expect(asDate.parseErrors).toBe(1); // 13/01/2024
    const capped = reparseColumn(raw!, store.indexOf('id'), new F64Builder(), 2);
    if (capped.column.storage !== 'f64') throw new Error();
    expect(Array.from(capped.column.values)).toEqual([1, 2]);
  });
});

describe('loadCsv edge cases', () => {
  it('pads short rows, ignores extra cells, dedupes headers, strips a BOM', async () => {
    const text = '﻿a,b,a\n1,x\n2,y,z,extra\n\n3,w,v\n';
    const { store, warnings } = await loadCsv(new TextEncoder().encode(text));
    expect(store.fields.map((f) => f.name)).toEqual(['a', 'b', 'a (2)']);
    expect(store.rowCount).toBe(3);
    expect(store.meta('a (2)').nullCount).toBe(1);
    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/1 row\(s\) had fewer/), expect.stringMatching(/1 row\(s\) had more/)]));
  });

  it('handles CRLF, tab delimiters and a header-only file', async () => {
    const crlf = await loadCsv(new TextEncoder().encode('a,b\r\n1,2\r\n3,4\r\n'));
    expect(crlf.store.rowCount).toBe(2);
    expect(Array.from(crlf.store.numericView('b'))).toEqual([2, 4]);
    const tsv = await loadCsv(new TextEncoder().encode('a\tb\n1\tx\n'));
    expect(tsv.store.fields.map((f) => f.name)).toEqual(['a', 'b']);
    const headerOnly = await loadCsv(new TextEncoder().encode('a,b\n'));
    expect(headerOnly.store.rowCount).toBe(0);
    expect(headerOnly.store.fields).toHaveLength(2);
    await expect(loadCsv(new Uint8Array(0))).rejects.toThrow(/empty file/);
  });

  it('promotes an integer column that turns decimal after the sample and reports it as number', async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => [String(i)]);
    rows.push(['0.5']);
    const { store } = await loadTable(['v'], rows);
    expect(store.meta('v')).toMatchObject({ type: 'number', storage: 'f64', rowCount: 5002, max: 5000 });
  });
});
