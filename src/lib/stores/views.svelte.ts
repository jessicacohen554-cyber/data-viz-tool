/**
 * Saved views and persistence (shard S5, owner decision D-7): named specs in
 * localStorage under `STORAGE_VIEWS + datasetId`, the per-dataset recent spec
 * under `STORAGE_RECENT`, and URL-hash sync through `core/url-codec.ts`
 * (`encodeSpec` on every spec change, debounced `HASH_DEBOUNCE_MS`;
 * `decodeSpec` once on boot).
 *
 * Storage is the source of truth for the view lists; a `$state` version
 * counter invalidates readers after every write, so `list()` never mutates
 * state while being read. The persistence logic is plain functions the
 * `$effect` calls, unit-testable with an in-memory store and fake timers.
 * Svelte runes store; pure modules never import this file.
 */
import { untrack } from 'svelte';
import type { SavedView, VizSpec } from '../core/types';
import { STORAGE_RECENT, STORAGE_VIEWS } from '../core/constants';
import { cloneSpec, newId } from '../core/spec-defaults';
import { validateSpec } from '../core/validate-spec';
import { decodeSpec, encodeSpec, saveRecent, type KeyValueStore } from '../core/url-codec';
import { spec as specSingleton, type SpecStore } from './spec.svelte';
import { browserStorage } from './dataset.svelte';

/** Spec changes are written to the hash and the recent slot at most this often. */
export const HASH_DEBOUNCE_MS = 300;

/** Minimal URL-hash access so the store is testable without a browser. */
export interface HashLocation {
  getHash(): string;
  /** Receives the codec output without `#`; the browser adapter uses `replaceState` to keep history clean. */
  setHash(hash: string): void;
}

/** Dependencies, injectable for tests. */
export interface ViewsStoreDeps {
  /** null = persistence disabled (storage blocked); every call degrades to a no-op or empty list. */
  storage: KeyValueStore | null;
  spec: SpecStore;
  /** null = no hash sync. */
  location: HashLocation | null;
  debounceMs?: number;
  now?: () => string;
  newId?: () => string;
}

/** Store API consumed by the SavedViews dialog and the app shell. */
export interface ViewsStore {
  /** Views saved for a dataset, newest first; reactive to saves, renames and removes. */
  list(datasetId: string): SavedView[];
  /** Save a copy of `spec` under `name`; returns the stored view. */
  save(name: string, spec: VizSpec, thumbnail?: string): SavedView;
  /**
   * Load a view: when it belongs to the dataset the spec store currently
   * shows, the store is replaced (one undo step); the view is returned either
   * way so the caller can switch datasets first when it does not. Null when unknown.
   */
  load(id: string): SavedView | null;
  remove(id: string): void;
  rename(id: string, name: string): void;
  /** Schedule `spec` for the hash and the recent slot (debounced). Specs without a dataset are ignored. */
  persist(spec: VizSpec): void;
  /** Write any pending `persist` now (tests, `pagehide`). */
  flush(): Promise<void>;
  /** Decode the spec in the URL hash (default: the browser's); null when absent or invalid. */
  restoreFromHash(hash?: string): Promise<VizSpec | null>;
  /** Start the reactive sync (`spec.value` → `persist`); returns a stop function. */
  start(): () => void;
}

function readList(storage: KeyValueStore | null, datasetId: string): SavedView[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_VIEWS + datasetId);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedView);
  } catch {
    return [];
  }
}

function isSavedView(v: unknown): v is SavedView {
  if (!v || typeof v !== 'object') return false;
  const o = v as Partial<SavedView>;
  return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.datasetId === 'string'
    && typeof o.createdAt === 'string' && validateSpec(o.spec).length === 0;
}

function writeList(storage: KeyValueStore | null, datasetId: string, views: SavedView[]): void {
  if (!storage) return;
  try {
    if (views.length === 0) storage.removeItem(STORAGE_VIEWS + datasetId);
    else storage.setItem(STORAGE_VIEWS + datasetId, JSON.stringify(views));
  } catch { /* quota exceeded or private mode: the in-memory spec is unaffected */ }
}

/** The browser's hash, written with `replaceState` so every edit does not become a history entry. */
export function browserLocation(): HashLocation | null {
  if (typeof window === 'undefined') return null;
  return {
    getHash: () => window.location.hash,
    setHash: (hash) => {
      const url = `${window.location.pathname}${window.location.search}#${hash}`;
      try { window.history.replaceState(null, '', url); } catch { window.location.hash = hash; }
    },
  };
}

