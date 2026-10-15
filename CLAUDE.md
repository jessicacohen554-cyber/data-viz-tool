# data-viz-tool — Claude Code Instructions

Concise answers: lead with the result, expand only when asked. Copy-paste
artifacts (shard prompts, commands, configs, commit messages) go whole, in one
fenced block, never built up across turns.

**Where things are.** This file holds the rules and the shape of the app. The
module map is `docs/ARCHITECTURE.md`; the contract every module codes against
is `src/lib/core/types.ts`, narrated in `docs/VIZSPEC.md`; owner rulings are
`docs/DECISIONS.md`; session records (DECISION-CARD / FINDING / PRECOMMIT /
RESULT / HANDOFF) live under `docs/records/<lane>/`.

## What this is

A Tableau-style, browser-only data-visualization tool: drag field pills onto
shelves, Tableau's data-type and formatting semantics, 33 chart types, reading
only `.csv` files from `data/datasets/` (or a file opened from the
device, parsed in-browser, never uploaded). It deploys to GitHub Pages for
phone prototyping and runs on a desktop by double-clicking `run-viz.bat`.
~500K-row files must stay lag-free (`docs/ARCHITECTURE.md` §9 budgets).

## Stack

Vite 8 + Svelte 5 (runes) + TypeScript 5; Vitest 5; Apache ECharts 6 via
`echarts/core`, tree-shaken; PapaParse 5.7. Scripts and the launcher are
Python 3.11+ **stdlib only**; `tests/py` is pytest. **FORBIDDEN:** any second
chart library, CSS frameworks or UI kits, jQuery, server runtimes beyond
stdlib Python, `Date.parse` on free text. There is no ESLint: the framework-free
boundary is a Vitest test (`tests/boundary.test.ts`).

## Architecture

```
index.html · src/main.ts · src/App.svelte · src/app.css (Observatory tokens; light only)
src/lib/core/      types.ts (THE contract) constants spec-defaults validate-spec query-of url-codec
src/lib/data/      protocol column-store type-inference date-parse csv-loader filters engine data-client
src/lib/format/    number-format date-format formatter
src/lib/palette/   registry categorical sequential diverging validate pick
src/lib/charts/    echarts-setup registry show-me spec-builder option-common transforms types/<chart>.ts
src/lib/stores/    spec · dataset · query · views · ui  (*.svelte.ts, runes)
src/lib/ui/        shelves/ drag/ fields/ chart/ dialogs/ shared/  (.svelte; the only Svelte besides App)
src/workers/data.worker.ts   message router around lib/data (no DOM)
src/lib/**/*.test.ts · tests/{fixtures,perf,py} · tests/boundary.test.ts
data/datasets/*.csv (the catalog, repo root — never copied into dist/) · data/manifest.json (GENERATED, committed)
scripts/build_manifest.py · scripts/convert_keeper_bundle.py · scripts/validate_palette.js
tools/launcher.py (127.0.0.1:8766) · run-viz.bat · run-viz.sh · dist/ (COMMITTED, CI-written)
docs/ ARCHITECTURE VIZSPEC TABLEAU-SPEC CHARTS PALETTES DECISIONS shards/ records/
```

## Non-negotiable rules

Stable IDs; ordinals never renumber. A new rule is appended, never inserted.

