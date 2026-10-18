/**
 * Main-thread client for the data worker (shard S1; replaces the S0 stub, same
 * exported names and signatures).
 *
 * A promise API over `protocol.ts`: every request gets a fresh id and a
 * pending entry; replies resolve it. `load` forwards throttled `progress`
 * replies to `onProgress`. `query` drops stale results: a `result` for a query
 * older than the latest one sent rejects with `{ stale: true }` instead of
 * resolving, and results are memoised in a `RESULT_CACHE_SIZE`-entry LRU keyed
 * by `queryKey(plan)` so render-only changes never hit the worker.
 *
 * `createDataClient()` spawns the Vite module worker; the optional `worker`
 * argument accepts anything with the worker's message surface so Node tests
 * can plug the router in directly.
 *
 * Must not import svelte or DOM beyond the `Worker` constructor (R-PURE; the
 * boundary test forbids `document`/`window`, not `Worker`).
 */
import type { DatasetEntry, DataType, FieldMeta, FieldProfile, FilterSpec, LoadProgress, QueryPlan, QueryResult } from '../core/types';
import { RESULT_CACHE_SIZE } from '../core/constants';
import { queryKey } from '../core/query-of';
import type { LoadRequest, WorkerReply, WorkerRequest } from './protocol';

/** Options of `DataClient.load` (mirrors `LoadRequest`; `keepRaw` defaults to true, `maxRows` to no cap). */
export interface LoadOptions {
  typeOverrides?: LoadRequest['typeOverrides'];
  keepRaw?: boolean;
  maxRows?: number;
  onProgress?: (p: LoadProgress) => void;
}

/** What `DataClient.load` resolves with (the `loaded` reply without its id). */
export interface LoadedDataset { meta: FieldMeta[]; rowCount: number; elapsedMs: number; warnings: string[] }

/** Promise API over the data worker; one instance per worker. Signature frozen by S0. */
export interface DataClient {
  load(entry: DatasetEntry, source: string | File, opts?: LoadOptions): Promise<LoadedDataset>;
  /** Resolves with the result, or rejects with `{ stale: true }` when a newer query superseded it. */
  query(plan: QueryPlan): Promise<QueryResult>;
  profile(field: string, limit?: number, search?: string): Promise<FieldProfile>;
  rows(offset: number, limit: number, fields: string[], filters: FilterSpec[]): Promise<{ fields: string[]; columns: Array<string[] | Float64Array>; total: number }>;
  setType(field: string, type: DataType, dateFormat?: string): Promise<FieldMeta[] | 'needsReload'>;
  unload(): Promise<void>;
  terminate(): void;
}

/** The slice of the `Worker` interface the client uses; tests supply an in-process stand-in. */
export interface WorkerLike {
  postMessage(msg: WorkerRequest): void;
  onmessage: ((ev: { data: WorkerReply }) => void) | null;
  onerror?: ((ev: unknown) => void) | null;
  terminate(): void;
}

/** Rejection value of a superseded query. */
export interface StaleResult { stale: true; id: number }

/** Error reply surfaced as a thrown `Error` with the protocol's `code`. */
export class DataError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = 'DataError'; }
}

interface Pending {
  resolve: (reply: WorkerReply) => void;
  reject: (err: unknown) => void;
  onProgress?: (p: LoadProgress) => void;
}

/** Default row cap when the caller does not pass one (desktop: no cap). */
const NO_CAP = Number.MAX_SAFE_INTEGER;

