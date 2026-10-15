> Status: ACTIVE — skeleton written by S0; filled by S6 (integration) once S1–S5 have landed. Section headings are fixed; a section marked *(S6)* is empty by design, not stale.

# Architecture

How the app is built. The contract it is built on is `src/lib/core/types.ts`
(narrated in [`VIZSPEC.md`](VIZSPEC.md)); what it must do is
[`TABLEAU-SPEC.md`](TABLEAU-SPEC.md), [`CHARTS.md`](CHARTS.md) and
[`PALETTES.md`](PALETTES.md). Rules cited by ID are in `CLAUDE.md`.

## 1. Shape

```
browser main thread                          Web Worker (src/workers/data.worker.ts)
┌──────────────────────────────────┐        ┌──────────────────────────────────────┐
│ App.svelte                       │        │ lib/data: csv-loader → type-inference│
│  lib/ui/* (Svelte, DOM)          │ msgs   │           → column-store              │
│  lib/stores/* (runes)  ◄────────►│◄──────►│ engine: filters → group-by → measures │
│    spec ── queryOf ── query      │        │ protocol.ts message unions (lib/data) │
│  lib/charts (ECharts option)     │        └──────────────────────────────────────┘
│  lib/format · lib/palette        │
└──────────────────────────────────┘
```

`VizSpec` is the only state (rule 1). `queryOf(spec)` derives a `QueryPlan`
that strips chart type, formats, marks and axes, so a change to any of those
re-renders without a worker round-trip; `queryKey(plan)` is canonical JSON and
keys a 16-entry LRU in `data-client.ts`.

## 2. Module map

| Directory | Owns | May import | Never imports |
|---|---|---|---|
| `lib/core` | types, constants, defaults, spec validation, `queryOf`, URL codec | nothing from `lib/*` | svelte, DOM, echarts |
| `lib/data` | protocol, column store, inference, date parsing, CSV loading, filters, engine, client | `lib/core` | svelte, DOM, echarts |
| `lib/format` | number and date formatting per `FormatSpec` | `lib/core` | svelte, DOM |
| `lib/palette` | registry, ramp generation, validation, `pick` | `lib/core` | svelte, DOM |
| `lib/charts` | ECharts setup, chart registry, Show Me, spec → option, transforms | `lib/core`, `lib/format`, `lib/palette`, `echarts/core` | svelte, DOM (except `ChartCanvas` in `lib/ui/chart`) |
| `lib/stores` | runes stores: spec (+undo), dataset, query (effect pipeline), views, ui | everything above | — |
| `lib/ui` | Svelte components | everything | `lib/data` internals (only via `data-client`) |
| `workers` | the worker entry | `lib/data`, `lib/core` | DOM, echarts, svelte |

Enforced by `tests/boundary.test.ts` (rule 2) — there is no ESLint.

## 3. Data path *(S1 fills: storage layout, loader pipeline, inference, engine algorithms, caching)*

Fixed by the plan (§9) and binding on S1: strings → `Int32Array` codes +
sorted dictionary; numbers → `Float64Array` (`Int32Array` when whole and in
range); dates → epoch-ms `Float64Array` parsed by a compiled pattern, never
`Date.parse` on free text; booleans → `Uint8Array`. Streaming `fetch` →
`TextDecoder` → PapaParse chunks (`header:false`, fast mode) → builders;
inference on the first 5K rows; Cache API keyed by `sha1`. Group-by: dense
mixed-radix key when Π cardinalities ≤ 4M else hashed; one pass for
sum/count/min/max/sumsq; median and boxstats by counting-sort bucketing;
COUNTD by sorted pairs; Top N = inner aggregate then mask; filters → cached
`Uint8Array` masks ANDed per query.

## 4. Worker protocol *(S1 fills from `lib/data/protocol.ts`)*

## 5. Format and palette *(S2 fills: formatter entry points, `pick` resolution, validator wiring)*

## 6. Charts *(S3 fills: registry entry shape, `echartsModules` cross-check, transforms, DOM renderers)*

Fixed: `{id, label, group, icon, requires, channels, renderer:'echarts'|'dom',
transform?, build(ctx)}`; `setOption` with `replaceMerge`; `large` /
`progressive` for scatter > 2K; `sampling:'lttb'` for long lines; animation
off above 5K points or on mobile; tooltips `transitionDuration:0`,
`confine:true`; `ResizeObserver` → rAF.

## 7. State and effects *(S5 fills: store graph, undo, stale-result drop, saved views, URL hash)*

## 8. UI and mobile *(S4 + S6 fill: component tree, drag controller, bottom sheets, tap-to-place, keyboard)*

Fixed (plan §10): desktop ≥ 900px is the Tableau three-pane (data 260px |
shelves + marks | chart); phone is chart-first with a bottom bar opening
Data / Shelves / Marks / Chart-type sheets. Drag via Pointer Events
(`setPointerCapture`, `touch-action:none` on pills only, start after 8px or a
180ms long-press); fallback tap-pill → tap-shelf; keyboard "Add to…" on every
pill.

## 9. Performance budgets (acceptance criteria, rule 6)

| Budget | Desktop | Phone |
|---|---|---|
| Parse + build, 500K × 12 | ≤ 2.5 s | ≤ 8 s |
| 3-dim group-by on 500K | ≤ 40 ms | ≤ 120 ms |
| Pill drop → re-render | ≤ 100 ms | ≤ 250 ms |
| 100K-point scatter first paint | < 300 ms | — |
| Pan on that scatter | 60 fps | — |
| Mobile caps | — | 1M rows, 20K result groups, 5K axis categories (else require Top N) |

`tests/perf/engine-430k.test.ts` asserts the engine numbers on
`data/datasets/ercot-system-hourly-2019-2025.csv` (`PERF=1 npm run perf`);
measured numbers are recorded in `docs/records/s6/RESULT-perf-<date>.md`,
never pinned into this doc.

## 10. Build, launch, deploy

One `dist/` (`base: './'`, deterministic asset names) serves from
`tools/launcher.py` at `127.0.0.1:8766` (with `data/` overlaid, manifest
regenerated on start, `GET /api/manifest`) and from GitHub Pages
(`deploy-pages.yml` builds and copies `data/` beside it). `dist/` is committed
and written on `main` only by `build-dist.yml` (rule 11); the catalog lives at
`data/`, outside Vite's `public/`, so it never enters `dist/`.
