> Status: RECORD (frozen 2026-10-18)

# RESULT — performance budgets (ARCHITECTURE §9) re-measured after v0.2 (T1–T5 + T6)

**For:** the owner and the parent session. **From:** shard T6 (integration
v2), branch `claude/t6-integration-v2` from `739a5eb`; measured at the branch
head that carries this file (see `git log`; the previous record is
`docs/records/s6/RESULT-perf-2026-10-16.md`, v0.1 at `603eecd`).

Not done: no code was tuned for these numbers; no dataset changed; no CI
workflow was added; Lighthouse was **not** run (not installed in the shard
container). The PRECOMMIT criteria are the §9 budgets, unchanged.

## 1. How it was measured

| Probe | Command | Environment |
|---|---|---|
| Engine (Node) | `PERF=1 npm run perf` → `tests/perf/engine-430k.test.ts` + `tests/perf/percentile-bands-430k.test.ts` (T1) | Node 22.22, Vitest 5, the shard's Linux container (shared CPU) |
| App (Chromium) | `npm run build && E2E_BASE_URL=http://127.0.0.1:8772/ node tests/e2e/perf-430k.mjs` | Playwright (global), Chromium 1194 at `/opt/pw-browsers`, built `dist/` served by `tools/launcher.py` |
| Smoke timings | `node tests/e2e/smoke.mjs` (desktop 1280×800, phone 390×844 touch) | same |

File: `data/datasets/ercot-system-hourly-2019-2025.csv`, 32.6 MB, 429,240
rows × 15 columns. One run each, single-shot except the engine's medians.
"Phone" is 390×844 with Chrome DevTools CPU throttling ×4 on the renderer
main thread (the worker is not throttled: its `elapsedMs` on "phone" equals
desktop).

