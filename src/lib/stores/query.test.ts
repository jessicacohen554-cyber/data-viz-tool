import { describe, expect, it } from 'vitest';
import { createQueryStore, planFor } from './query.svelte';
import { createSpecStore } from './spec.svelte';
import { createDefaultSpec, newPill } from '../core/spec-defaults';
import { meta } from '../core/spec-defaults.test';
import { createFakeClient, entryOf, tick } from './fake-client.test';
import type { DatasetEntry } from '../core/types';

function setup() {
  const client = createFakeClient();
  const spec = createSpecStore(createDefaultSpec('ds'));
  const ds = { ready: true, entry: entryOf('ds') as DatasetEntry | null };
  const store = createQueryStore({ client, spec, dataset: ds, needsOf: () => ({}), limit: () => 1000 });
  /** Run the pipeline step the $effect would run. */
  const sync = () => store.submit(spec.value, ds.ready, ds.entry?.id ?? null);
  spec.addPill('columns', newPill(meta('zone', 'string'), 'columns'));
  spec.addPill('rows', newPill(meta('price', 'number'), 'rows'));
  return { client, spec, ds, store, sync };
}

describe('query pipeline', () => {
  it('runs nothing before the dataset is ready, for another dataset, or for an empty worksheet', () => {
    const { client, spec, ds, store, sync } = setup();
    ds.ready = false;
    expect(sync()).toBeNull();
    ds.ready = true;
    ds.entry = entryOf('other');
    expect(sync()).toBeNull();
    ds.entry = entryOf('ds');
    spec.replace(createDefaultSpec('ds'));
    expect(sync()).toBeNull();
    expect(client.queries).toHaveLength(0);
    expect(store.result).toBeNull();
    expect(planFor(createDefaultSpec('ds'), true, 'ds', () => ({}), 10)).toBeNull();
  });

  it('a change that only touches render settings never calls client.query', async () => {
    const { client, spec, store, sync } = setup();
    sync();
    expect(client.queries).toHaveLength(1);
    expect(store.pending).toBe(true);
    client.settle();
    await tick();
    expect(store.pending).toBe(false);
    expect(store.result?.groups).toBe(2);

    spec.patch((d) => { d.chartType = 'bar'; });
    spec.patch((d) => { d.marks.opacity = 0.5; d.marks.labels.show = true; });
    spec.patch((d) => { d.palette = { mode: 'manual', categorical: 'okabe-ito' }; });
    spec.patch((d) => { d.fieldFormats.price = { kind: 'currency' }; d.title = 'x'; d.axes.y.log = true; d.legend.show = false; });
    for (let i = 0; i < 4; i++) expect(sync()).toBe(store.key);
    expect(client.queries).toHaveLength(1);
    expect(store.result?.groups).toBe(2);
  });

  it('a pill change re-queries; a different pill id with the same meaning does not', () => {
    const { client, spec, sync } = setup();
    sync();
    spec.updatePill(spec.value.shelves.rows[0]!.id, (p) => { p.aggregation = 'avg'; });
    sync();
    expect(client.queries).toHaveLength(2);
    expect(client.queries[1]?.plan.measures[0]?.aggregation).toBe('avg');
    // Same question, fresh ids (a saved view re-applied): canonical key is unchanged.
    spec.replace({ ...spec.value, shelves: { ...spec.value.shelves, rows: [{ ...spec.value.shelves.rows[0]!, id: 'new-id' }] } });
    sync();
    expect(client.queries).toHaveLength(2);
  });

  it('drops a result that arrives after a newer query was issued', async () => {
    const { client, spec, store, sync } = setup();
    sync();
    spec.updatePill(spec.value.shelves.rows[0]!.id, (p) => { p.aggregation = 'max'; });
    sync();
    expect(client.queries).toHaveLength(2);
    client.settle(0, 5); // the stale one lands first
    await tick();
    expect(store.result).toBeNull();
    expect(store.pending).toBe(true);
    client.settle(1, 3);
    await tick();
    expect(store.result?.groups).toBe(3);
    expect(store.pending).toBe(false);
    expect(store.plan?.measures[0]?.aggregation).toBe('max');
  });

  it('a late result for the previous key is ignored even after the newer one landed', async () => {
    const { client, spec, store, sync } = setup();
    sync();
    spec.updatePill(spec.value.shelves.rows[0]!.id, (p) => { p.aggregation = 'min'; });
    sync();
    client.settle(1, 3);
    await tick();
    client.settle(0, 9);
    await tick();
    expect(store.result?.groups).toBe(3);
  });

  it('a client-side stale rejection is silent', async () => {
    const { client, store, sync } = setup();
    sync();
    client.queries[0]!.reject({ stale: true });
    await tick();
    expect(store.error).toBeNull();
    expect(store.pending).toBe(true);
  });

  it('a real error surfaces and clears pending', async () => {
    const { client, store, sync } = setup();
    sync();
    client.queries[0]!.reject(new Error('memory'));
    await tick();
    expect(store.error).toBe('memory');
    expect(store.pending).toBe(false);
  });

  it('undo back to a previous question re-queries it (the client cache answers); clearing pills clears the result', async () => {
    const { client, spec, store, sync } = setup();
    sync();
    client.settle();
    await tick();
    const k1 = store.key;
    spec.updatePill(spec.value.shelves.rows[0]!.id, (p) => { p.aggregation = 'avg'; });
    sync();
    expect(client.queries).toHaveLength(2);
    spec.undo();
    expect(sync()).toBe(k1);
    expect(client.queries).toHaveLength(3);
    spec.redo();
    sync();
    expect(client.queries).toHaveLength(4);
    spec.removePill(spec.value.shelves.columns[0]!.id);
    spec.removePill(spec.value.shelves.rows[0]!.id);
    expect(sync()).toBeNull();
    expect(store.result).toBeNull();
    expect(store.key).toBeNull();
    // A result for an earlier query must not resurrect after the clear.
    client.settle(3);
    await tick();
    expect(store.result).toBeNull();
  });

  it('plans use the chart needs and the limit it is given', () => {
    const { spec } = setup();
    const planned = planFor(spec.value, true, 'ds', () => ({ boxstats: true }), 42);
    expect(planned?.plan.limit).toBe(42);
    expect(planned?.plan.boxstats?.measureKey).toBe(spec.value.shelves.rows[0]!.id);
  });
});
