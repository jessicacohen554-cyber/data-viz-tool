/**
 * STUB (S0) — replaced by shard S1. Signature is frozen: a promise API over
 * the worker protocol (protocol.ts) with progress events and stale-result drop.
 */
import type { DatasetEntry, DataType, FieldMeta, FieldProfile, FilterSpec, LoadProgress, QueryPlan, QueryResult } from '../core/types';

export interface LoadOptions {
  typeOverrides?: Record<string, { type?: DataType; role?: 'dimension' | 'measure'; dateFormat?: string }>;
  keepRaw?: boolean;
  maxRows?: number;
  onProgress?: (p: LoadProgress) => void;
}

export interface LoadedDataset { meta: FieldMeta[]; rowCount: number; elapsedMs: number; warnings: string[] }

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

const NOT_READY = 'data-client: implemented by shard S1';

/** Create a client bound to a fresh data worker. */
export function createDataClient(): DataClient {
  const reject = () => Promise.reject(new Error(NOT_READY));
  return {
    load: reject, query: reject, profile: reject, rows: reject, setType: reject, unload: reject,
    terminate() { /* no worker yet */ },
  };
}
