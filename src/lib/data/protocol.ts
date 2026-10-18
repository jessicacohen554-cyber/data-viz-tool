/**
 * Main-thread ⇄ data-worker message protocol (owned by S0; implemented by S1).
 *
 * Every request carries a monotonically increasing `id`; every reply echoes it.
 * The client drops `result` replies whose id is older than the latest `query`
 * it sent (stale-result drop). Typed arrays in replies are transferred, never
 * copied: `transferablesOf()` lists them for `postMessage`.
 */
import type {
  DatasetEntry, FieldMeta, FieldProfile, GeoRole, LoadProgress, QueryPlan, QueryResult, DataType, FilterSpec,
} from '../core/types';

// ---- requests --------------------------------------------------------------

export interface LoadRequest {
  id: number;
  type: 'load';
  entry: DatasetEntry;
  /** Absolute URL to fetch, or a File for `source: 'local'`. */
  source: string | File;
  /** `VizSpec.typeOverrides`, applied before inference; `geoRole: null` clears an inferred role (v2). */
  typeOverrides: Record<string, { type?: DataType; role?: 'dimension' | 'measure'; dateFormat?: string; geoRole?: GeoRole | null }>;
  /** Keep raw bytes to allow `setType` without re-download (false on low-memory devices). */
  keepRaw: boolean;
  /** Row cap (MAX_ROWS_MOBILE on phones). */
  maxRows: number;
}

export interface QueryRequest { id: number; type: 'query'; plan: QueryPlan }

export interface ProfileRequest { id: number; type: 'profile'; field: string; limit: number; search?: string }

export interface RowsRequest { id: number; type: 'rows'; offset: number; limit: number; fields: string[]; filters: FilterSpec[] }

export interface SetTypeRequest { id: number; type: 'setType'; field: string; dataType: DataType; dateFormat?: string }

export interface CancelRequest { id: number; type: 'cancel'; targetId: number }

export interface UnloadRequest { id: number; type: 'unload' }

export type WorkerRequest =
  | LoadRequest | QueryRequest | ProfileRequest | RowsRequest | SetTypeRequest | CancelRequest | UnloadRequest;

// ---- replies ---------------------------------------------------------------

export interface ProgressReply { id: number; type: 'progress'; progress: LoadProgress }

export interface LoadedReply { id: number; type: 'loaded'; meta: FieldMeta[]; rowCount: number; elapsedMs: number; warnings: string[] }

export interface ResultReply { id: number; type: 'result'; result: QueryResult }

export interface ProfileReply { id: number; type: 'profile'; profile: FieldProfile }

/** Row slice for the text table / raw preview. Numeric columns come as Float64Array, others as string[]. */
export interface RowsReply { id: number; type: 'rows'; fields: string[]; columns: Array<string[] | Float64Array>; total: number }

export interface MetaReply { id: number; type: 'meta'; meta: FieldMeta[] }

/** `setType` could not re-parse because raw bytes were dropped: the client must reload. */
export interface NeedsReloadReply { id: number; type: 'needsReload' }

export interface CancelledReply { id: number; type: 'cancelled'; targetId: number }

export interface UnloadedReply { id: number; type: 'unloaded' }

export interface ErrorReply { id: number; type: 'error'; message: string; code: 'parse' | 'network' | 'memory' | 'bad-request' | 'internal' }

export type WorkerReply =
  | ProgressReply | LoadedReply | ResultReply | ProfileReply | RowsReply | MetaReply
  | NeedsReloadReply | CancelledReply | UnloadedReply | ErrorReply;

// ---- helpers ---------------------------------------------------------------

/** Collect every ArrayBuffer in a reply so `postMessage` can transfer instead of copy. */
export function transferablesOf(reply: WorkerReply): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  const push = (a: ArrayBufferView | undefined) => { if (a && a.buffer instanceof ArrayBuffer) out.push(a.buffer); };
  if (reply.type === 'result') {
    for (const d of reply.result.dims) { push(d.codes); push(d.values); }
    for (const m of reply.result.measures) push(m.values);
    const b = reply.result.boxstats;
    if (b) { push(b.q1); push(b.med); push(b.q3); push(b.lo); push(b.hi); b.outliers.forEach(push); }
    reply.result.bands?.forEach(push);
  } else if (reply.type === 'profile') {
    push(reply.profile.counts);
  } else if (reply.type === 'rows') {
    for (const c of reply.columns) if (c instanceof Float64Array) push(c);
  }
  return out;
}