One probe change since v0.1: the first drop is `weekday`, not `zone`. T1's
inference gives `zone` the ERCOT-zone geographic role, so `zone × price` now
opens as a filled map (Show Me's Automatic mark) and would time the layer
fetch instead of a bar re-render. The 3-dim group-by is `weekday × YEAR ×
zone` (7 × 7 × 7 = 343 groups) instead of `zone × YEAR × weekday`; same work.

## 2. Numbers against the budgets

| Budget (§9) | Desktop budget | Desktop measured | Phone budget | Phone measured (×4 CPU) | Verdict |
|---|---|---|---|---|---|
| Parse + build, 500K × 12 | ≤ 2.5 s | engine **1.84 s** (parse + build, Node; v0.1: 1.64 s); app 1.88 s card click → fields in (incl. the 32.6 MB fetch from localhost; v0.1: 1.86 s) | ≤ 8 s | app 2.94 s (v0.1: 2.39 s) | **met** |
| 3-dim group-by on 500K | ≤ 40 ms | engine warm median **13.2 ms** (runs 12.7–14.0; v0.1: 12.4), cold 62 ms with derived date parts computed; app single-shot 343 groups 54 ms (v0.1: 49) | ≤ 120 ms | app 55 ms | **met** by the asserted warm gate; the browser one-shot is 14 ms over the desktop figure for the same reason as v0.1 (§3) |
| Pill drop → re-render | ≤ 100 ms | 2nd pill → first bar **92 ms** (worker 12; v0.1: 82); 3rd pill 75 ms (worker 37); 4th pill 90 ms (worker 54) | ≤ 250 ms | 2nd pill → first bar **403 ms** (worker 12; v0.1: 446); 3rd 102 ms (worker 28); 4th 116 ms (worker 55) | desktop **met**; phone first paint over budget, later repaints met — unchanged from v0.1 (§3) |
| Percentile bands (envelope, D-15), 5 levels over 429K rows × 24 groups | ≤ 150 ms (T1's gate) | engine **49.6 ms** median of 5 (44–65); six P-aggregations in one bucketing 38 ms | — | app: envelope by HOUR(timestamp) on the 61K-row 2024 file, worker 17 ms, drop → painted 0.5–0.7 s incl. the chart switch | **met** |
| 100K-point scatter first paint | < 300 ms | not measured | — | — | **open** (as in v0.1) |
| Pan on that scatter | 60 fps | not measured | — | — | **open** |
| Mobile caps | — | — | 1M rows, 20K groups, 5K categories | in `constants.ts`, applied; not exercised by a 430K file | n/a |

Other engine figures from the same run: `median + countd` 106 ms (v0.1: 76;
the container CPU, not a code path change — the medians above moved < 1 ms),
filtered group-by with the mask built cold 33 ms (v0.1: 20).

## 3. What the numbers do and do not imply

- **Desktop drop → bar 92 ms vs 82 ms** in v0.1 is the bundle: the v0.2
  chart layer (maps, decorations, style pass, icons) adds ~200 KB of JS and
  ECharts modules that are registered at start, so the first `init` and
  option build are a little heavier. It is within budget and within the
  run-to-run noise of a shared container (the three later drops are 75–90 ms).
- **Phone first chart paint 403 ms vs 250 ms**: the same one-time
  `echarts.init` + module warm-up cost under a ×4-throttled main thread that
  v0.1 recorded (446 ms); the following repaints are 102 and 116 ms. The two
  options from the v0.1 record still stand: state the budget as steady-state
  re-render, or pre-warm ECharts on an offscreen host when the dataset loads.
- **3-dim group-by one-shot 54 ms** is a first execution of that plan in a
  warm worker (derived `weekday` / `YEAR` lookups' first touch); the asserted
  gate is the warm median (13 ms). Unchanged reading from v0.1.
- **Bands** are the v0.2 addition the worker computes: one type-7 percentile
  vector per level over the measure's rows per group, 50 ms for 5 levels on
  429K rows. The envelope's P5–P95 / P25–P75 toggles are new query keys (the
  levels are part of `queryKey`), so each toggle is one such pass, cached
  afterwards in the client's LRU.
- **Scatter budgets** remain unmeasured; the proposal from v0.1 (a
  disaggregated `demand_mw × price_usd_mwh` scenario sampling rAF intervals
  during a `dataZoom` pan) still applies.

## 4. Shell paint (Lighthouse proxies)

| Metric | Desktop | Phone (×4 CPU) | v0.1 desktop / phone |
|---|---|---|---|
| First contentful paint | 672 ms | 852 ms | 640 / 712 |
| Largest contentful paint | 836 ms | 852 ms | 824 / 712 |
| Long-task blocking (sum of task time over 50 ms, a TBT proxy) | 153 ms | 617 ms | 85 / 465 |
| JS transferred (launcher serves `.js` uncompressed) | 1,291,095 B | same | 1,074,240 B |
| `assets/index.js` minified / gzip | 1,289,769 B / 420,377 B | | 1,075,097 B / ~357 KB |

The bundle grew 20 % with the v0.2 chart layer; the blocking-time proxy on
the phone emulation grew with it (465 → 617 ms). A Lighthouse mobile score
≥ 80 is still unverified; code-splitting the chart types (dynamic `import()`
per `ChartDef`, modules registered on first use) remains the lever if it
falls short, and is a `lib/charts` change outside T6's scope.

## 5. Smoke timings (functional pass, `tests/e2e/smoke.mjs`)

Both viewports PASS with zero console errors (final run at the branch head).
Wall-clock milliseconds, single run:

| Step | Desktop | Phone |
|---|---|---|
| page load → dataset picker open | 1031 | 737 |
| pick the 2024 file → loaded | 860 | 849 |
| two drops → Automatic filled map painted (zones layer fetched) | 706 | 522 |
| switch to Line / Heatmap / Treemap → painted | 71–80 | 62–98 |
| hash restore in a new page → treemap painted | 568 | 648 |
| filled map (AVG by zone, layer cached) → painted | 159 | 177 |
| envelope by hour, percentile bands (query + paint) | 570 | 709 |
| combo with dual axis → painted | 189 | 201 |
| open `plants.csv` from device → loaded | 55 | 29 |
| symbol map from lat/lon (icons, zones layer) → painted | 180 | 222 |

## 6. Artifacts

- `tests/perf/engine-430k.test.ts`, `tests/perf/percentile-bands-430k.test.ts` — the asserted gates.
- `tests/e2e/perf-430k.mjs` — the browser probe (first drop `weekday`); prints the JSON §2 and §4 were copied from.
- `tests/e2e/smoke.mjs` — the functional smoke, v0.2 pass included; screenshots under `tests/e2e/shots/` (git-ignored) or `E2E_SHOTS`.
