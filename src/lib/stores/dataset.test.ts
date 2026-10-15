import { describe, expect, it, vi } from 'vitest';
import { createDatasetStore, localDatasetId, localEntry } from './dataset.svelte';
import { createSpecStore } from './spec.svelte';
import { createDefaultSpec, newPill } from '../core/spec-defaults';
import { STORAGE_RECENT } from '../core/constants';
import { meta } from '../core/spec-defaults.test';
import { createFakeClient, entryOf, memStorage, tick } from './fake-client.test';

function setup() {
  const client = createFakeClient();
  const spec = createSpecStore();
  const storage = memStorage();
  const store = createDatasetStore({ client, spec, storage, isMobile: () => false });
  return { client, spec, storage, store };
}

describe('dataset store', () => {
  it('loads a catalog entry: progress surfaces, meta populates, spec becomes a default for the dataset', async () => {
    const { client, spec, store } = setup();
    const p = store.load(entryOf('ercot'), 'http://x/data/datasets/ercot.csv');
    expect(store.loading).toBe(true);
    await p;
    expect(client.loads).toHaveLength(1);
    expect(client.loads[0]?.source).toBe('http://x/data/datasets/ercot.csv');
    expect(store.meta.map((m) => m.name)).toEqual(['zone', 'price', 'ts']);
    expect(store.rowCount).toBe(10);
    expect(store.ready).toBe(true);
    expect(store.loading).toBe(false);
    expect(store.progress).toBeNull();
    expect(store.error).toBeNull();
    expect(spec.value.datasetId).toBe('ercot');
    expect(spec.value.chartType).toBe('text-table');
    expect(spec.canUndo).toBe(false);
  });

  it('restores the recent spec for the dataset and forwards its typeOverrides to the worker', async () => {
    const { client, spec, storage, store } = setup();
    const recent = createDefaultSpec('ercot');
    recent.chartType = 'bar';
    recent.shelves.columns = [newPill(meta('zone', 'string'), 'columns')];
    recent.typeOverrides = { price: { type: 'integer' } };
    storage.setItem(STORAGE_RECENT + 'ercot', JSON.stringify(recent));
    await store.load(entryOf('ercot'), 'u');
    expect(client.loads[0]?.opts?.typeOverrides).toEqual({ price: { type: 'integer' } });
    expect(spec.value).toEqual(recent);
  });

  it('drops a recent spec that names a field the file no longer has', async () => {
    const { spec, storage, store } = setup();
    const recent = createDefaultSpec('ercot');
    recent.shelves.rows = [newPill(meta('gone', 'number'), 'rows')];
    storage.setItem(STORAGE_RECENT + 'ercot', JSON.stringify(recent));
    await store.load(entryOf('ercot'), 'u');
    expect(spec.value.shelves.rows).toEqual([]);
    expect(spec.value.datasetId).toBe('ercot');
  });

  it('an explicit initial spec (URL hash) wins over the recent one', async () => {
    const { spec, storage, store } = setup();
    const recent = createDefaultSpec('ercot');
    recent.chartType = 'bar';
    storage.setItem(STORAGE_RECENT + 'ercot', JSON.stringify(recent));
    const fromHash = createDefaultSpec('ercot');
    fromHash.chartType = 'line';
    await store.load(entryOf('ercot'), 'u', fromHash);
    expect(spec.value.chartType).toBe('line');
  });

  it('opens a local CSV without any network: the File object itself goes to the worker', async () => {
    const { client, spec, store } = setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const file = new File(['zone,price\nW,1\n'], 'My Prices 2024.CSV', { type: 'text/csv' });
    await store.openLocal(file);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(client.loads[0]?.source).toBe(file);
    expect(client.loads[0]?.entry.source).toBe('local');
    expect(client.loads[0]?.entry.file).toBe('');
    expect(client.loads[0]?.entry.sha1).toBe('');
    expect(store.entry?.id).toBe('my-prices-2024');
    expect(spec.value.datasetId).toBe('my-prices-2024');
  });

  it('slugs device file names into ids', () => {
    expect(localDatasetId('ERCOT Prices (final).csv')).toBe('ercot-prices-final');
    expect(localDatasetId('.csv')).toBe('local-file');
    expect(localEntry(new File([''], 'a.csv')).name).toBe('a');
  });

  it('reports a failed load and leaves no stale fields behind', async () => {
    const { client, store } = setup();
    await store.load(entryOf('ok'), 'u');
    client.failLoad = 'network: 404';
    await store.load(entryOf('bad'), 'u2');
    expect(store.error).toBe('network: 404');
    expect(store.ready).toBe(false);
    expect(store.meta).toEqual([]);
    expect(store.loading).toBe(false);
  });

  it('a superseded load never overwrites the newer one', async () => {
    const client = createFakeClient();
    const spec = createSpecStore();
    let releaseFirst: () => void = () => {};
    const gate = new Promise<void>((r) => { releaseFirst = r; });
    const realLoad = client.load.bind(client);
    let n = 0;
    client.load = async (entry, source, opts) => {
      if (n++ === 0) await gate;
      return realLoad(entry, source, opts);
    };
    const store = createDatasetStore({ client, spec, storage: null });
    const first = store.load(entryOf('slow'), 'u1');
    const second = store.load(entryOf('fast'), 'u2');
    await second;
    expect(store.entry?.id).toBe('fast');
    expect(spec.value.datasetId).toBe('fast');
    releaseFirst();
    await first;
    await tick();
    expect(store.entry?.id).toBe('fast');
    expect(spec.value.datasetId).toBe('fast');
    expect(store.ready).toBe(true);
  });

  it('setType records the override in the spec and refreshes meta; needsReload re-loads with it', async () => {
    const { client, spec, store } = setup();
    await store.load(entryOf('ercot'), 'u');
    await store.setType('price', 'integer');
    expect(spec.value.typeOverrides).toEqual({ price: { type: 'integer' } });
    expect(store.meta.find((m) => m.name === 'price')?.type).toBe('integer');
    expect(client.setTypes).toEqual([{ field: 'price', type: 'integer', dateFormat: undefined }]);

    client.setTypeReply = 'needsReload';
    await store.setType('ts', 'date', 'yyyy-MM-dd');
    expect(client.loads).toHaveLength(2);
    expect(client.loads[1]?.opts?.typeOverrides).toEqual({ price: { type: 'integer' }, ts: { type: 'date', dateFormat: 'yyyy-MM-dd' } });
    expect(spec.value.typeOverrides.ts).toEqual({ type: 'date', dateFormat: 'yyyy-MM-dd' });
    expect(store.ready).toBe(true);
  });

  it('phones ask the worker to cap rows', async () => {
    const client = createFakeClient();
    const store = createDatasetStore({ client, spec: createSpecStore(), storage: null, isMobile: () => true });
    await store.load(entryOf('x'), 'u');
    expect(client.loads[0]?.opts?.maxRows).toBe(1_000_000);
  });
});
