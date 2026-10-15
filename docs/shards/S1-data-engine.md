SHARD S1 — data engine. Repo jessicacohen554-cyber/data-viz-tool @ {{SHA}}. Model: Opus or Fable. Branch `claude/s1-data-engine`.

{{COMMON}}

GOAL: the browser-side data layer: stream a CSV into typed columns in a Web Worker, infer Tableau types, and answer `QueryPlan`s with `QueryResult`s fast enough for the plan §9 budgets (3-dim group-by on 430K rows ≤ 40 ms desktop; parse+build of the 32 MB file ≤ 2.5 s).

OWNS:
- `src/lib/data/column-store.ts` — `ColumnStore` + builders: `DictBuilder` (Int32 codes + dictionary sorted lexically at finish, codes remapped), `F64Builder`, `I32Builder` (promotes to f64 if a value is non-integer or out of ±2^31; decided within the first 5K rows), `DateBuilder` (epoch-ms Float64 via a compiled pattern parser), `BoolBuilder` (Uint8: 0/1/255 null). Lazy cached date-part columns per (field, level) and date-trunc key columns.
- `src/lib/data/type-inference.ts` — `inferType(samples: string[])`, `inferAll(header, sampleRows)` → `FieldMeta[]`; rules in docs/TABLEAU-SPEC.md (integer vs number, ISO date first, D/M ambiguity flag, booleans true/false/yes/no/0/1 only when the whole sample is such).
- `src/lib/data/date-parse.ts` — `detectDateFormat(samples)`, `compileParser(pattern)`, `datePart(ms, level)`, `dateTrunc(ms, level)`; all UTC; week = ISO week; NEVER `Date.parse` on free text.
- `src/lib/data/csv-loader.ts` — streaming `fetch`/`File.stream()` → `TextDecoder` → PapaParse chunks (`header:false`, fast mode when no quotes) → builders; inference on the first `INFERENCE_SAMPLE_ROWS`; progress by bytes throttled to `PROGRESS_INTERVAL_MS`; `AbortSignal`; `maxRows` cap; Cache API keyed by `sha1` for catalog files.
- `src/lib/data/filters.ts` — `buildMask(store, filters)` → Uint8Array with per-filter mask cache; all five `FilterSpec` kinds; topN = inner aggregate then mask.
- `src/lib/data/engine.ts` — `runQuery(store, plan)` → `QueryResult`: dense mixed-radix key when Π cardinalities ≤ `DENSE_KEY_MAX_CELLS` else hashed; one pass for sum/count/min/max/sumsq (avg, var, stdev derived); median/boxstats by counting-sort bucketing; countd by sorted pairs; bins; date parts/truncs as dims; sort (label/value/manual); `limit` with stride sampling and `truncated:true`; disaggregated path. `profileField(store, name, limit, search)` → `FieldProfile`.
- `src/lib/data/data-client.ts` — replace the stub: promise API over `postMessage`, progress events, stale-result drop (ignore `result` replies older than the latest query id), 16-entry LRU by `queryKey`, `terminate()`.
- `src/workers/data.worker.ts` — the router for `WorkerRequest` → `WorkerReply` from `src/lib/data/protocol.ts` (read-only; do not edit). Use `transferablesOf()`. One `ColumnStore` at a time.
- Tests next to each module (`*.test.ts`), `tests/perf/engine-430k.test.ts` (skipped unless `PERF=1`), fixtures you add under `tests/fixtures/`.

CONSUMES (read-only): `src/lib/core/types.ts`, `constants.ts`, `query-of.ts` (`queryKey`), `src/lib/data/protocol.ts`, `tests/fixtures/sample.csv`, `data/datasets/*.csv` (the four ERCOT files; `ercot-system-hourly-2019-2025.csv` is the 430K-row perf target), `docs/TABLEAU-SPEC.md` (inference and null semantics).

ACCEPTANCE: engine results equal a brute-force JS reference on the fixtures for every aggregation × dims combination; worker round-trip test under Node (`worker_threads` or direct router call); `PERF=1 npm run perf` prints parse, build and group-by timings on the 430K file and asserts the budgets; no `document`/`window` anywhere in your files.