/** Spawn the module worker (Vite rewrites the URL at build time). */
function spawn(): WorkerLike {
  return new Worker(new URL('../../workers/data.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

/**
 * Create a client bound to a data worker (or the supplied stand-in). The real
 * worker is spawned lazily on the first request, so importing a store that
 * holds a client never touches `Worker` (Node tests, SSR-less builds).
 */
export function createDataClient(stub?: WorkerLike): DataClient {
  let nextId = 1;
  let latestQueryId = 0;
  const pending = new Map<number, Pending>();
  const cache = new Map<string, QueryResult>();
  let terminated = false;
  let worker: WorkerLike | undefined = stub;

  function attach(w: WorkerLike): WorkerLike {
    w.onmessage = (ev) => {
      const reply = ev.data;
      const p = pending.get(reply.id);
      if (!p) return;
      if (reply.type === 'progress') { p.onProgress?.(reply.progress); return; }
      pending.delete(reply.id);
      if (reply.type === 'error') { p.reject(new DataError(reply.message, reply.code)); return; }
      p.resolve(reply);
    };
    if ('onerror' in w) {
      w.onerror = (ev) => {
        const err = new DataError(ev instanceof Error ? ev.message : 'worker crashed', 'internal');
        for (const [id, p] of pending) { pending.delete(id); p.reject(err); }
      };
    }
    return w;
  }
  if (worker) attach(worker);

  /** The worker, spawned and wired on first use. */
  function ensureWorker(): WorkerLike {
    if (!worker) worker = attach(spawn());
    return worker;
  }

  function send(build: (id: number) => WorkerRequest, onProgress?: (p: LoadProgress) => void): Promise<WorkerReply> {
    if (terminated) return Promise.reject(new DataError('client terminated', 'internal'));
    const id = nextId++;
    return new Promise<WorkerReply>((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      ensureWorker().postMessage(build(id));
    });
  }

  function remember(key: string, result: QueryResult): void {
    cache.delete(key);
    cache.set(key, result);
    while (cache.size > RESULT_CACHE_SIZE) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  return {
    async load(entry, source, opts = {}) {
      cache.clear();
      const reply = await send((id) => ({
        id, type: 'load', entry, source,
        typeOverrides: opts.typeOverrides ?? {},
        keepRaw: opts.keepRaw ?? true,
        maxRows: opts.maxRows ?? NO_CAP,
      }), opts.onProgress);
      if (reply.type !== 'loaded') throw new DataError(`unexpected reply ${reply.type}`, 'internal');
      return { meta: reply.meta, rowCount: reply.rowCount, elapsedMs: reply.elapsedMs, warnings: reply.warnings };
    },

    async query(plan) {
      const key = queryKey(plan);
      const hit = cache.get(key);
      if (hit) { remember(key, hit); return hit; }
      let myId = 0;
      const replyPromise = send((id) => { myId = id; latestQueryId = id; return { id, type: 'query', plan }; });
      const reply = await replyPromise;
      if (reply.type !== 'result') throw new DataError(`unexpected reply ${reply.type}`, 'internal');
      remember(key, reply.result); // a superseded answer is still a correct answer to its plan
      if (myId < latestQueryId) throw { stale: true, id: myId } satisfies StaleResult;
      return reply.result;
    },

    async profile(field, limit = 1000, search) {
      const reply = await send((id) => ({ id, type: 'profile', field, limit, search }));
      if (reply.type !== 'profile') throw new DataError(`unexpected reply ${reply.type}`, 'internal');
      return reply.profile;
    },

    async rows(offset, limit, fields, filters) {
      const reply = await send((id) => ({ id, type: 'rows', offset, limit, fields, filters }));
      if (reply.type !== 'rows') throw new DataError(`unexpected reply ${reply.type}`, 'internal');
      return { fields: reply.fields, columns: reply.columns, total: reply.total };
    },

    async setType(field, type, dateFormat) {
      cache.clear();
      const reply = await send((id) => ({ id, type: 'setType', field, dataType: type, dateFormat }));
      if (reply.type === 'needsReload') return 'needsReload';
      if (reply.type !== 'meta') throw new DataError(`unexpected reply ${reply.type}`, 'internal');
      return reply.meta;
    },

    async unload() {
      cache.clear();
      const reply = await send((id) => ({ id, type: 'unload' }));
      if (reply.type !== 'unloaded') throw new DataError(`unexpected reply ${reply.type}`, 'internal');
    },

    terminate() {
      terminated = true;
      worker?.terminate();
      const err = new DataError('client terminated', 'internal');
      for (const [id, p] of pending) { pending.delete(id); p.reject(err); }
      cache.clear();
    },
  };
}
