/**
 * Streaming CSV → `ColumnStore` (shard S1).
 *
 * Pipeline (docs/ARCHITECTURE.md §3): byte stream (`fetch`, `Blob.stream()`,
 * a `ReadableStream`, or in-memory bytes) → `TextDecoder` → quote-aware row
 * boundary split → PapaParse per piece (`header:false`, fast mode when the
 * piece has no quote) → type inference on the first `INFERENCE_SAMPLE_ROWS`
 * rows → builders → `finalizeMeta`. Progress is reported by bytes, throttled
 * to `PROGRESS_INTERVAL_MS`; an `AbortSignal` cancels; `maxRows` caps the
 * rows; catalog files (`cacheKey` = `DatasetEntry.sha1`) go through the
 * Cache API when it exists (workers have `caches`, Node does not).
 *
 * `reparseColumn` rebuilds one column from the retained raw bytes for the
 * `setType` path, so a type change never re-downloads.
 *
 * Never `Date.parse`; never DOM (R-PURE, R-WORKER).
 */
import { parse as papaParse } from 'papaparse';
import type { DataType, FieldMeta, LoadProgress, Role } from '../core/types';
import { INFERENCE_SAMPLE_ROWS, PROGRESS_INTERVAL_MS } from '../core/constants';
import {
  ColumnStore, builderFor, finalizeMeta, type BuiltColumn, type ColumnBuilder,
} from './column-store';
import { cachedParser, detectDateFormat, type DateParser } from './date-parse';
import { defaultsFor, inferAll, isNullToken, storageFor } from './type-inference';

/** Cache API bucket for catalog CSVs. */
export const DATASET_CACHE = 'viz-datasets-v1';

/** Default size of the pieces an in-memory byte source is streamed in. */
const DEFAULT_CHUNK_BYTES = 1 << 20;

/** Fallback pattern when a `date` override carries no format and detection fails. */
const FALLBACK_DATE_PATTERN = "yyyy-MM-dd'T'HH:mm:ss.SSS";

/** Per-field user overrides (`VizSpec.typeOverrides`). */
export type TypeOverrides = Record<string, { type?: DataType; role?: Role; dateFormat?: string }>;

/** Accepted inputs: a URL, a `Blob`/`File`, a byte stream, or bytes already in memory. */
export type CsvSource = string | Blob | ReadableStream<Uint8Array> | Uint8Array;

/** Options of `loadCsv`. */
export interface LoadCsvOptions {
  typeOverrides?: TypeOverrides;
  /** Row cap; rows beyond it are dropped with a warning. */
  maxRows?: number;
  /** Keep the raw bytes so `reparseColumn` can run without re-download. */
  keepRaw?: boolean;
  /** Row count hint for builder capacity (`DatasetEntry.rows`). */
  expectedRows?: number | null;
  /** `DatasetEntry.sha1`; when set and `source` is a URL, the Cache API is consulted and filled. */
  cacheKey?: string;
  signal?: AbortSignal;
  onProgress?: (p: LoadProgress) => void;
  /** Piece size for in-memory byte sources (tests use tiny values to force boundary splits). */
  chunkBytes?: number;
}

/** What `loadCsv` returns. */
export interface LoadCsvResult {
  store: ColumnStore;
  /** Raw bytes when `keepRaw` was set, else null. */
  raw: Uint8Array[] | null;
  elapsedMs: number;
  warnings: string[];
}

/** Error thrown when the load is aborted (`name === 'AbortError'`). */
export class AbortError extends Error {
  override readonly name = 'AbortError';
  constructor() { super('load aborted'); }
}

// ---------------------------------------------------------------------------
// Quote-aware streaming parser
// ---------------------------------------------------------------------------

type RowSink = (rows: string[][]) => boolean | void;

/**
 * Splits decoded text into complete-row pieces across chunk boundaries (quote
 * parity carried over, so multi-line quoted cells survive) and parses each piece
 * with PapaParse. The sink returns `false` to stop.
 */
class CsvStreamParser {
  private carry = '';
  private inQuotes = false;
  private delimiter: string | undefined;
  stopped = false;

  constructor(private readonly sink: RowSink) {}

  feed(text: string): void {
    if (this.stopped || text.length === 0) return;
    let inQuotes = this.inQuotes;
    let lastSafe = -1;
    let hasQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 34) { inQuotes = !inQuotes; hasQuote = true; }
      else if (c === 10 && !inQuotes) lastSafe = i;
    }
    this.inQuotes = inQuotes;
    if (lastSafe < 0) { this.carry += text; return; }
    const piece = this.carry + text.slice(0, lastSafe + 1);
    this.carry = text.slice(lastSafe + 1);
    this.parsePiece(piece, hasQuote || piece.includes('"'));
  }

  flush(): void {
    if (this.stopped) return;
    if (this.carry.length > 0) {
      const piece = this.carry;
      this.carry = '';
      this.parsePiece(piece, piece.includes('"'));
    }
  }

  private parsePiece(piece: string, hasQuote: boolean): void {
    const result = papaParse<string[]>(piece, {
      header: false,
      skipEmptyLines: 'greedy',
      fastMode: !hasQuote,
      delimiter: this.delimiter,
    });
    if (!this.delimiter && result.meta.delimiter) this.delimiter = result.meta.delimiter;
    if (result.data.length === 0) return;
    if (this.sink(result.data) === false) this.stopped = true;
  }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** A byte stream plus its total length when known. */
