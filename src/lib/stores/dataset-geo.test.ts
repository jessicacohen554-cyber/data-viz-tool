import { describe, expect, it } from 'vitest';
import { applyGeoOverrides, createDatasetStore } from './dataset.svelte';
import { createSpecStore } from './spec.svelte';
import { createDefaultSpec } from '../core/spec-defaults';
import { STORAGE_RECENT } from '../core/constants';
import { meta } from '../core/spec-defaults.test';
import { createFakeClient, entryOf, memStorage } from './fake-client.test';

function setup() {
  const client = createFakeClient();
  client.fields = [{ ...meta('zone', 'string'), geoRole: 'ercot-zone' }, meta('price', 'number'), meta('ts', 'datetime')];
  const spec = createSpecStore();
  const storage = memStorage();
  const store = createDatasetStore({ client, spec, storage, isMobile: () => false });
  return { client, spec, storage, store };
}

describe('dataset store geo-role glue (T5)', () => {
  it('applyGeoOverrides reflects spec overrides, including an explicit None, and leaves other fields alone', () => {
    const fields = [{ ...meta('zone', 'string'), geoRole: 'ercot-zone' as const }, meta('county', 'string')];
    const out = applyGeoOverrides(fields, { zone: { geoRole: null }, county: { geoRole: 'us-county' }, price: { type: 'integer' } });
    expect(out.map((m) => m.geoRole)).toEqual([null, 'us-county']);
    expect(applyGeoOverrides(fields, {})).toEqual(fields);
    expect(applyGeoOverrides(fields, { zone: { type: 'string' } })[0]?.geoRole).toBe('ercot-zone');
  });

  it('setGeoRole records the override once and updates meta without a worker round trip', async () => {
    const { client, spec, store } = setup();
    await store.load(entryOf('ercot'), 'u');
    store.setGeoRole('zone', 'us-county');
    expect(spec.value.typeOverrides.zone).toEqual({ geoRole: 'us-county' });
    expect(store.meta.find((m) => m.name === 'zone')?.geoRole).toBe('us-county');
    expect(client.setTypes).toEqual([]);
    expect(spec.canUndo).toBe(true);
    // Already in the spec (the field menu wrote it): no second history entry.
    spec.undo();
    spec.patch((d) => { d.typeOverrides.zone = { geoRole: null }; });
    const before = spec.value;
    store.setGeoRole('zone', null);
    expect(spec.value).toBe(before);
    expect(store.meta.find((m) => m.name === 'zone')?.geoRole).toBeNull();
  });

  it('a load applies the restored spec\'s geoRole overrides to meta', async () => {
    const { spec, storage, store } = setup();
    const recent = createDefaultSpec('ercot');
    recent.typeOverrides = { price: { geoRole: 'latitude' }, zone: { geoRole: null } };
    storage.setItem(STORAGE_RECENT + 'ercot', JSON.stringify(recent));
    await store.load(entryOf('ercot'), 'u');
    expect(spec.value.typeOverrides).toEqual(recent.typeOverrides);
    expect(store.meta.map((m) => m.geoRole ?? null)).toEqual([null, 'latitude', null]);
  });

  it('setType keeps the geo overrides on the refreshed meta', async () => {
    const { spec, store } = setup();
    await store.load(entryOf('ercot'), 'u');
    spec.patch((d) => { d.typeOverrides.ts = { geoRole: 'country' }; });
    await store.setType('price', 'integer');
    expect(store.meta.find((m) => m.name === 'ts')?.geoRole).toBe('country');
    expect(store.meta.find((m) => m.name === 'price')?.type).toBe('integer');
  });
});
