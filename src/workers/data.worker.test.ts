import { describe, expect, it } from 'vitest';
import type { DatasetEntry } from '../lib/core/types';
import { fixtureBytes } from '../../tests/fixtures/load';
import type { LoadRequest, WorkerReply, WorkerRequest } from '../lib/data/protocol';
import { createRouter } from './data.worker';

const entry: DatasetEntry = {
  id: 'sample', file: '', name: 'sample', bytes: 0, rows: 8, columns: [], sha1: '', modified: '', description: null, source: 'local',
};

function harness() {
  const replies: Array<{ reply: WorkerReply; transfer: ArrayBuffer[] }> = [];
  const route = createRouter((reply, transfer) => replies.push({ reply, transfer }));
  const send = async (req: WorkerRequest) => { await route(req); return replies.filter((r) => r.reply.id === req.id).map((r) => r.reply); };
  return { route, send, replies };
}

const load = (id: number, keepRaw = true, source: LoadRequest['source'] = new File([fixtureBytes('sample.csv')], 's.csv')): LoadRequest =>
  ({ id, type: 'load', entry, source, typeOverrides: {}, keepRaw, maxRows: 1_000_000 });

describe('data worker router', () => {
  it('load → loaded with metadata, progress first', async () => {
    const h = harness();
    const r = await h.send(load(1));
    expect(r.at(-1)!.type).toBe('loaded');
    const loaded = r.at(-1)!;
    if (loaded.type !== 'loaded') throw new Error();
    expect(loaded.rowCount).toBe(8);
    expect(loaded.meta.map((m) => m.type)).toEqual(['integer', 'string', 'string', 'datetime', 'string', 'number', 'integer', 'boolean', 'string']);
    expect(r.filter((x) => x.type === 'progress').length).toBeGreaterThan(0);
  });

  it('query/profile/rows answer with transferable buffers', async () => {
    const h = harness();
    await h.send(load(1));
    const [q] = await h.send({ id: 2, type: 'query', plan: { datasetId: 's', dims: [{ key: 'd', field: 'region' }], measures: [{ key: 'm', field: 'mw', aggregation: 'sum' }], filters: [], disaggregate: false, limit: 100 } });
    if (q!.type !== 'result') throw new Error(q!.type);
    expect(q.result.groups).toBe(4);
    expect(Array.from(q.result.measures[0]!.values)).toEqual([2600, 1500, 3150, 2050]);
    const sent = h.replies.find((r) => r.reply.id === 2)!;
    expect(sent.transfer).toContain(q.result.measures[0]!.values.buffer);
    expect(sent.transfer).toContain(q.result.dims[0]!.codes!.buffer);

    const [p] = await h.send({ id: 3, type: 'profile', field: 'region', limit: 10 });
    if (p!.type !== 'profile') throw new Error();
    expect(h.replies.find((r) => r.reply.id === 3)!.transfer).toContain(p.profile.counts.buffer);

    const [rows] = await h.send({ id: 4, type: 'rows', offset: 0, limit: 3, fields: ['id', 'region'], filters: [] });
    if (rows!.type !== 'rows') throw new Error();
    expect(rows.total).toBe(8);
    expect(Array.from(rows.columns[0] as Float64Array)).toEqual([1, 2, 3]);
    expect(h.replies.find((r) => r.reply.id === 4)!.transfer).toHaveLength(1);
  });

  it('bands buffers are transferred alongside the v1 arrays', async () => {
    const h = harness();
    await h.send(load(1));
    const [q] = await h.send({ id: 2, type: 'query', plan: { datasetId: 's', dims: [{ key: 'd', field: 'region' }], measures: [{ key: 'm', field: 'mw', aggregation: 'avg' }], filters: [], disaggregate: false, limit: 100, bands: { measureKey: 'm', levels: [25, 75] } } });
    if (q!.type !== 'result') throw new Error(q!.type);
    expect(q.result.bands).toHaveLength(2);
    const sent = h.replies.find((r) => r.reply.id === 2)!;
    for (const b of q.result.bands!) expect(sent.transfer).toContain(b.buffer);
    expect(sent.transfer).toContain(q.result.measures[0]!.values.buffer);
    expect(new Set(sent.transfer).size).toBe(sent.transfer.length);
  });

  it('load reports geo roles; setType re-infers them unless the load override pinned one', async () => {
    const h = harness();
    const r = await h.send(load(1));
    const loaded = r.at(-1)!;
    if (loaded.type !== 'loaded') throw new Error();
    const role = (name: string, meta = loaded.meta) => meta.find((f) => f.name === name)!.geoRole;
    expect(role('region')).toBe('ercot-zone'); // West / North / Houston / South
    expect(role('fuel')).toBeNull();
    expect(role('mw')).toBeNull();
    const [m] = await h.send({ id: 2, type: 'setType', field: 'mw', dataType: 'string' });
    if (m!.type !== 'meta') throw new Error();
    expect(role('mw', m.meta)).toBeNull();
    const [m2] = await h.send({ id: 3, type: 'setType', field: 'region', dataType: 'string' });
    if (m2!.type !== 'meta') throw new Error();
    expect(role('region', m2.meta)).toBe('ercot-zone');

    const h2 = harness();
    const r2 = await h2.send({ ...load(1), typeOverrides: { region: { geoRole: null }, fuel: { geoRole: 'country' } } as LoadRequest['typeOverrides'] });
    const l2 = r2.at(-1)!;
    if (l2.type !== 'loaded') throw new Error();
    expect(role('region', l2.meta)).toBeNull();
    expect(role('fuel', l2.meta)).toBe('country');
    const [m3] = await h2.send({ id: 2, type: 'setType', field: 'region', dataType: 'string' });
    if (m3!.type !== 'meta') throw new Error();
    expect(role('region', m3.meta)).toBeNull();
  });

  it('errors carry a code; requests before a load are bad-request', async () => {
    const h = harness();
    const [e] = await h.send({ id: 1, type: 'profile', field: 'x', limit: 1 });
    expect(e).toMatchObject({ type: 'error', code: 'bad-request' });
    await h.send(load(2));
    const [e2] = await h.send({ id: 3, type: 'query', plan: { datasetId: 's', dims: [{ key: 'd', field: 'ghost' }], measures: [], filters: [], disaggregate: false, limit: 1 } });
    expect(e2).toMatchObject({ type: 'error', code: 'bad-request', message: expect.stringMatching(/unknown field/) });
    const [e3] = await h.send(load(4, true, new File([new TextEncoder().encode('')], 'empty.csv')));
    expect(e3).toMatchObject({ type: 'error', code: 'parse' });
  });

  it('setType re-parses from raw bytes, or asks for a reload when they were dropped', async () => {
    const h = harness();
    await h.send(load(1, true));
    const [m] = await h.send({ id: 2, type: 'setType', field: 'date_us', dataType: 'date' });
    if (m!.type !== 'meta') throw new Error(m!.type);
    expect(m.meta.find((f) => f.name === 'date_us')).toMatchObject({ type: 'date', dateFormat: 'MM/dd/yyyy', parseErrors: 1 });
    const [m2] = await h.send({ id: 3, type: 'setType', field: 'mw', dataType: 'string' });
    if (m2!.type !== 'meta') throw new Error();
    expect(m2.meta.find((f) => f.name === 'mw')).toMatchObject({ type: 'string', storage: 'dict', role: 'dimension', cardinality: 8 });
    const [q] = await h.send({ id: 4, type: 'query', plan: { datasetId: 's', dims: [{ key: 'd', field: 'date_us', date: { level: 'month', mode: 'part' } }], measures: [{ key: 'c', field: 'id', aggregation: 'count' }], filters: [], disaggregate: false, limit: 100 } });
    if (q!.type !== 'result') throw new Error();
    expect(q.result.dims[0]!.labels).toEqual(['Jan', 'Feb', 'Mar', 'Dec', 'Null']);

    const h2 = harness();
    await h2.send(load(1, false));
    const [n] = await h2.send({ id: 2, type: 'setType', field: 'date_us', dataType: 'date' });
    expect(n).toEqual({ id: 2, type: 'needsReload' });
  });

  it('cancel aborts an in-flight load: cancelled is answered, loaded never arrives', async () => {
    const h = harness();
    const bytes = fixtureBytes('sample.csv');
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const stream = new ReadableStream<Uint8Array>({
      async pull(ctl) {
        ctl.enqueue(bytes.subarray(0, 40));
        await gate;
        ctl.enqueue(bytes.subarray(40));
        ctl.close();
      },
    });
    const loading = h.route(load(1, true, stream as unknown as File));
    await new Promise((r) => setTimeout(r, 5));
    await h.route({ id: 2, type: 'cancel', targetId: 1 });
    release();
    await loading;
    expect(h.replies.map((r) => r.reply.type)).not.toContain('loaded');
    expect(h.replies.some((r) => r.reply.type === 'cancelled' && r.reply.targetId === 1)).toBe(true);
    const [e] = await h.send({ id: 3, type: 'profile', field: 'region', limit: 1 });
    expect(e).toMatchObject({ type: 'error', code: 'bad-request' });
  });

  it('unload drops the store', async () => {
    const h = harness();
    await h.send(load(1));
    const [u] = await h.send({ id: 2, type: 'unload' });
    expect(u).toEqual({ id: 2, type: 'unloaded' });
    const [e] = await h.send({ id: 3, type: 'rows', offset: 0, limit: 1, fields: [], filters: [] });
    expect(e).toMatchObject({ type: 'error', code: 'bad-request' });
  });
});
