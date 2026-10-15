> Status: ACTIVE — owner rulings, verbatim. Changed only by a new ruling (a new row), never by edit.

# Decisions

Rulings are copied verbatim from the decision card that carried them
(rule 16 `[R-RECORDS]`); cite them as `D-n`. The card record for the build
plan is
[`records/s0/DECISION-CARDS-build-plan-2026-10-15.md`](records/s0/DECISION-CARDS-build-plan-2026-10-15.md).

## 1. RULED 2026-10-15 (decision cards presented in the planning session; verbatim choices)

| # | Ruling | What it unblocks / what it requires |
|---|---|---|
| D-1 | **Apache ECharts** (canvas), tree-shaken via `echarts/core` | The whole chart layer (`src/lib/charts/`): `echarts-setup.ts` registers only the modules each `ChartDef` lists, a test cross-checks the two. Requires: no second chart library, ever (`CLAUDE.md` FORBIDDEN). |
| D-2 | **Custom columnar engine** in a Web Worker (dictionary-coded Int32 + Float64), zero deps | `src/lib/data/` and `src/workers/data.worker.ts`; the §9 budgets are its acceptance criteria. Requires: no parsing or aggregation on the main thread (rule 3 `[R-WORKER]`). |
| D-3 | **Slim + full**: 3 small ERCOT CSVs for phone + the full 430K-row system-hourly 2019–2025 as stress test, sizes shown in picker | The four files in `data/datasets/` (plan §11), the size badge in `DatasetPicker`, `tests/perf/engine-430k.test.ts`. Requires: provenance README beside the CSVs (rule 12 `[R-DATA]`). |
| D-4 | **Vite + Svelte 5 + TypeScript** (build step) | The scaffold; `svelte-check` in CI and the pre-push gate. Requires: the framework-free boundary (rule 2 `[R-PURE]`) so the engine, format, palette and chart layers stay testable in node. |
| D-5 | **Build if Node, else serve `dist/`**: `run-viz.bat` builds when Node exists, then serves `dist/` with stdlib Python; `dist/` is committed and rebuilt by CI on merge to `main` | `run-viz.bat` / `run-viz.sh`, `tools/launcher.py`, `build-dist.yml`. Requires: `dist/` committed, written only by CI (rule 11 `[R-DIST]`), `base: './'`. |
| D-6 | **Light only** (Observatory tokens); tokens structured so dark can be added later | `src/app.css` `:root` ported from `shared.css`; the accessibility-audit skill scopes to one surface. Requires: tokens only in components (rule 4 `[R-TOKENS]`). |
| D-7 | **Single worksheet + saved views** (localStorage + URL hash). Dashboards later | `views.svelte.ts`, `url-codec.ts`, `SavedViews` dialog. Dashboards and multiple sheets are out of scope for v0.1 (§2 below). |
| D-8 | **None in MVP** (aggregations only). Contract leaves a `calcFields` slot | `VizSpec` carries no calculated-field logic; the slot is reserved in `types.ts` so adding it is additive. |
| D-9 | **Catalog + "Open CSV from device"** (parsed in-browser, never uploaded) | `DatasetPicker` with both sources (`DatasetEntry.source: 'catalog' \| 'local'`); `data/manifest.json` for the catalog. Requires: no upload path, no server beyond the stdlib launcher. |
| D-10 | **Observatory** (market-simulator fuel/ISO colors), with name-based auto-mapping for fuel/zone/ISO-like values | `src/lib/palette/categorical.ts` and `pick.ts`; `docs/PALETTES.md` §3–§4. Requires: fixed hue order, color follows the entity (rule 7 `[R-PALETTE]`); the set ships with a labels-required note because it fails the adjacent-pair CVD check (`PALETTES.md` §5). |
| D-11 | **Chart-first with bottom sheets** for Data / Shelves / Marks; tap-pill-then-tap-shelf drop | The phone layout (< 900px), `BottomSheet`, the drag controller's tap fallback and keyboard "Add to…" menu; 44px touch targets. |
| D-12 | Ship a **palette registry**: monotone sequential ramps, temperature diverging ramps, complementary and other categorical sets, custom per-category overrides | `src/lib/palette/registry.ts`, `sequential.ts`, `diverging.ts`; `PaletteSelection.overrides`; `docs/PALETTES.md`. Requires: sequential and diverging ramps monotone in OKLCH lightness by construction. |

Implied by the cards, not separately carded (plan §2): PapaParse for CSV
parsing; Vitest for JS tests, pytest for Python; `base: './'` in Vite so one
`dist/` serves from Pages (`/data-viz-tool/`) and the local server; no
dual-axis chart in MVP (two measures → two charts or small multiples).

## 2. Out of scope for v0.1 (recorded, not forgotten)

Dashboards and multiple sheets (D-7); calculated fields (D-8, slot reserved);
dual axis; Pages shelf; geographic types and maps; dark theme (D-6, tokens
ready); Parquet or JSON input; any server-side persistence. A lane that needs
one of these writes a `DECISION-CARD`, it does not build it.
