/**
 * Data worker entry: routes `WorkerRequest`s to `lib/data` and posts
 * `WorkerReply`s (shard S1; protocol owned by S0 in `lib/data/protocol.ts`).
 *
 * One `ColumnStore` lives here at a time. `load` streams the CSV and emits
 * throttled `progress` replies; `cancel` aborts an in-flight load by id;
 * `setType` re-parses one column from the retained raw bytes or answers
 * `needsReload` when they were dropped, re-inferring the column's geo role
 * (or re-applying the load's `geoRole` override). Every reply echoes the
 * request id and is posted with `transferablesOf()` plus the v2 `bands`
 * buffers so typed arrays move instead of copy.
 *
 * `createRouter` is the testable core (Node calls it directly); the bottom of
 * the file wires it to the worker scope only when one exists.
 *
 * Imports `lib/data` and `lib/core` only: no DOM, no ECharts, no svelte
 * (R-WORKER, R-PURE).
 */
import type { FieldMeta } from '../lib/core/types';
import {
  transferablesOf, type ErrorReply, type LoadRequest, type SetTypeRequest, type WorkerReply, type WorkerRequest,
} from '../lib/data/protocol';
import { builderFor, isNullAt, labelAt, type ColumnStore } from '../lib/data/column-store';
import { AbortError, NetworkError, ParseError, loadCsv, parserFor, reparseColumn, type TypeOverrides } from '../lib/data/csv-loader';
import { detectDateFormat } from '../lib/data/date-parse';
import { profileField, rowsOf, runQuery } from '../lib/data/engine';
import { defaultsFor, inferGeoRole, isNullToken, storageFor } from '../lib/data/type-inference';

/** How replies leave the router: `transfer` lists the buffers to move. */
export type Post = (reply: WorkerReply, transfer: ArrayBuffer[]) => void;

/** Handles one request; resolves when its reply (or error) has been posted. */
export type Router = (req: WorkerRequest) => Promise<void>;

/** Rows sampled from a rebuilt column for geo-role / date-format re-inference. */
const REINFER_SAMPLE_ROWS = 5000;

interface State {
  store: ColumnStore | null;
  raw: Uint8Array[] | null;
  maxRows: number;
  /** `typeOverrides` of the current load, re-applied for `geoRole` on `setType`. */
  overrides: TypeOverrides;
  loads: Map<number, AbortController>;
}

/**
 * Buffers of a reply that `protocol.transferablesOf` (v1, read-only) does not
 * know: the v2 `QueryResult.bands` vectors. Freshly allocated by the engine, so
 * never a duplicate of another listed buffer.
 */
export function bandBuffersOf(reply: WorkerReply): ArrayBuffer[] {
  if (reply.type !== 'result' || !reply.result.bands) return [];
  const out: ArrayBuffer[] = [];
  for (const b of reply.result.bands) if (b.buffer instanceof ArrayBuffer) out.push(b.buffer);
  return out;
}