1. `[R-SPEC]` **`VizSpec` is the single source of truth**; no viz state lives outside the store; every change goes through `spec-store.patch`.
2. `[R-PURE]` **`lib/core`, `lib/data`, `lib/format`, `lib/charts` are framework-free TypeScript with no DOM access**; Svelte owns only `lib/ui` and `lib/stores`.
3. `[R-WORKER]` **No parsing or aggregation on the main thread**; the worker never imports DOM or ECharts.
4. `[R-TOKENS]` **No hardcoded colors, sizes or fonts in components**; `tokens.css` only (port of R-NO-MAGIC).
5. `[R-TABLEAU]` **Type, role, continuity, aggregation and format semantics follow `docs/TABLEAU-SPEC.md`**; a deviation is documented there before it is coded.
6. `[R-PERF]` **§9 budgets are acceptance criteria**; a PR that regresses `tests/perf` fails.
7. `[R-PALETTE]` **Categorical hues are assigned in fixed order and never cycled; color follows the entity**; every shipped categorical set passes the validator or carries a labels-required note.
8. `[R-DOCSTRING]` **Every exported function and module carries a JSDoc/docstring.**
9. `[R-DELETE]` **Deleted means deleted**: dead code and knobs are removed, not hidden.
10. `[R-PUSH]` **Core files are never bulk-rewritten over the API**; verify the remote blob (line count + hash) after any push touching a file ≥ 300 lines; never commit a placeholder or partial file.
11. `[R-DIST]` **`dist/` is generated and written only by `build-dist.yml` on `main`**; PRs never touch it.
12. `[R-DATA]` **`data/datasets/` is append-only in a session**; never delete a dataset without an owner ruling; provenance README beside every shipped CSV.
13. `[R-ACTIONS]` **Workflows are durable infrastructure only** (CI, Pages, dist build); never a per-task workflow or a cron without owner sign-off.
14. `[R-SHARD]` **The parent orchestrates and integrates**; a shard gets one branch `claude/<shard>`, a pinned 40-char SHA, an owned-file list, hard stops, forbidden commands and a required report; a shard that stops with a clear report is a success, one that repairs infrastructure is a failure.
15. `[R-SHARD-ARCHIVE]` **Archive a shard the moment the parent has fetched and verified its branch**; sweep every shard before the session ends and name any left alive.
16. `[R-RECORDS]` **Decision cards, findings and results live in `docs/records/<lane>/<TYPE>-<topic>-<date>.md`**; rulings are copied verbatim into `docs/DECISIONS.md`; `CHANGELOG.md` entry per merged lane.
17. `[R-TRUTH]` **Code is the source of truth**; when docs and code disagree, fix the docs.

## Conventions

TS and CSS files `kebab-case`; Svelte components `PascalCase.svelte`; Python
`snake_case.py`. Exported names: `camelCase` functions, `PascalCase` types,
`SCREAMING_SNAKE` constants. Tests sit next to the module (`x.test.ts`) except
`tests/{fixtures,perf,py,boundary.test.ts}`. Branches `claude/<lane>`;
commits imperative present tense. Details: `CONVENTIONS.md`.

## Git and pushing

Start every branch fresh on `origin/main`. `git push` for normal packs; small
multi-file text commits may use `mcp__github__push_files` (never `dist/`,
never a CSV). After any push touching a file ≥ 300 lines, verify the remote
blob (line count + hash) before reporting (rule 10). A session cannot delete
a remote branch (403): report leftovers for the owner. Never `git add -A`.

## GitHub Actions

Private repo, billed minutes. Workflows are durable infrastructure only
(rule 13): `ci.yml` on pull requests, `deploy-pages.yml` and `build-dist.yml`
on `main`. Never offload a one-off chore to CI; never a cron without owner
sign-off. `dist/` is written on `main` by `build-dist.yml` as `Rebuild dist
[skip ci]`; `data/manifest.json` is written by `npm run manifest` and committed
with the dataset it describes (the launcher regenerates it on start).

## Testing

`npm test` on every edit; `npm run check && npm test && python -m pytest
tests/py -q` before push (the `prepush-gate.sh` hook refuses a push when
`check` or `vitest` fails). `PERF=1 npm run perf` asserts the §9 budgets on
the full ERCOT file. A test asserts behaviour, never a snapshot of a number
it did not compute. Trivial fixtures first (3 rows, 2 columns), then scale.

## Reference docs

`docs/README.md` (index) · `docs/ARCHITECTURE.md` · `docs/VIZSPEC.md` (the
contract, narrated) · `docs/TABLEAU-SPEC.md` · `docs/CHARTS.md` ·
`docs/PALETTES.md` · `docs/DECISIONS.md` · `docs/shards/S<n>.md` ·
`docs/records/README.md` · `CHANGELOG.md`.

**Code is the source of truth.** When docs and code disagree, fix the docs
(`/sync-docs`). When the contract is ambiguous, `src/lib/core/types.ts` wins.
