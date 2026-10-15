> Status: RECORD (frozen 2026-10-15)

# DECISION CARDS — build plan: the twelve cards ruled in the planning session

**For:** every shard (S1–S6) and the owner. **From:** the planning session,
2026-10-15, before any code existed (the repo held one commit, an empty
`README.md`). **No code, no data, no workflow was touched by the cards
themselves**; they fix the choices the plan
(`/root/.claude/plans/draft-a-comprehensive-plan-structured-sonnet.md` §2)
builds on. Rulings are copied verbatim into
[`../../DECISIONS.md`](../../DECISIONS.md) and cited as `D-n`.

The cards were presented in-session; the plan records the question and the
ruling. The **options** column below lists the alternatives the plan text
itself names (the ruling's own wording, §2's implied notes, §16's out-of-scope
list). Where the plan names none, the column says so — nothing is
reconstructed from memory.

| # | Question | Options named in the plan | Ruling (verbatim) |
|---|---|---|---|
| D-1 | Renderer | ECharts (canvas) vs. any second chart library (closed by the FORBIDDEN list); SVG vs. canvas | **Apache ECharts** (canvas), tree-shaken via `echarts/core` |
| D-2 | Data engine | Custom columnar engine in a worker vs. a dependency; main-thread vs. worker | **Custom columnar engine** in a Web Worker (dictionary-coded Int32 + Float64), zero deps |
| D-3 | Dummy data | Slim only, full only, or slim + full (sizes shown) | **Slim + full**: 3 small ERCOT CSVs for phone + the full 430K-row system-hourly 2019–2025 as stress test, sizes shown in picker |
| D-4 | Framework | A build-step framework (Vite + Svelte 5 + TS) vs. no build step | **Vite + Svelte 5 + TypeScript** (build step) |
| D-5 | Launcher | Require Node; serve a committed `dist/` with Python only; build when Node exists else serve `dist/` | **Build if Node, else serve `dist/`**: `run-viz.bat` builds when Node exists, then serves `dist/` with stdlib Python; `dist/` is committed and rebuilt by CI on merge to `main` |
| D-6 | Theme | Light only; light + dark; dark later (tokens structured for it) | **Light only** (Observatory tokens); tokens structured so dark can be added later |
| D-7 | MVP scope | Single worksheet + saved views; dashboards (later) | **Single worksheet + saved views** (localStorage + URL hash). Dashboards later |
| D-8 | Calculated fields | None in MVP (slot reserved) vs. calcs in MVP | **None in MVP** (aggregations only). Contract leaves a `calcFields` slot |
| D-9 | Local files | Catalog only; catalog + open-from-device (in-browser, never uploaded) | **Catalog + "Open CSV from device"** (parsed in-browser, never uploaded) |
| D-10 | Default categorical palette | Observatory (market-simulator fuel/ISO colors) with name matching; not recorded otherwise | **Observatory** (market-simulator fuel/ISO colors), with name-based auto-mapping for fuel/zone/ISO-like values |
| D-11 | Phone layout | Chart-first with bottom sheets; tap-pill-then-tap-shelf as the drop fallback; not recorded otherwise | **Chart-first with bottom sheets** for Data / Shelves / Marks; tap-pill-then-tap-shelf drop |
| D-12 | Palette library (owner add, mid-session) | A registry of ramp kinds (monotone sequential, temperature diverging, complementary categorical, per-category overrides) vs. a single default palette | Ship a **palette registry**: monotone sequential ramps, temperature diverging ramps, complementary and other categorical sets, custom per-category overrides |

## What the rulings jointly fix

- The contract `src/lib/core/types.ts` (plan §5) is frozen by S0 before any
  other shard starts; `calcFields` (D-8) is a reserved slot, not a feature.
- The boundary between Svelte and the rest (D-4 + rule 2) and the worker
  boundary (D-2 + rule 3) are enforced by tests, not by convention.
- `dist/` is committed (D-5) and therefore CI-written only (rule 11); the
  catalog lives at `data/` so it never enters `dist/`.
- Out of scope for v0.1, by these rulings and plan §16: dashboards, calculated
  fields, dual axis, Pages shelf, geographic types, dark theme, Parquet/JSON
  input, server persistence.

## Not done here

No shard was launched by this record. No dataset was converted by it. The
plan's `eslint.config.js` (§4) and `npm run lint` (§12) were replaced in the
scaffold by `tests/boundary.test.ts`; that is an S0 implementation choice
recorded in `CHANGELOG.md`, not a ruling, and it changes no card.

*(s0, 2026-10-15. Zero code. The cards carry the choices; the plan carries the build.)*
