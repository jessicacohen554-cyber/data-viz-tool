import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createViewsStore, type HashLocation } from './views.svelte';
import { createSpecStore } from './spec.svelte';
import { createDefaultSpec, newPill } from '../core/spec-defaults';
import { STORAGE_RECENT, STORAGE_VIEWS } from '../core/constants';
import { decodeSpec, loadRecent } from '../core/url-codec';
import { meta } from '../core/spec-defaults.test';
import { memStorage } from './fake-client.test';

function fakeLocation(initial = ''): HashLocation & { writes: string[] } {
  let hash = initial;
  const loc = { writes: [] as string[], getHash: () => hash, setHash: (h: string) => { hash = '#' + h; loc.writes.push(h); } };
  return loc;
}

function setup(datasetId = 'ds') {
  const storage = memStorage();
  const spec = createSpecStore(createDefaultSpec(datasetId));
  const location = fakeLocation();
  let n = 0;
  const store = createViewsStore({ storage, spec, location, now: () => '2026-10-15T00:00:00Z', newId: () => `id${++n}` });
  return { storage, spec, location, store };
}

describe('saved views', () => {
  it('save → list (newest first) → load replaces the spec as one undo step', () => {
    const { spec, store } = setup();
    const a = store.save('First', spec.value);
    spec.patch((d) => { d.chartType = 'bar'; d.shelves.columns = [newPill(meta('zone', 'string'), 'columns')]; });
    const b = store.save('  Second  ', spec.value, 'data:image/png;base64,AAA');
    expect(store.list('ds').map((v) => v.name)).toEqual(['Second', 'First']);
    expect(b.thumbnail).toBe('data:image/png;base64,AAA');
    expect(a.createdAt).toBe('2026-10-15T00:00:00Z');
    expect(store.list('other')).toEqual([]);

    const loaded = store.load(a.id);
    expect(loaded?.id).toBe(a.id);
    expect(spec.value.chartType).toBe('text-table');
    expect(spec.canUndo).toBe(true);
    spec.undo();
    expect(spec.value.chartType).toBe('bar');
    expect(store.load('nope')).toBeNull();
  });

  it('persists in localStorage under the dataset key and survives a new store instance', () => {
    const { storage, spec, store } = setup();
    store.save('Kept', spec.value);
    expect(Object.keys(storage.dump())).toEqual([STORAGE_VIEWS + 'ds']);
    const again = createViewsStore({ storage, spec, location: null });
    expect(again.list('ds').map((v) => v.name)).toEqual(['Kept']);
  });

  it('rename and remove; removing the last view drops the key', () => {
    const { storage, spec, store } = setup();
    const v = store.save('Old', spec.value);
    store.rename(v.id, ' New ');
    store.rename(v.id, '   ');
    expect(store.list('ds')[0]?.name).toBe('New');
    store.remove(v.id);
    expect(store.list('ds')).toEqual([]);
    expect(storage.getItem(STORAGE_VIEWS + 'ds')).toBeNull();
  });

  it('a view saved for another dataset is found by id but does not replace the current spec', () => {
    const { spec, store } = setup();
    const other = createDefaultSpec('other');
    other.chartType = 'line';
    const v = store.save('Other', other);
    const loaded = store.load(v.id);
    expect(loaded?.datasetId).toBe('other');
    expect(spec.value.datasetId).toBe('ds');
    expect(spec.value.chartType).toBe('text-table');
  });

  it('ignores corrupt or invalid stored rows and works without storage', () => {
    const { storage, spec, store } = setup();
    storage.setItem(STORAGE_VIEWS + 'ds', JSON.stringify([{ id: 'x', name: 'bad', datasetId: 'ds', createdAt: 't', spec: { version: 1 } }, 42]));
    expect(store.list('ds')).toEqual([]);
    storage.setItem(STORAGE_VIEWS + 'ds', '{not json');
    expect(store.list('ds')).toEqual([]);
    const none = createViewsStore({ storage: null, spec, location: null });
    expect(none.save('x', spec.value).name).toBe('x');
    expect(none.list('ds')).toEqual([]);
    none.remove('x');
    none.rename('x', 'y');
  });
});

describe('URL hash and recent sync', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('debounces spec changes into one hash write and one recent save', async () => {
    const { storage, spec, location, store } = setup();
    spec.patch((d) => { d.chartType = 'bar'; });
    store.persist(spec.value);
    spec.patch((d) => { d.title = 'Avg price'; });
    store.persist(spec.value);
    await vi.advanceTimersByTimeAsync(299);
    expect(location.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await store.flush(); // the timer fired; await the encode it started
    expect(location.writes).toHaveLength(1);
    expect(await decodeSpec(location.getHash())).toEqual(spec.value);
    expect(loadRecent(storage, STORAGE_RECENT, 'ds')).toEqual(spec.value);
  });

  it('a spec without a dataset is never persisted; flush writes a pending one immediately', async () => {
    const { storage, location, store } = setup('');
    store.persist(createDefaultSpec(''));
    await vi.runAllTimersAsync();
    expect(location.writes).toEqual([]);
    expect(storage.dump()).toEqual({});
    const s = createDefaultSpec('ds');
    store.persist(s);
    await store.flush();
    expect(location.writes).toHaveLength(1);
    await store.flush();
    expect(location.writes).toHaveLength(1);
  });

  it('round-trips a saved view through the hash on boot', async () => {
    const { spec, location, store } = setup();
    spec.patch((d) => { d.chartType = 'heatmap'; d.shelves.rows = [newPill(meta('price', 'number'), 'rows')]; });
    store.persist(spec.value);
    await store.flush();
    expect(location.writes).toHaveLength(1);
    const boot = createViewsStore({ storage: memStorage(), spec: createSpecStore(), location: fakeLocation(location.getHash()) });
    expect(await boot.restoreFromHash()).toEqual(spec.value);
    expect(await boot.restoreFromHash('#j=garbage')).toBeNull();
    expect(await boot.restoreFromHash('')).toBeNull();
  });
});
