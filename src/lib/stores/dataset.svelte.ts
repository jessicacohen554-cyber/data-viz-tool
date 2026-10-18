/**
 * Dataset load state (shard S5). Owns which dataset is open, its inferred
 * `FieldMeta[]`, load progress and errors, and the `DataClient` the UI talks
 * to. On a successful load it replaces the spec store with the recent spec
 * for that dataset (localStorage `STORAGE_RECENT`), an explicitly supplied
 * spec (URL-hash restore), or a fresh default, and it forwards that spec's
 * `typeOverrides` to the worker before inference results are reported
 * (docs/VIZSPEC.md "typeOverrides is re-applied at load").
 *
 * Svelte runes store; the only state here is load state (rule R-SPEC: viz
 * state lives in `spec.svelte.ts`). Pure modules never import this file.
 */
import type { DataType, DatasetEntry, FieldMeta, GeoRole, LoadProgress, VizSpec } from '../core/types';
import { MAX_ROWS_MOBILE, STORAGE_RECENT } from '../core/constants';
import { createDefaultSpec } from '../core/spec-defaults';
import { validateSpec } from '../core/validate-spec';
import { loadRecent, type KeyValueStore } from '../core/url-codec';
import { createDataClient, type DataClient } from '../data/data-client';
import { spec as specSingleton, type SpecStore } from './spec.svelte';
import { ui } from './ui.svelte';

/** Dependencies, injectable for tests (a counting fake client, an in-memory store). */
export interface DatasetStoreDeps {
  client: DataClient;
  spec: SpecStore;
  /** Where recent specs are read from; `null` disables the recent lookup. */
  storage: KeyValueStore | null;
  /** True on a phone: the worker is told to cap rows at `MAX_ROWS_MOBILE`. */
  isMobile?: () => boolean;
}

/** Store API consumed by the dataset picker, the field list and the query pipeline. */
export interface DatasetStore {
  /** The open dataset (catalog or local); null before the first load. */
  readonly entry: DatasetEntry | null;
  /** Inferred (and overridden) field metadata; empty until a load succeeds. */
  readonly meta: FieldMeta[];
  readonly rowCount: number;
  /** Last progress event of the load in flight; null when idle. */
  readonly progress: LoadProgress | null;
  /** Message of the last failed load or type change; null when the last one succeeded. */
  readonly error: string | null;
  /** True while a load is in flight. */
  readonly loading: boolean;
  /** Worker warnings from the last load (row cap hit, parse errors). */
  readonly warnings: string[];
  /** True once `entry` is loaded and `meta` describes it. */
  readonly ready: boolean;
  /** The data client every other store and dialog uses. */
  readonly client: DataClient;
  /**
   * Load `entry` from `source` (an absolute URL for a catalog entry, a `File`
   * for a device-opened CSV). `initialSpec` (a URL-hash restore) wins over the
   * recent spec; either is dropped for a default when it no longer validates
   * against the loaded fields. Resolves when the spec store has been replaced;
   * never rejects (failures land in `error`).
   */
  load(entry: DatasetEntry, source: string | File, initialSpec?: VizSpec | null): Promise<void>;
  /** Open a CSV from the device: parsed in the worker, never uploaded (D-9). */
  openLocal(file: File): Promise<void>;
  /**
   * Change a field's data type (Tableau "Change Data Type"). Records the
   * override in `spec.typeOverrides` and re-parses the column in the worker;
   * when the worker dropped its raw bytes the dataset is reloaded with the
   * override applied.
   */
  setType(field: string, type: DataType, dateFormat?: string): Promise<void>;
  /**
   * Change a field's geographic role (Tableau "Geographic Role", v2). Records
   * `typeOverrides[field].geoRole` when the role in force (override, else the
   * inferred `meta.geoRole`) differs (`null` = explicitly none) and reflects
   * the role into `meta`. No worker round trip: a geo role only steers the
   * chart layer, which reads the override first; the worker re-applies the
   * override on the next load or `setType` (T1 seam 3, resolved by T6).
   */
  setGeoRole(field: string, role: GeoRole | null): void;
}

/**
 * `meta` with the spec's `geoRole` overrides applied (`null` = none). The
 * worker bakes the overrides it was given at load; this covers overrides
 * written since (the field menu) without a reload.
 */
export function applyGeoOverrides(fields: FieldMeta[], overrides: VizSpec['typeOverrides']): FieldMeta[] {
  return fields.map((m) => {
    const o = overrides[m.name];
    return o && 'geoRole' in o ? { ...m, geoRole: o.geoRole ?? null } : m;
  });
}

/** Turn a device file name into a catalog-style id (`My Data.CSV` → `my-data`). */
export function localDatasetId(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const slug = stem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'local-file';
}

/** A `DatasetEntry` for a device-opened file (`source: 'local'`, no path, no hash). */
export function localEntry(file: File): DatasetEntry {
  return {
    id: localDatasetId(file.name),
    file: '',
    name: file.name.replace(/\.[^.]+$/, ''),
    bytes: file.size,
    rows: null,
    columns: [],
    sha1: '',
    modified: new Date(file.lastModified || Date.now()).toISOString(),
    description: null,
    source: 'local',
  };
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Unknown error';
}

