# Conventions

The non-negotiable rules and the architecture live in [`CLAUDE.md`](CLAUDE.md).
This file holds the conventions that are too detailed for it.

## Files and names

| Thing | Convention | Example |
|---|---|---|
| TypeScript module | `kebab-case.ts`, one concern per file | `src/lib/data/type-inference.ts` |
| Svelte component | `PascalCase.svelte`, one component per file | `src/lib/ui/shelves/PillMenu.svelte` |
| Runes store | `name.svelte.ts` under `src/lib/stores/` | `spec.svelte.ts` |
| CSS | `kebab-case.css`; tokens only in `src/app.css` `:root` | `--pill-discrete` |
| Python | `snake_case.py`; stdlib only; `from __future__ import annotations` | `scripts/build_manifest.py` |
| Unit test | `<module>.test.ts` next to the module | `engine.test.ts` |
| Fixture | `tests/fixtures/<topic>.<ext>`, ≤ 50 rows | `tests/fixtures/dates-ambiguous.csv` |
| Chart type file | `src/lib/charts/types/<chart-id>.ts`, id = registry id | `bar-stacked-100.ts` |
| Palette id | `kebab-case`, kind prefix for ramps | `seq-sky`, `div-cool-warm`, `observatory` |
| Record | `docs/records/<lane>/<TYPE>-<topic>-<date>.md` | `docs/records/s1/FINDING-date-ambiguity-2026-10-16.md` |

Exported identifiers: `camelCase` functions, `PascalCase` types and interfaces,
`SCREAMING_SNAKE_CASE` constants. No default exports except a `.svelte` file.
No `any`; `unknown` plus a type guard. Typed arrays over object arrays on the
data path (`Int32Array`, `Float64Array`, `Uint8Array`).

## Imports

- Path aliases from `tsconfig.json`: `$core`, `$data`, `$format`, `$palette`,
  `$charts`, `$stores`, `$ui`. Relative imports only inside one directory.
- `lib/core`, `lib/data`, `lib/format`, `lib/palette`, `lib/charts` never import
  `svelte`, `$stores`, `$ui`, or touch `document` / `window` (rule 2
  `[R-PURE]`, enforced by `tests/boundary.test.ts`). `lib/charts` may import
  `echarts/core`; `lib/data` may not.
- ECharts: `echarts/core` plus the exact components and renderers a chart needs,
  registered in `src/lib/charts/echarts-setup.ts` and listed in each
  `ChartDef.echartsModules` (a test cross-checks the two).
- URLs: `import.meta.env.BASE_URL` always; a literal `/data/` never appears in
  `src/lib` (base is `./`, so one `dist/` serves locally and on Pages).

## Comments and docs

- Every exported function, type and module has a JSDoc (rule 8). A module's
  JSDoc says what it owns and what it must not import.
- A deviation from Tableau is written into `docs/TABLEAU-SPEC.md` **before** it
  is coded (rule 5), in the "Documented deviations" table.
- Cite rule IDs (`[R-WORKER]`), not rule history, in code and docs.

## Git

- Branches `claude/<lane>` (`claude/s1-data-engine`), cut from `origin/main`
  (a shard from its pinned SHA). Commits imperative present tense, ≤ 72-char
  subject, body says *why*.
- Never `git add -A`; stage named paths. Never commit `dist/` or
  `node_modules/` from a session; `dist/` is written on `main` by
  `build-dist.yml` only (rule 11). `data/manifest.json` is regenerated with
  `npm run manifest` and committed together with the dataset it describes.
- A CSV under `data/datasets/` is added, never edited in place or deleted,
  without an owner ruling (rule 12); its provenance README is updated in the
  same commit. The catalog lives at the repo root, not under `public/`, so
  Vite never copies it into `dist/`; Pages gets it by `cp -r data dist/data`
  in `deploy-pages.yml`, and the launcher overlays it on `dist/`.

## Dependencies

`package.json` pins the stack named in `CLAUDE.md`; adding a runtime dependency
is an owner decision (the FORBIDDEN list is closed, the allowed list is short).
`npm ci` only; never `npm install <pkg>` on a shard branch. Python has no
third-party dependencies anywhere except the one-off
`scripts/convert_keeper_bundle.py`, which documents its throwaway venv.
