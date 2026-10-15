# Changelog

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
