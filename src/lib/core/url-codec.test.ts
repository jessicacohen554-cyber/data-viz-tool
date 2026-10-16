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

describe('migration', () => {
  it('upgrades a v1 spec to v2 with defaults and decodes it', async () => {
    const v1 = { ...createDefaultSpec('ercot') } as unknown as Record<string, unknown>;
    v1.version = 1;
    v1.axes = { x: (v1.axes as { x: unknown }).x, y: (v1.axes as { y: unknown }).y };
    delete v1.style; delete v1.referenceLines; delete v1.trendLine; delete v1.annotations;
    const hash = 'j=' + btoa(JSON.stringify(v1)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const back = await decodeSpec(hash);
    expect(back?.version).toBe(2);
    expect(back?.axes.y2).toBeDefined();
    expect(back?.axes.synchronized).toBe(false);
    expect(back?.style.fontFamily).toBe('inherit');
    expect(back?.referenceLines).toEqual([]);
    expect(back?.trendLine.enabled).toBe(false);
  });
});
