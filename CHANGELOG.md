# Changelog

## 2026-10-18 — t6-integration-v2: every v0.2 feature reachable, seams closed, smoke and perf re-run

Branch `claude/t6-integration-v2` from `739a5eb` (T1–T5 merged). Parent-level contract fixes:
`transferablesOf` lists `result.bands` (the worker's local `bandBuffersOf` is gone),
`LoadRequest.typeOverrides` names `geoRole`, `ChartNeeds.bands { levels, measureKey? }` is emitted
as `plan.bands` by `queryOf` and enters the query key, and `needsFor(spec)` passes
`envelopeLevels(spec)` for an envelope in percentile mode — so the envelope's P5–P95 / P25–P75
bands are computed by the worker from the rows of each x. Deleted: T2's `stats-shim.ts`
(`decorations.ts` uses `lib/data/regression` + `lib/data/stats`) and the geo name fallback in
`map-common.ts` (`geoRoleFor` is override → inferred → none; `arrangeFor` takes `meta`); one Svelte
mount helper remains (`src/lib/ui/shared/svelte-mount.test.ts`). `App.svelte` wires the field
menu's geographic role to `dataset.setGeoRole` (store-only: the chart layer reads the override
first, the worker re-applies it on the next load — no reload), a mark click to the annotation
editor, an annotation drag to the spec, and a **Format ▾** menu (chart head; the same entries as
buttons in the phone Marks sheet) hosting the style panel, the X / Y / secondary-Y axis dialogs,
reference lines, the trend line and the annotation list. `PaletteDialog` groups the 67 palettes by
`PALETTE_FAMILIES`. Chart-layer fixes found by the smoke: a latitude/longitude-only map draws on
the US states layer by default and fits its view to the points (the US layer spans the
antimeridian through Alaska and drew Texas 100 px wide); with coordinates a Detail dimension
labels the marks instead of being joined to regions; a lone secondary-axis measure (its primary
pill removed) draws on the primary axis instead of an empty 0–1 right axis. QA:
`tests/e2e/smoke.mjs` extended with the v0.2 pass (filled map of AVG(price) by zone + bubble /
symbol marks, envelope by hour with a band toggled, combo with dual + synchronized axes, line with
reference and trend lines, style-panel font change, gridlines off, an annotation by clicking a
bar, an icon symbol map from `tests/fixtures/plants.csv` opened from the device on the ERCOT zones
layer); `zone` × `price` now opens as a filled map (Show Me's Automatic mark with the inferred
role), so the smoke expects that and `perf-430k.mjs` drops `weekday` first to keep timing a bar.
Perf re-measured in `docs/records/t6/RESULT-perf-2026-10-18.md`. Docs: ARCHITECTURE (v2 engine,
charts, UI, QA), TABLEAU-SPEC §1.1 / §3 / §5 / §10 (geographic roles, percentiles and dual axis are
shipped), CHARTS §9 (seams → integration notes), README.


`VizSpec` is now version 2 (v1 specs migrate on load): `Pill.axis`, `axes.y2` + `synchronized`, `StyleSpec`, `referenceLines`, `trendLine`, `annotations`, `envelope`, `geoLayer`; `Aggregation` gains P5/P10/P25/P75/P90/P95; `FieldMeta.geoRole`; `MarkSettings.shapeSet/shapeOverrides/mapMark/markByAxis`; `QueryPlan.bands`. Six chart ids are declared pending registration (`PENDING_CHART_TYPE_IDS`). Owner rulings D-13…D-19 in `docs/DECISIONS.md`. Map assets under `public/geo/` and icon sets under `src/lib/icons/` arrive with this entry.
## 2026-10-16 — s6-integration: the working app, browser smoke, perf result