interface OpenedSource { stream: ReadableStream<Uint8Array>; total: number | null }

function bytesToStream(bytes: Uint8Array, chunkBytes: number): ReadableStream<Uint8Array> {
  let pos = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pos >= bytes.length) { controller.close(); return; }
      const end = Math.min(bytes.length, pos + chunkBytes);
      controller.enqueue(bytes.subarray(pos, end));
      pos = end;
    },
  });
}

/** Open a source as a byte stream; URLs go through the Cache API when `cacheKey` is set and `caches` exists. */
async function openSource(source: CsvSource, opts: LoadCsvOptions): Promise<OpenedSource> {
  if (source instanceof Uint8Array) return { stream: bytesToStream(source, opts.chunkBytes ?? DEFAULT_CHUNK_BYTES), total: source.byteLength };
  if (typeof source !== 'string') {
    if ('getReader' in source) return { stream: source, total: null };
    return { stream: source.stream(), total: source.size };
  }

  const cacheStore = opts.cacheKey && typeof caches !== 'undefined' ? await caches.open(DATASET_CACHE).catch(() => null) : null;
  const cacheRequest = opts.cacheKey ? `/__viz-cache__/${opts.cacheKey}` : '';
  if (cacheStore) {
    const hit = await cacheStore.match(cacheRequest).catch(() => undefined);
    if (hit && hit.body) return { stream: hit.body, total: lengthOf(hit) };
  }
  const res = await fetch(source, { signal: opts.signal });
  if (!res.ok || !res.body) throw new NetworkError(`${res.status} ${res.statusText} for ${source}`);
  if (cacheStore) {
    // Fill the cache in parallel; a quota failure is not a load failure.
    void cacheStore.put(cacheRequest, res.clone()).catch(() => undefined);
  }
  return { stream: res.body, total: lengthOf(res) };
}

