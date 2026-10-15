/**
 * A counting, controllable `DataClient` fake shared by the S5 store tests.
 * Every call is recorded; `query` promises can be left pending and settled by
 * hand to exercise the stale-result drop. The suite at the bottom checks the
 * fake itself so the file is a valid Vitest module.
 */
import { describe, expect, it } from 'vitest';
import type { DataType, DatasetEntry, FieldMeta, FieldProfile, FilterSpec, QueryPlan, QueryResult } from '../core/types';
import type { DataClient, LoadOptions, LoadedDataset } from '../data/data-client';
import { meta } from '../core/spec-defaults.test';

/** One query call with its settle handles. */
export interface PendingQuery {
  plan: QueryPlan;
  resolve: (r: QueryResult) => void;
  reject: (e: unknown) => void;
}

export interface FakeClient extends DataClient {
  loads: Array<{ entry: DatasetEntry; source: string | File; opts: LoadOptions | undefined }>;
  queries: PendingQuery[];
  setTypes: Array<{ field: string; type: DataType; dateFormat: string | undefined }>;
  /** Fields the next `load` reports. */
  fields: FieldMeta[];
  /** When set, `load` rejects with this message. */
  failLoad: string | null;
  /** When set, `setType` answers this instead of the fields. */
  setTypeReply: 'needsReload' | null;
  /** Resolve the i-th query (default: the latest) with a result keyed to its plan. */
  settle(i?: number, groups?: number): QueryResult;
}

/** A result shaped like the worker's for `plan`. */
export function resultFor(plan: QueryPlan, groups = 2): QueryResult {
  return {
    key: JSON.stringify(plan),
    groups,
    dims: plan.dims.map((d) => ({ key: d.key, kind: 'codes' as const, codes: new Int32Array(groups).map((_, i) => i), labels: Array.from({ length: groups }, (_, i) => `v${i}`) })),
    measures: plan.measures.map((m) => ({ key: m.key, values: new Float64Array(groups).map((_, i) => i * 10) })),
    scannedRows: 10,
    filteredRows: 10,
    truncated: false,
    elapsedMs: 1,
  };
}

/** The default fields of the fake dataset: zone (string), price (number), ts (datetime). */
export function fakeFields(): FieldMeta[] {
  return [meta('zone', 'string'), meta('price', 'number'), meta('ts', 'datetime')];
}

/** A catalog entry for tests. */
export function entryOf(id = 'ds'): DatasetEntry {
  return { id, file: `data/datasets/${id}.csv`, name: id, bytes: 100, rows: 10, columns: ['zone', 'price', 'ts'], sha1: 'abc', modified: '2026-01-01T00:00:00Z', description: null, source: 'catalog' };
}

export function createFakeClient(): FakeClient {
  const fake: FakeClient = {
    loads: [],
    queries: [],
    setTypes: [],
    fields: fakeFields(),
    failLoad: null,
    setTypeReply: null,
    async load(entry, source, opts) {
      fake.loads.push({ entry, source, opts });
      opts?.onProgress?.({ phase: 'download', loaded: 50, total: 100, rows: 0 });
      opts?.onProgress?.({ phase: 'build', loaded: 100, total: 100, rows: 10 });
      if (fake.failLoad) throw new Error(fake.failLoad);
      const loaded: LoadedDataset = { meta: fake.fields, rowCount: 10, elapsedMs: 1, warnings: [] };
      return loaded;
    },
    query(plan) {
      return new Promise<QueryResult>((resolve, reject) => { fake.queries.push({ plan, resolve, reject }); });
    },
    async profile(field): Promise<FieldProfile> {
      return { field, labels: ['a', 'b'], counts: new Int32Array([3, 2]), min: null, max: null, nullCount: 0, truncated: false };
    },
    async rows(_offset: number, _limit: number, fields: string[], _filters: FilterSpec[]) {
      return { fields, columns: fields.map(() => [] as string[]), total: 0 };
    },
    async setType(field, type, dateFormat) {
      fake.setTypes.push({ field, type, dateFormat });
      if (fake.setTypeReply) return fake.setTypeReply;
      return fake.fields.map((m) => (m.name === field ? { ...m, type } : m));
    },
    async unload() { /* nothing loaded */ },
    terminate() { /* no worker */ },
    settle(i = fake.queries.length - 1, groups = 2) {
      const q = fake.queries[i];
      if (!q) throw new Error(`no query #${i}`);
      const r = resultFor(q.plan, groups);
      q.resolve(r);
      return r;
    },
  };
  return fake;
}

/** In-memory `KeyValueStore` with the `length`/`key` enumeration of the DOM `Storage`. */
export function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    dump: () => Object.fromEntries(m),
  };
}

/** Let pending promise callbacks run. */
export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('fake data client', () => {
  it('records calls and settles queries by hand', async () => {
    const c = createFakeClient();
    const p = c.query({ datasetId: 'ds', dims: [{ key: 'a', field: 'zone' }], measures: [{ key: 'b', field: 'price', aggregation: 'sum' }], filters: [], disaggregate: false, limit: 10 });
    expect(c.queries).toHaveLength(1);
    const r = c.settle(0, 3);
    expect(await p).toBe(r);
    expect(r.groups).toBe(3);
    expect(r.dims[0]?.labels).toEqual(['v0', 'v1', 'v2']);
    expect(Array.from(r.measures[0]!.values)).toEqual([0, 10, 20]);
  });
});
