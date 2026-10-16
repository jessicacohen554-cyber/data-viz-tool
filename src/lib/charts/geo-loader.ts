/**
 * Loads the GeoJSON layers of `public/geo/index.json` once each, registers
 * them with ECharts (`registerMap`) and keeps a synchronous cache the pure
 * map builders read (`getGeoLayer`). URLs are built from
 * `import.meta.env.BASE_URL` so one `dist/` serves from Pages and the local
 * launcher (plan §12). The canvas calls `loadGeoLayer` when a built option
 * reports `__meta.geoPending`, then rebuilds. Framework-free: `fetch` and
 * `echarts/core` only, no DOM (rule R-PURE).
 */
import { echarts } from './echarts-setup';
import type { GeoJson, GeoLayer, GeoLayerInfo } from './geo';

const layers = new Map<string, GeoLayer>();
const inflight = new Map<string, Promise<GeoLayer>>();
let indexCache: GeoLayerInfo[] | null = null;
let indexInflight: Promise<GeoLayerInfo[]> | null = null;

/** A `fetch`-shaped function (injectable for tests). */
export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const defaultFetch: Fetcher = (url) => globalThis.fetch(url);

/** URL of a file under `public/geo/`, relative to the app base. */
export function geoUrl(file: string): string {
  const base = import.meta.env.BASE_URL || './';
  return `${base.endsWith('/') ? base : `${base}/`}geo/${file}`;
}

/** The layer catalog (`index.json`), fetched once. */
export async function loadGeoIndex(fetcher: Fetcher = defaultFetch): Promise<GeoLayerInfo[]> {
  if (indexCache) return indexCache;
  if (!indexInflight) {
    indexInflight = fetcher(geoUrl('index.json')).then(async (r) => {
      if (!r.ok) throw new Error(`geo index: HTTP ${r.status}`);
      const rows = (await r.json()) as GeoLayerInfo[];
      indexCache = rows;
      return rows;
    }).finally(() => { indexInflight = null; });
  }
  return indexInflight;
}

/** Register a layer from memory (preloaded or test GeoJSON) and return it; replaces a layer of the same id. */
export function registerGeoLayer(info: GeoLayerInfo, geojson: GeoJson): GeoLayer {
  echarts.registerMap(info.id, geojson as unknown as Parameters<typeof echarts.registerMap>[1]);
  const layer: GeoLayer = { info, geojson };
  layers.set(info.id, layer);
  return layer;
}

/** The loaded layer, or `undefined` while it is still to be fetched. */
export function getGeoLayer(id: string): GeoLayer | undefined {
  return layers.get(id);
}

/** Load (once) and register the layer with this `index.json` id. Rejects for an unknown id or a failed fetch. */
export async function loadGeoLayer(id: string, fetcher: Fetcher = defaultFetch): Promise<GeoLayer> {
  const have = layers.get(id);
  if (have) return have;
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = (async () => {
    const info = (await loadGeoIndex(fetcher)).find((row) => row.id === id);
    if (!info) throw new Error(`geo layer "${id}" is not in index.json`);
    const r = await fetcher(geoUrl(info.file));
    if (!r.ok) throw new Error(`geo layer "${id}": HTTP ${r.status}`);
    return registerGeoLayer(info, (await r.json()) as GeoJson);
  })().finally(() => { inflight.delete(id); });
  inflight.set(id, p);
  return p;
}

/** Ids of the layers currently loaded. */
export function loadedGeoLayers(): string[] {
  return [...layers.keys()];
}

/** Forget every loaded layer and the index (tests). ECharts keeps its registered maps; they are simply re-registered. */
export function clearGeoLayers(): void {
  layers.clear();
  inflight.clear();
  indexCache = null;
  indexInflight = null;
}