function lengthOf(res: Response): number | null {
  const h = res.headers.get('content-length');
  const n = h ? Number(h) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Network failure while fetching a source. */
export class NetworkError extends Error {
  override readonly name = 'NetworkError';
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/** Apply `typeOverrides` to inferred metadata and pick each column's builder. */
function plan(fields: FieldMeta[], sample: string[][], overrides: TypeOverrides, capacity: number): ColumnBuilder[] {
  return fields.map((meta) => {
    const ov = overrides[meta.name];
    if (ov?.type && ov.type !== meta.type) {
      meta.type = ov.type;
      meta.storage = storageFor(ov.type);
      Object.assign(meta, defaultsFor(ov.type));
      meta.confidence = 1;
      meta.dateFormat = null;
      meta.dateAmbiguous = false;
    }
    if (meta.storage === 'date') {
      if (ov?.dateFormat) { meta.dateFormat = ov.dateFormat; meta.dateAmbiguous = false; }
      if (!meta.dateFormat) {
        const col = sample.map((r) => r[meta.index] ?? '').filter((v) => !isNullToken(v)).map((v) => v.trim());
        meta.dateFormat = detectDateFormat(col, true)?.pattern ?? FALLBACK_DATE_PATTERN;
      }
    }
    if (ov?.role) {
      meta.role = ov.role;
      meta.defaultContinuity = ov.role === 'measure' ? 'continuous' : 'discrete';
      meta.defaultAggregation = ov.role === 'measure' ? 'sum' : 'count';
    }
    return builderFor(meta.storage, capacity, meta.storage === 'date' ? cachedParser(meta.dateFormat!) : undefined);
  });
}

/** Compiled parser for a (possibly overridden) date field. */
export function parserFor(dateFormat: string | null): DateParser {
  return cachedParser(dateFormat ?? FALLBACK_DATE_PATTERN);
}

/**
 * Stream a CSV into a `ColumnStore`. The first row is the header. Inference runs
 * when `INFERENCE_SAMPLE_ROWS` data rows have arrived (or at the end for smaller
 * files); every row then flows into the builders. Short rows are padded with nulls,
 * long rows truncated; both are counted in `warnings`.
 */
export async function loadCsv(source: CsvSource, opts: LoadCsvOptions = {}): Promise<LoadCsvResult> {
  const t0 = now();
  const maxRows = opts.maxRows ?? Infinity;
  const overrides = opts.typeOverrides ?? {};
  const warnings: string[] = [];
  const raw: Uint8Array[] | null = opts.keepRaw ? [] : null;

  let header: string[] | null = null;
  let fields: FieldMeta[] | null = null;
  let builders: ColumnBuilder[] | null = null;
  const sample: string[][] = [];
  let rows = 0;
  let shortRows = 0, longRows = 0;
  let capped = false;

  const startBuilders = () => {
    if (!header) return;
    fields = inferAll(header, sample);
    const capacity = Math.max(opts.expectedRows ?? 0, sample.length, 4096) + 1;
    builders = plan(fields, sample, overrides, capacity);
    for (const row of sample) pushRow(row);
    sample.length = 0;
  };

  const pushRow = (row: string[]) => {
    const bs = builders!;
    const w = bs.length;
    if (row.length < w) shortRows++; else if (row.length > w) longRows++;
    for (let c = 0; c < w; c++) {
      const cell = row[c];
      if (cell === undefined) bs[c]!.pushNull(); else bs[c]!.push(cell);
    }
    rows++;
  };

  const parser = new CsvStreamParser((data) => {
    let i = 0;
    if (!header) {
      header = (data[0] ?? []).map((h) => h.replace(/^﻿/, ''));
      i = 1;
    }
    for (; i < data.length; i++) {
      if (rows + (builders ? 0 : sample.length) >= maxRows) { capped = true; return false; }
      const row = data[i]!;
      if (builders) pushRow(row);
      else {
        sample.push(row);
        if (sample.length >= INFERENCE_SAMPLE_ROWS) startBuilders();
      }
    }
    return true;
  });

  const { stream, total } = await openSource(source, opts);
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let loaded = 0;
  let lastProgress = 0;
  const progress = (phase: LoadProgress['phase'], force = false) => {
    if (!opts.onProgress) return;
    const t = now();
    if (!force && t - lastProgress < PROGRESS_INTERVAL_MS) return;
    lastProgress = t;
    opts.onProgress({ phase, loaded, total, rows: rows + sample.length });
  };

  try {
    for (;;) {
      if (opts.signal?.aborted) throw new AbortError();
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        loaded += value.byteLength;
        if (raw) raw.push(value);
        parser.feed(decoder.decode(value, { stream: true }));
        progress('parse');
        if (parser.stopped) { await reader.cancel().catch(() => undefined); break; }
      }
    }
    if (!parser.stopped) {
      parser.feed(decoder.decode());
      parser.flush();
    }
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    if (opts.signal?.aborted || (e instanceof Error && e.name === 'AbortError')) throw new AbortError();
    throw e;
  }
  if (opts.signal?.aborted) throw new AbortError();

  if (!header) throw new ParseError('empty file: no header row');
  if (!builders) startBuilders();
  progress('build', true);

  const columns = builders!.map((b) => b.finish());
  const metas = fields!;
  columns.forEach((built, i) => {
    const meta = metas[i]!;
    if (built.column.storage !== meta.storage) {
      // I32 promoted to F64 mid-file.
      meta.type = 'number';
      meta.storage = built.column.storage;
    }
    finalizeMeta(meta, built.column, built.parseErrors);
  });
  const store = new ColumnStore(metas, columns.map((c) => c.column), rows);

  if (capped) warnings.push(`row cap of ${maxRows} reached; rows beyond were dropped`);
  if (shortRows) warnings.push(`${shortRows} row(s) had fewer cells than the header (padded with nulls)`);
  if (longRows) warnings.push(`${longRows} row(s) had more cells than the header (extra cells ignored)`);
  for (const m of metas) if (m.parseErrors > 0) warnings.push(`${m.name}: ${m.parseErrors} value(s) could not be read as ${m.type}`);

  return { store, raw, elapsedMs: now() - t0, warnings };
}

/** The file could not be parsed as CSV. */
export class ParseError extends Error {
  override readonly name = 'ParseError';
}

/**
 * Re-read one column from retained raw bytes with a fresh builder (the `setType`
 * path). The row sequence is identical to the original load (same empty-line
 * rule, same `maxRows`), so the result aligns with the store.
 */
export function reparseColumn(raw: readonly Uint8Array[], columnIndex: number, builder: ColumnBuilder, maxRows = Infinity): BuiltColumn {
  let headerSeen = false;
  let rows = 0;
  const parser = new CsvStreamParser((data) => {
    let i = 0;
    if (!headerSeen) { headerSeen = true; i = 1; }
    for (; i < data.length; i++) {
      if (rows >= maxRows) return false;
      const cell = data[i]![columnIndex];
      if (cell === undefined) builder.pushNull(); else builder.push(cell);
      rows++;
    }
    return true;
  });
  const decoder = new TextDecoder('utf-8');
  for (const chunk of raw) {
    parser.feed(decoder.decode(chunk, { stream: true }));
    if (parser.stopped) break;
  }
  if (!parser.stopped) { parser.feed(decoder.decode()); parser.flush(); }
  return builder.finish();
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
