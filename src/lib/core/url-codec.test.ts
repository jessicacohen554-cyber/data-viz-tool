import { describe, expect, it } from 'vitest';
import { createDefaultSpec, newPill } from './spec-defaults';
import { decodeSpec, encodeSpec, loadRecent, saveRecent, type KeyValueStore } from './url-codec';
import { meta } from './spec-defaults.test';

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('url codec', () => {
  it('round-trips a spec through the hash (compressed)', async () => {
    const s = createDefaultSpec('ercot');
    s.shelves.columns = [newPill(meta('zone', 'string'), 'columns')];
    s.chartType = 'bar';
    const hash = await encodeSpec(s);
    expect(hash.startsWith('v=')).toBe(true);
    expect(hash).toMatch(/^[a-zA-Z0-9=_-]+$/);
    const back = await decodeSpec('#' + hash);
    expect(back).toEqual(s);
  });

  it('returns null for garbage or invalid specs', async () => {
    expect(await decodeSpec('')).toBeNull();
    expect(await decodeSpec('#v=!!!')).toBeNull();
    expect(await decodeSpec('#j=' + btoa('{"version":1}'))).toBeNull();
  });

  it('persists and restores the recent spec per dataset', () => {
    const store = memStore();
    const s = createDefaultSpec('ercot');
    saveRecent(store, 'viz:recent:', s);
    expect(loadRecent(store, 'viz:recent:', 'ercot')).toEqual(s);
    expect(loadRecent(store, 'viz:recent:', 'other')).toBeNull();
  });
});
