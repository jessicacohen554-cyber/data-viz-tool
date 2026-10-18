> Status: ACTIVE

# HANDOFF — T6 integration v2

**For:** the T6 integration shard. **From:** the parent session, 2026-10-18.

State: contract v2 on `main`; T1 (engine v2), T2 (charts v2), T5 (geo & mark UI) merged; T3 (palette families) and T4 (formatting UI) merge when they land (their seams are appended below by the parent). `npm run check` 0 errors, `npm test` 788/788 after T1+T2. Deploy ordering guard added to `deploy-pages.yml` (GitHub's branch-source Pages build was overwriting the Actions deploy); the durable fix is the owner switching Settings → Pages → Source to "GitHub Actions".

Parent-level contract fixes T6 should make (small, in `src/lib/core` and `src/lib/data/protocol.ts`, allowed for T6): add `bands` to `transferablesOf` in `protocol.ts`; add `geoRole?: GeoRole | null` to `LoadRequest.typeOverrides`; add `bands?: { levels: number[] }` to `ChartNeeds` in `query-of.ts` and emit `plan.bands` from `queryOf` when present; wire `needsFor(spec)` (T2) to pass envelope levels.

## T1 engine v2 — seams (verbatim)
Seams**
1. `protocol.ts` `transferablesOf` does not know `bands`; the worker appends `bandBuffersOf(reply)` locally. S0 should add `bands` to `transferablesOf`.
2. `LoadRequest.typeOverrides` (protocol.ts) lacks `geoRole`; it rides through structured clone and the loader reads it. Protocol type should gain `geoRole?: GeoRole | null`.
3. No worker request changes a geo role without a reload. `setType` re-infers it, or re-applies the load's pinned override. T5's UI must reload (or patch `typeOverrides` and reload) to apply a new geo role.
4. Geo-role design calls: 80% share threshold; header hints break ties, else `us-state` beats `country` on ambiguous 2-letter codes (CA/DE/IN); compass-only columns are ERCOT zones only under a zone header; bare 5-digit FIPS counts only under a county/FIPS header; weather-zone codes (COAST, NCENT, â¦) map onto model zones per `public/geo/README.md`; DC is included with the 50 states.
5. `pytest` is not installed in this container, so `tests/py` did not run. No Python was touched.

**Left undone**: nothing in DELIVER. TABLEAU-SPEC Â§3/Â§10 still say percentiles and geographic roles are "not shipped"; that doc is outside OWNS and is for the integrator (`/sync-docs`).", "type":"text

## T2 charts v2 — seams (verbatim)
Seams

1. **Percentile bands (envelope `percentile` mode).** `ChartNeeds` in `src/lib/core/query-of.ts` cannot ask for `QueryPlan.bands`, and the engine implements `median` but not `p05â¦p95`. The builder reads `result.bands` in `envelopeLevels(spec)` order (each band's low and high, outer first, then 50) and fails with a message naming `QueryPlan.bands` when absent. Integrator: add `bands?: { levels: number[] }` to `ChartNeeds`, emit `plan.bands` in `queryOf`, pass `envelopeLevels(spec)` from `needsFor`. `columns` mode works today.
2. **`stats-shim.ts`.** `fit()` and `summary()` with T1's exact signatures; swap the two imports in `decorations.ts` to `../data/regression` and `../data/stats` and delete the shim when T1 lands.
3. **Geo role inference.** Nothing writes `FieldMeta.geoRole` yet, so `map-common.ts` carries a whole-word name fallback (`zone`, `state`, `county`, `country`, `lat`, `lon` â¦) used only while the role is `undefined`; `null` from inference is respected. Delete it once inference lands. Show Me suggests a map only from an assigned role, never from the fallback.
4. **Annotation drag.** Handles are transparent `graphic` rects over the label's estimated box; the label moves on the next spec patch, not during the drag. `onMarkClick` and `onAnnotationDrag` are optional props, so `App.svelte` needs no change until T4 wires them.
5. **Style title.** The in-chart title comes from `style.title.text`, not `spec.title`, which the app header already shows.
6. **`REPLACE_MERGE_KEYS`** gained `geo`, `title`, `graphic`, and `requiredEchartsModules()` adds `TitleComponent`/`GraphicComponent` once for the style pass instead of on every def.

## Left undone

Nothing in DELIVER or ACCEPTANCE. `pytest` could not run (not installed); the bundle grew from 1,075,097 to 1,206,431 bytes (maps, mark and title components).", "type":"text

## T5 geo & mark UI v2 — seams (verbatim)
Seams**
1. **HEAD drift at start.** The session-start hook fast-forwarded the checkout to `e0496f5` (a `dist/`-only "Rebuild dist" commit). I branched from the pinned SHA with `git checkout -b â¦ 756fbda` (no pull/merge/rebase); the branch contains the pinned SHA only.
2. **No `browser` resolve condition under Vitest.** `import { mount } from 'svelte'` resolves to the server build and throws. The helper `svelte-mount.test.ts` imports the client runtime by file path (`node_modules/svelte/src/index-client.js`, one `@ts-expect-error`). Adding `resolve.conditions: ['browser']` when `process.env.VITEST` to `vite.config.ts` would remove that; owner/T6 call.
3. **Worker knows no geo roles.** `protocol.ts`, `data-client.ts` and inference have no `geoRole`; `dataset.setGeoRole` is store-only (no re-parse), and `applyGeoOverrides` reflects spec overrides into `meta` after load/setType. `FieldMeta.geoRole` from inference stays null until S1 adds it.
4. **Dialog hosting.** `ui.DialogState` has no `icons` / `geoLayer` kinds, so MarksCard hosts IconPicker and GeoLayerPicker with local open flags (transient UI state, not viz state). T6 may move them to `App.svelte`.
5. **No geo icon in `shared/Icon.svelte`.** FieldItem draws the globe/pin as inline SVG paths using `var(--info)`; adding `globe`/`pin` to `IconName` would let the Menu row carry it too.
6. **`defaultGeoLayer` / `defaultMapMark` / `defaultEnvelope`** live in MarksCard's module script; the charts shard must apply the same fallbacks when `geoLayer` / `marks.mapMark` / `envelope` are unset (or the spec-defaults could carry them).
7. **Latent bug fixed in an owned file.** FieldPanel passed `menu.anchor` to `Menu`, whose deferred `tick().then(place)` read it after the menu closed (TypeError, unhandled rejection). Props are now `$derived` snapshots.
8. **Map chart ids are still `PENDING_CHART_TYPE_IDS`**, so the chart-type select cannot reach `map-*` / `envelope` until the charts shard registers them; the sections render as soon as `spec.chartType` is one of them.
9. **Switching icon set clears `shapeOverrides`** (override ids belong to a set); the last envelope band cannot be removed.

**Left undone** nothing in scope. `App.svelte` wiring (`onChangeGeoRole={dataset.setGeoRole}`) is T6's.", "type":"text

## T3 palette families v2 — seams
(appended by the parent when T3 lands)

## T4 formatting UI v2 — seams
(appended by the parent when T4 lands)

## What T6 must deliver
See `docs/shards/T6-integration-v2.md`. In addition: delete T2's `stats-shim.ts` in favour of T1's `regression.ts`/`stats.ts`; delete T2's `map-common.ts` name fallback now that T1 writes `FieldMeta.geoRole`; wire T5's `onChangeGeoRole` (reload path) and T4's dialogs into `App.svelte`/`ui.dialog`; update TABLEAU-SPEC §3/§10 (percentiles and geo roles are shipped); re-measure perf; refresh ARCHITECTURE/README/CHANGELOG.
