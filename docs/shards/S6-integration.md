SHARD S6 — integration + QA. Repo jessicacohen554-cyber/data-viz-tool @ {{SHA}} (main after S1–S5 are merged). Model: Opus or Fable. Branch `claude/s6-integration`.

{{COMMON}}

GOAL: wire the shards into the running app, pass the mobile layout, measure the performance budgets on the 430K-row file, and write the architecture doc.

OWNS: `src/App.svelte` (final wiring: TopNav slots → DatasetPicker/SavedViews/ExportMenu; FieldPanel; ShelfPanel + MarksCard; ChartCanvas; dialogs host; bottom sheets), `src/app.css` §4 (mobile pass only), `docs/ARCHITECTURE.md` (complete the skeleton: module map, worker protocol, effect pipeline, perf numbers measured), `README.md` (screenshots), `docs/records/s6/RESULT-perf-<date>.md`, `tests/e2e/*` (Playwright against the built `dist/` using the pre-installed Chromium at `/opt/pw-browsers/chromium`: desktop 1280×800 and phone 390×844; load the 2024 file, drop `zone` on Columns and `price_usd_mwh` on Rows via synthetic pointer events, assert a canvas renders, switch bar → line → heatmap → treemap, round-trip the URL hash).

CONSUMES: everything.

ACCEPTANCE: `npm run build` then `python3 tools/launcher.py --no-browser` serves a working app; perf budgets from plan §9 met and recorded; no console errors on load; Lighthouse mobile performance ≥ 80 on the shell; every `Seams` item from the S1–S5 reports resolved or listed in the RESULT with a proposed fix.
