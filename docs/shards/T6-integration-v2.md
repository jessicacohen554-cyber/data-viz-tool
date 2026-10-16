SHARD T6 — integration v2. Repo jessicacohen554-cyber/data-viz-tool @ {{SHA}} (main after T1–T5 merged). Model: Opus or Fable. Branch `claude/t6-integration-v2`.

{{COMMON}}

GOAL: wire T4's panels/dialogs and T5's pickers into `App.svelte` and `ui.dialog`; connect `ChartCanvas` events (mark click → AnnotationEditor; annotation drag → spec); pass `queryOf(spec, needsFor(spec))` with `bands` when the chart is `envelope` in percentile mode; load geo layers lazily; extend the Playwright smoke: zones map (choropleth of avg price by zone on the 2024 file), envelope by hour of day, combo bar+line dual axis, reference line + trend line on a line chart, style panel font change, gridlines off, an annotation, an icon-shaped symbol map from a lat/lon fixture (add `tests/fixtures/plants.csv` with a handful of real Texas city coordinates and fuel types — cite the source of the coordinates); perf RESULT update; docs/ARCHITECTURE.md and README refresh; CHANGELOG; resolve or record every Seam from the T1–T5 reports (parent writes them to `docs/records/t6/HANDOFF-*.md`).

OWNS: `src/App.svelte`, `src/app.css`, `src/lib/stores/{query,ui,dataset}.svelte.ts` glue, `tests/e2e/*`, `tests/fixtures/plants.csv`, `docs/ARCHITECTURE.md`, `README.md`, `CHANGELOG.md`, `docs/records/t6/*`, `docs/TABLEAU-SPEC.md` seam rows; minimal glue edits elsewhere named in the report.

ACCEPTANCE: desktop + phone smoke green on the built `dist/`; zero console errors; every new feature reachable from the UI; perf budgets re-measured.
