SHARD T1 — engine v2 (percentiles, bands, geo roles, regression). Repo jessicacohen554-cyber/data-viz-tool @ {{SHA}}. Model: Opus or Fable. Branch `claude/t1-engine-v2`.

{{COMMON}}

CONTEXT: v0.1 is live (docs/ARCHITECTURE.md). The contract is now v2: read `src/lib/core/types.ts` (Aggregation percentiles, `QueryPlan.bands`/`QueryResult.bands`, `GeoRole`, `FieldMeta.geoRole`, `typeOverrides[].geoRole`), `src/lib/core/constants.ts` (`PERCENTILE_LEVEL`, `GEO_ROLES`), `docs/VIZSPEC.md` §v2, `docs/DECISIONS.md` D-13/D-15/D-16, `docs/TABLEAU-SPEC.md`.

OWNS: `src/lib/data/*` (not protocol.ts, not types), `src/workers/data.worker.ts`, new `src/lib/data/geo-names.ts`, `src/lib/data/regression.ts`, `src/lib/data/stats.ts`, `tests/perf/*`, their tests.

DELIVER:
1. Percentile aggregations `p05 p10 p25 p75 p90 p95` in `engine.ts` (same bucketing path as median; nearest-rank or linear interpolation — pick one, document in TABLEAU-SPEC via your report, and test both small and large groups). `AGGREGATION_LABEL`/menus already exist.
2. `plan.bands = { measureKey, levels }` → `result.bands: Float64Array[]` (one per level, per group, NaN for empty groups). Transfer them (`transferablesOf` in protocol.ts already lists only known arrays — extend by adding `bands` handling in the worker's transfer list; protocol.ts is read-only, so compute the transfer list locally in the worker if needed and note it under Seams).
3. Geo role inference in `type-inference.ts` + `geo-names.ts`: by header name (`state`, `st`, `country`, `iso`, `county`, `zone`, `lat`, `latitude`, `lon`, `lng`, `longitude`) and by value matching ≥ 80% of sampled non-null values against: 50 US state names + USPS codes; ISO-3166 alpha-2/alpha-3 + common English country names (≥ 200); the seven ERCOT zones (`Houston North Northeast Panhandle South South_Central West`, also matching `South Central`); lat in [-90, 90] and lon in [-180, 180] for numbers with the right header. Honour `typeOverrides[field].geoRole` (null clears). Report the role in `FieldMeta.geoRole`. US counties: match `<County> County, <ST>` / `<County>, <ST>` / 5-digit FIPS strings.
4. `regression.ts` (pure, main-thread-safe): `fit(xs, ys, model, degree?) → { coef: number[]; r2: number; predict(x): number; equation: string }` for linear, log (y = a + b ln x), exp (ln y = a + b x), poly (least squares, degree 2..5, normal equations with scaling). Tests against known closed forms.
5. `stats.ts`: `summary(values: Float64Array) → { min, max, avg, median, p25, p75, percentile(p) }` ignoring NaN; used by reference lines.
6. `tests/perf`: add a percentile-band timing on the 430K file (budget: ≤ 150 ms for 24 groups × 5 levels).

ACCEPTANCE: brute-force parity tests for every percentile; bands equal percentiles computed per group; geo inference matrix (states by name, by code, mixed case; countries by ISO2/ISO3/name; ERCOT zones; lat/lon; negative cases like "Texas Instruments"); regression R² = 1 on exact data; `PERF=1 npm run perf` green; no DOM in your files.
