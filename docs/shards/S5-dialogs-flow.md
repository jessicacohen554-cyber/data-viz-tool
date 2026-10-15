SHARD S5 — dialogs, data flow, views. Repo jessicacohen554-cyber/data-viz-tool @ {{SHA}}. Model: Opus or Fable. Branch `claude/s5-dialogs-flow`.

{{COMMON}}

GOAL: the dataset picker (catalog + "Open CSV from device", owner decision D-9), the Format / Filter / Palette dialogs, saved views (D-7) and export, plus the three stores that wire the worker into the UI: dataset load state, the query effect pipeline, and views persistence.

OWNS:
- `src/lib/stores/dataset.svelte.ts` — `dataset.entry`, `dataset.meta: FieldMeta[]`, `dataset.rowCount`, `dataset.progress: LoadProgress|null`, `dataset.error`, `dataset.load(entry, source)`, `dataset.openLocal(file)`, `dataset.setType(field, type, dateFormat?)`, `dataset.client` (from `createDataClient()`); on load replaces `spec` with the recent spec for that dataset or a default; applies `typeOverrides`.
- `src/lib/stores/query.svelte.ts` — `$derived` queryKey from `spec.value` (+ chart needs from the registry) → `$effect` → `client.query(plan)` → `query.result`, `query.pending`, `query.error`; keys the effect on the canonical `queryKey` string so render-only changes never re-query; drops stale results.
- `src/lib/stores/views.svelte.ts` — `list(datasetId)`, `save(name, spec, thumbnail?)`, `load(id)`, `remove(id)`, `rename(id, name)` in localStorage under `STORAGE_VIEWS`; URL hash sync via `url-codec.ts` (`encodeSpec` on change debounced 300 ms; `decodeSpec` on boot).
- `src/lib/ui/dialogs/Dialog.svelte` (modal on desktop, bottom sheet on phone), `DatasetPicker.svelte` (reads `data/manifest.json` via `import.meta.env.BASE_URL + 'data/manifest.json'`, cards with size/rows and a "large" badge over 10 MB, `navigator.connection.saveData` warning, "Open CSV from device" `<input type=file>`, re-fetch button hitting `/api/manifest` when served locally), `FormatDialog.svelte` (Tableau's dialog with live preview via `makeFormatter`), `FilterDialog.svelte` (categorical list with search/all/none from `client.profile`, range slider, date range, Top N, wildcard), `PaletteDialog.svelte` (swatches grouped by kind, CVD badge, midpoint control for diverging, per-label overrides), `SavedViews.svelte`, `ExportMenu.svelte`.
- `src/lib/ui/export.ts` — `exportPng(canvasToPng, spec)`, `exportCsv(result, spec, meta)` (formatted aggregated table), `exportJson(spec)`, `importJson(file)` → validated `VizSpec`.
- Tests: stores (undo interplay, stale-result drop with a fake client), export CSV formatting, JSON import validation, views persistence with an in-memory store.

CONSUMES: `data/data-client.ts` (stub until S1; code against `DataClient`), `format/formatter.ts` and `palette/registry.ts` + `pick.ts` (stubs until S2), `charts/registry.ts` (`CHART_TYPES[id].needs`, stub until S3), `core/url-codec.ts`, `core/validate-spec.ts`, `stores/spec.svelte.ts`, `stores/ui.svelte.ts`.

ACCEPTANCE: picking a catalog entry shows a progress bar and then the field list props populated; opening a local CSV never leaves the browser; a spec change that only touches marks does not call `client.query` (test with a counting fake); a saved view round-trips through localStorage and the URL hash.