/** Create a store. Exported for tests; the app uses the singleton `views`. */
export function createViewsStore(deps: ViewsStoreDeps): ViewsStore {
  const debounceMs = deps.debounceMs ?? HASH_DEBOUNCE_MS;
  const now = deps.now ?? (() => new Date().toISOString());
  const makeId = deps.newId ?? newId;
  /** Bumped after every write so `list()` readers re-run. */
  let version = $state(0);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingSpec: VizSpec | null = null;
  /** Serialises hash writes so an older encode never lands after a newer one. */
  let writeSeq = 0;

  /** Every dataset id that has a view list in storage (views are looked up by id across datasets). */
  function datasetIdsInStorage(): string[] {
    const s = deps.storage;
    if (!s) return [];
    const ids: string[] = [];
    const keyed = s as KeyValueStore & { length?: number; key?: (i: number) => string | null };
    if (typeof keyed.length === 'number' && typeof keyed.key === 'function') {
      for (let i = 0; i < keyed.length; i++) {
        const k = keyed.key(i);
        if (k && k.startsWith(STORAGE_VIEWS)) ids.push(k.slice(STORAGE_VIEWS.length));
      }
    }
    return ids;
  }

  function find(id: string): { datasetId: string; views: SavedView[]; index: number } | null {
    const candidates = new Set<string>([deps.spec.value.datasetId, ...datasetIdsInStorage()]);
    for (const datasetId of candidates) {
      if (!datasetId) continue;
      const views = readList(deps.storage, datasetId);
      const index = views.findIndex((v) => v.id === id);
      if (index >= 0) return { datasetId, views, index };
    }
    return null;
  }

  /** The write in flight, so `flush()` can await an encode the timer already started. */
  let inflight: Promise<void> = Promise.resolve();

  async function write(s: VizSpec): Promise<void> {
    if (deps.storage) saveRecent(deps.storage, STORAGE_RECENT, s);
    if (deps.location) {
      const mine = ++writeSeq;
      const hash = await encodeSpec(s);
      if (mine === writeSeq) deps.location.setHash(hash);
    }
  }

  async function flush(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    const s = pendingSpec;
    pendingSpec = null;
    if (s) inflight = write(s);
    await inflight;
  }

  function persist(s: VizSpec): void {
    if (!s.datasetId) return;
    pendingSpec = s;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, debounceMs);
  }

  return {
    list(datasetId) {
      version;
      return readList(deps.storage, datasetId);
    },
    save(name, s, thumbnail) {
      const view: SavedView = { id: makeId(), name: name.trim() || 'Untitled view', datasetId: s.datasetId, createdAt: now(), spec: cloneSpec(s) };
      if (thumbnail) view.thumbnail = thumbnail;
      writeList(deps.storage, s.datasetId, [view, ...readList(deps.storage, s.datasetId)]);
      version++;
      return view;
    },
    load(id) {
      const hit = find(id);
      if (!hit) return null;
      const view = hit.views[hit.index]!;
      if (view.datasetId === deps.spec.value.datasetId) deps.spec.replace(view.spec);
      return view;
    },
    remove(id) {
      const hit = find(id);
      if (!hit) return;
      writeList(deps.storage, hit.datasetId, hit.views.filter((v) => v.id !== id));
      version++;
    },
    rename(id, name) {
      const hit = find(id);
      const trimmed = name.trim();
      if (!hit || !trimmed) return;
      const views = hit.views.map((v) => (v.id === id ? { ...v, name: trimmed } : v));
      writeList(deps.storage, hit.datasetId, views);
      version++;
    },
    persist,
    flush,
    restoreFromHash(hash) {
      const h = hash ?? deps.location?.getHash() ?? '';
      return h.length > 1 ? decodeSpec(h) : Promise.resolve(null);
    },
    start() {
      return $effect.root(() => {
        $effect(() => {
          const s = deps.spec.value;
          untrack(() => persist(s));
        });
      });
    },
  };
}

/** App-wide singleton; `App.svelte` calls `views.start()` once on mount and `restoreFromHash()` on boot. */
export const views: ViewsStore = createViewsStore({
  storage: browserStorage(),
  spec: specSingleton,
  location: browserLocation(),
});
