## Common rules (included by reference in every shard prompt)

HARD STOPS — check each FIRST; if any fails, STOP and report (do not push, do not repair):
1. `git rev-parse HEAD` == {{SHA}} (never pull, rebase, merge or "sync"; a SHA cannot be raced).
2. `npm ci` succeeds and `npm run check && npm test` are green BEFORE you change anything. If not, stop and report the output.
3. You have read, in this order: `CLAUDE.md`, `docs/VIZSPEC.md`, `src/lib/core/types.ts`, `src/lib/core/constants.ts`, and the docs named in your OWNS/CONSUMES sections.

BRANCH: `git checkout -b <branch>` from the pinned SHA. Commit in imperative present tense, small commits, `git push -u origin <branch>` at each checkpoint and at the end. Never `git add -A` / `git add .`; add your owned files by name.

OWNERSHIP: edit only the files listed under OWNS. The S0 stubs inside your OWNS are yours to replace wholesale (keep the exported names and signatures exactly; other shards compile against them). Everything else is read-only. If you need a change elsewhere (a contract field, a dependency), do not make it: write it in your report under "Seams".

RULES THAT BITE HERE: R-PURE (no svelte/DOM imports under lib/{core,data,format,palette,charts}; `tests/boundary.test.ts` enforces it), R-TOKENS (CSS variables only), R-DOCSTRING (JSDoc on every export), R-DELETE, R-PERF (plan budgets), R-DIST (never touch `dist/`).

FORBIDDEN, by name: `git add -A`, `git add .`; edits outside OWNS; touching `dist/`, `.github/`, `CLAUDE.md`, `package.json` dependencies, `src/lib/core/*`, `data/datasets/*`; opening a PR; force-push; deleting anything under `data/`.

DONE WHEN: `npm run check` has 0 errors, `npm test` is green including your new tests, your branch is pushed, and your report is written.

REPORT (final message, in numbers): HEAD sha of your branch; files written with line counts; test files and counts; any perf numbers measured; "Seams": every signature or contract gap you hit and how you worked around it; anything left undone and why. A shard that stops with a clear report is a SUCCESS; a shard that repairs infrastructure is a FAILURE.