/** Create a store. Exported for tests; the app uses the singleton `dataset`. */
export function createDatasetStore(deps: DatasetStoreDeps): DatasetStore {
  let entry = $state<DatasetEntry | null>(null);
  let meta = $state<FieldMeta[]>([]);
  let rowCount = $state(0);
  let progress = $state<LoadProgress | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let warnings = $state<string[]>([]);
  let ready = $state(false);
  /** Source of the current load, kept so `setType` can reload when the worker asks. */
  let lastSource: string | File | null = null;
  /** Monotonic id so a slow load that is superseded never clobbers the newer one. */
  let loadSeq = 0;

  /** The spec to install for `datasetId`: explicit → recent → default; invalid candidates fall through. */
  function chooseSpec(datasetId: string, fields: FieldMeta[] | null, initial: VizSpec | null | undefined): VizSpec {
    const candidates: Array<VizSpec | null> = [initial ?? null];
    if (deps.storage) candidates.push(loadRecent(deps.storage, STORAGE_RECENT, datasetId));
    for (const c of candidates) {
      if (!c || c.datasetId !== datasetId) continue;
      if (fields === null || validateSpec(c, fields).length === 0) return c;
    }
    return createDefaultSpec(datasetId);
  }

  async function load(next: DatasetEntry, source: string | File, initialSpec?: VizSpec | null): Promise<void> {
    const seq = ++loadSeq;
    entry = next;
    lastSource = source;
    progress = null;
    error = null;
    warnings = [];
    loading = true;
    ready = false;
    // Overrides are read from the spec we will install, before the worker infers types.
    const planned = chooseSpec(next.id, null, initialSpec);
    try {
      // Callers may hand us `$state` proxies (the picker's manifest, the spec); `postMessage` cannot clone those.
      const loaded = await deps.client.load($state.snapshot(next) as DatasetEntry, source, {
        typeOverrides: $state.snapshot(planned.typeOverrides),
        maxRows: deps.isMobile?.() ? MAX_ROWS_MOBILE : undefined,
        onProgress: (p) => { if (seq === loadSeq) progress = p; },
      });
      if (seq !== loadSeq) return;
      rowCount = loaded.rowCount;
      warnings = loaded.warnings;
      // Re-validate against the real fields: a stale recent spec must not reference columns that vanished.
      const chosen = chooseSpec(next.id, loaded.meta, initialSpec);
      meta = applyGeoOverrides(loaded.meta, chosen.typeOverrides);
      deps.spec.replace(chosen, { history: false });
      ready = true;
    } catch (e) {
      if (seq !== loadSeq) return;
      error = messageOf(e);
      meta = [];
      rowCount = 0;
    } finally {
      if (seq === loadSeq) { loading = false; progress = null; }
    }
  }

  async function setType(field: string, type: DataType, dateFormat?: string): Promise<void> {
    if (!entry || !lastSource) return;
    const current = deps.spec.value;
    const override = { ...(current.typeOverrides[field] ?? {}), type, ...(dateFormat ? { dateFormat } : {}) };
    deps.spec.patch((d) => { d.typeOverrides[field] = override; });
    error = null;
    try {
      const reply = await deps.client.setType(field, type, dateFormat);
      if (reply === 'needsReload') {
        await load(entry, lastSource, deps.spec.value);
        return;
      }
      meta = applyGeoOverrides(reply, deps.spec.value.typeOverrides);
    } catch (e) {
      error = messageOf(e);
    }
  }

  function setGeoRole(field: string, role: GeoRole | null): void {
    const cur = deps.spec.value.typeOverrides[field];
    // The field menu writes the override first (dropping it when the role equals the inferred one), so this
    // records only when called on its own: no second history entry for one menu choice.
    const inForce = cur && 'geoRole' in cur ? (cur.geoRole ?? null) : (meta.find((m) => m.name === field)?.geoRole ?? null);
    if (inForce !== role) {
      deps.spec.patch((d) => { d.typeOverrides[field] = { ...(d.typeOverrides[field] ?? {}), geoRole: role }; });
    }
    meta = meta.map((m) => (m.name === field ? { ...m, geoRole: role } : m));
  }

  return {
    get entry() { return entry; },
    get meta() { return meta; },
    get rowCount() { return rowCount; },
    get progress() { return progress; },
    get error() { return error; },
    get loading() { return loading; },
    get warnings() { return warnings; },
    get ready() { return ready; },
    get client() { return deps.client; },
    load,
    openLocal(file) { return load(localEntry(file), file); },
    setType,
    setGeoRole,
  };
}

/** `localStorage` when the browser allows it (private mode and sandboxed frames may throw), else null. */
export function browserStorage(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** App-wide singleton bound to a fresh worker client. */
export const dataset: DatasetStore = createDatasetStore({
  client: createDataClient(),
  spec: specSingleton,
  storage: browserStorage(),
  isMobile: () => ui.isMobile,
});
