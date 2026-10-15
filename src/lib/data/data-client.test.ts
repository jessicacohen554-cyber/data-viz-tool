import { describe, expect, it } from 'vitest';
import type { DatasetEntry, QueryPlan } from '../core/types';
import { fixtureBytes } from '../../../tests/fixtures/load';
import { createRouter } from '../../workers/data.worker';
import { createDataClient, type WorkerLike } from './data-client';
import type { WorkerReply, WorkerRequest } from './protocol';

/** In-process stand-in for the module worker: the router runs on this thread, replies arrive asynchronously. */
function fakeWorker(opts: { delayFor?: (req: WorkerRequest) => number } = {}): WorkerLike & { posted: WorkerRequest[]; terminated: boolean } {
  const w = {
    posted: [] as WorkerRequest[],
    terminated: false,
    onmessage: null as ((ev: { data: WorkerReply }) => void) | null,
    postMessage(msg: WorkerRequest) {
      w.posted.push(msg);
      const delay = opts.delayFor?.(msg) ?? 0;
      void route(msg); // replies are captured by `post` below and delivered after `delay`
      void delay;
    },
    terminate() { w.terminated = true; },
  };
  const route = createRouter((reply) => {
    const delay = opts.delayFor?.(w.posted.find((r) => r.id === reply.id)!) ?? 0;
    setTimeout(() => w.onmessage?.({ data: reply }), delay);
  });
  return w;
}

const entry: DatasetEntry = {
  id: 'sample', file: '', name: 'sample', bytes: 0, rows: 8, columns: [], sha1: '', modified: '', description: null, source: 'local',
};
const file = () => new File([fixtureBytes('sample.csv')], 'sample.csv');
const planOf = (field: string): QueryPlan => ({
  datasetId: 'sample', dims: [{ key: 'd', field }], measures: [{ key: 'm', field: 'price', aggregation: 'avg' }], filters: [], disaggregate: false, limit: 50_000,
});

describe('createDataClient', () => {
  it('loads, queries, profiles, slices rows, changes a type and unloads', async () => {
    const w = fakeWorker();
    const c = createDataClient(w);
    const progress: number[] = [];
    const loaded = await c.load(entry, file(), { onProgress: (p) => progress.push(p.loaded) });
    expect(loaded.rowCount).toBe(8);
    expect(loaded.meta.map((m) => m.name)).toContain('region');
    expect(progress.length).toBeGreaterThan(0);

    const res = await c.query(planOf('region'));
    expect(res.groups).toBe(4);
    expect(res.dims[0]!.labels).toEqual(['Houston', 'North', 'South', 'West']);

    const prof = await c.profile('fuel', 10);
    expect(prof.labels).toEqual(['Gas', 'Wind', 'Nuclear', 'Solar']); // by count desc, ties in dictionary order

    const rows = await c.rows(0, 2, ['region', 'mw'], []);
    expect(rows.total).toBe(8);
    expect(rows.columns[0]).toEqual(['West', 'West']);

    const meta = await c.setType('date_us', 'date', 'dd/MM/yyyy');
    expect(meta).not.toBe('needsReload');
    if (meta === 'needsReload') throw new Error();
    expect(meta.find((m) => m.name === 'date_us')).toMatchObject({ type: 'date', dateFormat: 'dd/MM/yyyy', parseErrors: 2 });

    await c.unload();
    await expect(c.query(planOf('region'))).rejects.toMatchObject({ name: 'DataError', code: 'bad-request' });
  });

  it('serves repeated plans from the LRU without a worker round-trip', async () => {
    const w = fakeWorker();
    const c = createDataClient(w);
    await c.load(entry, file());
    const before = w.posted.length;
    const a = await c.query(planOf('region'));
    const b = await c.query({ ...planOf('region'), dims: [{ key: 'other-id', field: 'region' }] });
    expect(b).toBe(a); // same queryKey → same cached object
    expect(w.posted.length).toBe(before + 1);
    for (let i = 0; i < 20; i++) await c.query({ ...planOf('region'), limit: 100 + i });
    await c.query(planOf('region'));
    expect(w.posted.length).toBe(before + 1 + 20 + 1); // evicted after 16 others
  });

  it('rejects a superseded query with { stale: true } and resolves the latest', async () => {
    const w = fakeWorker({ delayFor: (req) => (req.type === 'query' && req.plan.dims[0]?.field === 'region' ? 30 : 0) });
    const c = createDataClient(w);
    await c.load(entry, file());
    const slow = c.query(planOf('region'));
    const fast = c.query(planOf('fuel'));
    await expect(slow).rejects.toEqual({ stale: true, id: 2 });
    const r = await fast;
    expect(r.dims[0]!.labels).toEqual(['Gas', 'Nuclear', 'Solar', 'Wind']);
    // The stale answer was still cached: asking again is instant.
    const n = w.posted.length;
    expect((await c.query(planOf('region'))).groups).toBe(4);
    expect(w.posted.length).toBe(n);
  });

  it('surfaces worker errors as DataError and terminate rejects what is pending', async () => {
    const w = fakeWorker({ delayFor: () => 20 });
    const c = createDataClient(w);
    await expect(c.query(planOf('region'))).rejects.toMatchObject({ code: 'bad-request' });
    const pending = c.query(planOf('region'));
    c.terminate();
    expect(w.terminated).toBe(true);
    await expect(pending).rejects.toMatchObject({ message: 'client terminated' });
    await expect(c.profile('x')).rejects.toMatchObject({ message: 'client terminated' });
  });
});
