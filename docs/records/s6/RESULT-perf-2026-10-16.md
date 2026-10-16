> Status: RECORD (frozen 2026-10-16)

# RESULT — performance budgets (plan §9) on the 430K-row ERCOT file

**For:** the owner and the parent session. **From:** shard S6 (integration),
branch `claude/s6-integration`, measured at the commit that carries this file
(see `git log` for the SHA; the app code is `603eecd` + the docs commit).

Not done: no code was tuned for these numbers; no dataset changed; no CI
workflow was added; Lighthouse was **not** run (not installed in the shard
container, no network install) — §4 gives the proxies that were measured.

## 1. How it was measured

| Probe | Command | Environment |
|---|---|---|
| Engine (Node) | `PERF=1 npm run perf` → `tests/perf/engine-430k.test.ts` | Node 22.22, Vitest 5, the shard's Linux container (shared CPU) |
| App (Chromium) | `npm run build && node tests/e2e/perf-430k.mjs` | Playwright 1.56 (global), Chromium 1194 at `/opt/pw-browsers`, built `dist/` served by `tools/launcher.py` on 127.0.0.1 |

File: `data/datasets/ercot-system-hourly-2019-2025.csv`, 32.6 MB, 429,240
rows × 15 columns (sha1 in `data/manifest.json`).

The app probe times what the user sees: a `PerformanceObserver` for paint and
long tasks on the empty shell; wall clock from the catalog card click to the
picker closing (download + parse + build in the worker); wall clock from the
drop gesture's pointer-up to the next painted frame after the result arrived
(`.chart-foot` reports the worker's `elapsedMs` and the group count). "Phone"
is 390×844, touch, `deviceScaleFactor` 2, with Chrome DevTools CPU throttling
×4 — which throttles the renderer **main thread**; the worker's own
`elapsedMs` figures on "phone" were within noise of desktop, so read them as
unthrottled. One run each; numbers are single-shot, not medians, except the
engine's warm group-by (median of 7).

## 2. Numbers against the budgets

| Budget (plan §9) | Desktop budget | Desktop measured | Phone budget | Phone measured (×4 CPU) | Verdict |
|---|---|---|---|---|---|
| Parse + build, 500K × 12 | ≤ 2.5 s | engine 1.64 s (parse + build, Node); app 1.86 s card click → fields in, incl. the 32.6 MB fetch from localhost | ≤ 8 s | app 2.39 s | **met** |
| 3-dim group-by on 500K | ≤ 40 ms | engine warm median **12.4 ms** (runs 12.0–12.8), cold 53 ms with derived date parts computed; app single-shot zone × YEAR × weekday (343 groups) 49 ms | ≤ 120 ms | app 51 ms | **met** by the gate the test asserts (warm); the one-shot browser figure is 9 ms over the desktop budget — see §3 |
| Pill drop → re-render | ≤ 100 ms | 2nd pill → first bar **82 ms** (worker 11 ms); 3rd pill 71 ms (worker 31); 4th pill 97 ms (worker 49) | ≤ 250 ms | 2nd pill → first bar **446 ms** (worker 16); 3rd 90 ms (worker 27); 4th 113 ms (worker 51) | desktop **met**; phone **first paint over budget**, later repaints met — see §3 |
| 100K-point scatter first paint | < 300 ms | not measured | — | — | **open** |
| Pan on that scatter | 60 fps | not measured | — | — | **open** |
| Mobile caps | — | — | 1M rows, 20K groups, 5K categories | caps are in `constants.ts` and applied (`maxRows`, `QUERY_LIMIT_MOBILE`); not exercised by a 430K file | n/a |

Other engine figures from the same run: `median + countd` 76 ms; filtered
group-by with the mask built cold 20 ms.

## 3. What the numbers do and do not imply

- **3-dim group-by, browser one-shot 49 ms vs 40 ms.** The engine test's
  warm median (12 ms) is the asserted gate and passes. The browser figure is
  a first execution of that plan in a worker that had run three queries,
  on a shared container CPU, so it carries JIT warm-up and the derived
  `weekday`/`YEAR` lookups' first touch; it is not evidence of a regression.
  Proposed: extend `perf-430k.mjs` to re-issue the same dimensions with a
  different aggregation (new cache key, warm worker) and report that second
  figure next to the first.
- **Phone first chart paint 446 ms vs 250 ms.** That drop creates the ECharts
  instance and the first canvas under a ×4-throttled main thread while a
  bottom sheet is open over the chart; the two following drops repaint in 90
  and 113 ms. The budget reads "pill drop → re-render"; the first-paint cost
  is `echarts.init` + module warm-up, paid once per session. Proposed: either
  state the budget as steady-state re-render (owner ruling) or pre-warm
  ECharts on an offscreen 1×1 host when the dataset loads (≈ one `init` +
  `dispose`, no option).
- **Scatter budgets** were not measured: the probe builds bars. Proposed:
  a third scenario that disaggregates `demand_mw` × `price_usd_mwh` (429K
  rows; `large` mode engages above 2K points) and samples
  `requestAnimationFrame` intervals during a `dataZoom` pan.
- All figures come from one Linux container with shared CPU; a laptop is
  faster, a mid-range phone is slower than the ×4 emulation on the worker
  side (the worker was not throttled).

## 4. Shell paint (Lighthouse proxies)

Lighthouse was not available. On the empty worksheet (picker open on boot):

| Metric | Desktop | Phone (×4 CPU) |
|---|---|---|
| First contentful paint | 640 ms | 712 ms |
| Largest contentful paint | 824 ms | 712 ms |
| Long-task blocking (sum of task time over 50 ms, a TBT proxy) | 85 ms | 465 ms |
| JS transferred | 1,074,240 B (the launcher serves `.js` uncompressed; the Vite build reports 357 KB gzip) | same |

`npm run build` warns that `assets/index.js` is 1.07 MB minified: every chart
type's ECharts modules are in one chunk. A Lighthouse mobile performance score
≥ 80 (the S6 acceptance line) is plausible on Pages (gzip, HTTP/2) but
unverified; the fix if it falls short is code-splitting the chart types
(dynamic `import()` per `ChartDef`, `echartsModules` registered on first use),
which is a `lib/charts` change outside S6's scope.

## 5. Artifacts

- `tests/perf/engine-430k.test.ts` (unchanged) — the asserted gate.
- `tests/e2e/perf-430k.mjs` — the browser probe; prints the JSON these tables
  were copied from.
- `tests/e2e/smoke.mjs` — functional smoke; its timing lines (page load →
  picker 0.5 s, 2024 file load 0.6–0.9 s, chart-type switch 64–110 ms, hash
  restore → painted 0.5–0.6 s) are consistent with the above.