/** Build a router around a `post` function. State is private to the router. */
export function createRouter(post: Post): Router {
  const state: State = { store: null, raw: null, maxRows: Infinity, overrides: {}, loads: new Map() };
  const send = (reply: WorkerReply) => post(reply, transferablesOf(reply).concat(bandBuffersOf(reply)));
  const fail = (id: number, code: ErrorReply['code'], message: string) => send({ id, type: 'error', code, message });

  return async (req: WorkerRequest): Promise<void> => {
    try {
      switch (req.type) {
        case 'load': await load(req); return;
        case 'query': {
          if (!state.store) { fail(req.id, 'bad-request', 'no dataset loaded'); return; }
          send({ id: req.id, type: 'result', result: runQuery(state.store, req.plan) });
          return;
        }
        case 'profile': {
          if (!state.store) { fail(req.id, 'bad-request', 'no dataset loaded'); return; }
          send({ id: req.id, type: 'profile', profile: profileField(state.store, req.field, req.limit, req.search) });
          return;
        }
        case 'rows': {
          if (!state.store) { fail(req.id, 'bad-request', 'no dataset loaded'); return; }
          const r = rowsOf(state.store, req.offset, req.limit, req.fields, req.filters);
          send({ id: req.id, type: 'rows', fields: r.fields, columns: r.columns, total: r.total });
          return;
        }
        case 'setType': setType(req); return;
        case 'cancel': {
          const ctl = state.loads.get(req.targetId);
          if (ctl) ctl.abort();
          send({ id: req.id, type: 'cancelled', targetId: req.targetId });
          return;
        }
        case 'unload': {
          state.store = null; state.raw = null;
          send({ id: req.id, type: 'unloaded' });
          return;
        }
      }
    } catch (e) {
      fail(req.id, codeOf(e), e instanceof Error ? e.message : String(e));
    }
  };

  async function load(req: LoadRequest): Promise<void> {
    const ctl = new AbortController();
    state.loads.set(req.id, ctl);
    try {
      const res = await loadCsv(req.source, {
        typeOverrides: req.typeOverrides,
        keepRaw: req.keepRaw,
        maxRows: req.maxRows,
        expectedRows: req.entry.rows,
        cacheKey: req.entry.source === 'catalog' && req.entry.sha1 ? req.entry.sha1 : undefined,
        signal: ctl.signal,
        onProgress: (progress) => send({ id: req.id, type: 'progress', progress }),
      });
      if (ctl.signal.aborted) return; // the cancel reply already went out
      state.store = res.store;
      state.raw = res.raw;
      state.maxRows = req.maxRows;
      state.overrides = req.typeOverrides;
      send({ id: req.id, type: 'loaded', meta: res.store.fields, rowCount: res.store.rowCount, elapsedMs: res.elapsedMs, warnings: res.warnings });
    } catch (e) {
      if (e instanceof AbortError || ctl.signal.aborted) return;
      throw e;
    } finally {
      state.loads.delete(req.id);
    }
  }

  function setType(req: SetTypeRequest): void {
    const store = state.store;
    if (!store) { fail(req.id, 'bad-request', 'no dataset loaded'); return; }
    if (store.indexOf(req.field) < 0) { fail(req.id, 'bad-request', `unknown field: ${req.field}`); return; }
    if (!state.raw) { send({ id: req.id, type: 'needsReload' }); return; }
    const meta = store.meta(req.field);
    const storage = storageFor(req.dataType);
    const patch: Partial<FieldMeta> = { type: req.dataType, storage, ...defaultsFor(req.dataType), confidence: 1, dateFormat: null, dateAmbiguous: false };
    let parser;
    if (storage === 'date') {
      const pattern = req.dateFormat ?? detectDateFormat(sampleOf(store, req.field), true)?.pattern ?? null;
      parser = parserFor(pattern);
      patch.dateFormat = parser.pattern;
    }
    const built = reparseColumn(state.raw, meta.index, builderFor(storage, store.rowCount + 1, parser), state.maxRows);
    if (built.column.storage !== storage) { patch.type = 'number'; patch.storage = built.column.storage; }
    const ov = state.overrides[req.field];
    if (ov && 'geoRole' in ov) patch.geoRole = ov.geoRole ?? null;
    else {
      const labels: string[] = [];
      const n = Math.min(store.rowCount, REINFER_SAMPLE_ROWS);
      for (let i = 0; i < n; i++) if (!isNullAt(built.column, i)) labels.push(labelAt(built.column, i).trim());
      patch.geoRole = inferGeoRole(req.field, labels, patch.type!);
    }
    store.replaceColumn(req.field, built, patch);
    send({ id: req.id, type: 'meta', meta: store.fields });
  }
}

/** Up to `REINFER_SAMPLE_ROWS` non-null labels of a dict column, for date-format detection on a type change. */
function sampleOf(store: ColumnStore, field: string): string[] {
  const out: string[] = [];
  const col = store.column(field);
  const n = Math.min(store.rowCount, REINFER_SAMPLE_ROWS);
  if (col.storage !== 'dict') return out;
  for (let i = 0; i < n && out.length < REINFER_SAMPLE_ROWS; i++) {
    const c = col.codes[i]!;
    if (c >= 0) { const s = col.dict[c]!; if (!isNullToken(s)) out.push(s.trim()); }
  }
  return out;
}

function codeOf(e: unknown): ErrorReply['code'] {
  if (e instanceof NetworkError) return 'network';
  if (e instanceof ParseError) return 'parse';
  if (e instanceof RangeError) return 'memory';
  if (e instanceof Error && /unknown field|not a date|no dataset/.test(e.message)) return 'bad-request';
  return 'internal';
}

// ---- worker wiring (skipped under Node tests) --------------------------------

declare const WorkerGlobalScope: (new () => unknown) | undefined;

const scope = globalThis as unknown as {
  postMessage?: (msg: unknown, transfer: ArrayBuffer[]) => void;
  onmessage: ((ev: { data: WorkerRequest }) => void) | null;
};

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope && scope.postMessage) {
  const post = scope.postMessage.bind(scope);
  const route = createRouter((reply, transfer) => post(reply, transfer));
  scope.onmessage = (ev) => { void route(ev.data); };
}