Branch `claude/s6-integration` from `80a1545`. `src/App.svelte` replaces the S0 skeleton: TopNav
slots host the dataset picker, saved views and export menu; FieldPanel, ShelfPanel + Marks and
ChartCanvas fill the three desktop panes; phones get Data / Shelves / Marks / Chart bottom sheets.
Boot restores a URL-hash spec by loading its catalog dataset, else opens the picker; dialog state
lives in `ui.dialog`; an empty text-table worksheet shows the raw first 200 rows through
`client.rows()`; a drop on it switches to the Show Me suggestion (Tableau's Automatic mark).
Seams closed from the S1–S5 handoff (`docs/records/s6/HANDOFF-s6-integration-2026-10-16.md`):
load requests and query plans are `$state.snapshot`ed before `postMessage` (a Svelte proxy cannot
be cloned — the picker's manifest and the spec's `filters` both reached the worker as proxies);
`ui.toast` reads its list untracked so effects may toast; `ChartCanvas` keeps its ECharts instance
in `$state.raw` so the option effect runs once `init` has happened (host div and first result land
in the same flush); the query store refines plan needs with `needsFor(spec)`; `vite.config.ts`
resolves the `$core`/`$stores`/… aliases for Vitest. QA: `tests/e2e/smoke.mjs` (Playwright,
pre-installed Chromium, desktop 1280×800 and phone 390×844 against the built `dist/` served by
`tools/launcher.py`: pick the 2024 file, drop `zone` and `price_usd_mwh` with synthetic pointer
events, bar → line → heatmap → treemap, hash round-trip, CSV export, saved view) and
`tests/e2e/perf-430k.mjs` (in-browser timings on the 430K-row file). Perf recorded in
`docs/records/s6/RESULT-perf-2026-10-16.md`. Docs: `docs/ARCHITECTURE.md` completed, TABLEAU-SPEC
seam rows (`yyyy-MM-dd'T'HH:mm`, top values 20, decimals 0–10, filter-drop defaults), README
with screenshots.

## 2026-10-15 — s0-foundation: scaffold, contract, tooling, docs

The foundation shard of the build plan (`docs/records/s0/DECISION-CARDS-build-plan-2026-10-15.md`;
owner rulings D-1…D-12 in `docs/DECISIONS.md`). Scaffold: Vite 8 + Svelte 5 (runes) +
TypeScript 5, Vitest 5, ECharts 6 via `echarts/core`, PapaParse 5.7, `base: './'` so one
`dist/` serves from the launcher (`127.0.0.1:8766`) and from GitHub Pages. The contract
`src/lib/core/types.ts` (`VizSpec`, `Pill`, `FilterSpec`, `FormatSpec`, `QueryPlan`,
`QueryResult`) is frozen for S1–S5 and narrated in `docs/VIZSPEC.md`; every cross-shard path
carries a one-line stub. Data: the four ERCOT CSVs converted from the market-simulator keeper
bundle with a provenance README, in `data/datasets/` at the repo root (not `public/`, so Vite
never copies the ~43 MB into the committed `dist/`); `scripts/build_manifest.py` writes the
committed `data/manifest.json`. Tooling: `tools/launcher.py` (stdlib, serves `dist/` + `data/`, regenerates the
manifest, `GET /api/manifest`), `run-viz.bat` / `run-viz.sh` (build if Node, else serve
`dist/`). Workflows (durable only): `ci.yml` on PRs (`check`, `test`, `build`, `pytest`, dist
untouched), `deploy-pages.yml` (builds, copies `data/` beside the build) and `build-dist.yml` on `main`
(commits `dist/` as `Rebuild dist [skip ci]`). `.claude/`: `session-start.sh` (remote only: `npm ci`,
blobless fast-forward of `main`), `prepush-gate.sh` (refuses `git push` / `push_files` when
`npm run check` or `vitest` fails; check-only, never writes), skills `sync-docs` and
`accessibility-audit` ported and re-mapped. Governance: `CLAUDE.md` with rules R-SPEC…R-TRUTH
(stable IDs 1–17), `CONVENTIONS.md`, `docs/{README,ARCHITECTURE (skeleton),TABLEAU-SPEC,CHARTS,
PALETTES,DECISIONS}.md`, `docs/records/README.md`. One departure from the plan text, recorded
here: the framework-free boundary (plan §4 `eslint.config.js`, §12 `npm run lint`) is enforced
by a Vitest test, `tests/boundary.test.ts` — there is no ESLint in the stack. Palette
validation measured against the dataviz validator thresholds is recorded in `docs/PALETTES.md`
§5: the Observatory default set ships with a labels-required note (rule 7), as plan §8 allows.
