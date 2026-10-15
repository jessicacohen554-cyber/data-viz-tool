---
name: sync-docs
description: Reconcile the prose documentation with the code AFTER a session has settled on a final approach. Manually invoked at the end of a working session (never as a hook) — it diffs what changed, maps each change to the docs that describe it, verifies the new behaviour against source, and proposes reviewed doc edits plus a CHANGELOG entry. Use when the user says "sync the docs", "update the docs to match the code", "the approach is settled, document it", or at end-of-session wrap-up.
---

# Sync docs to settled code

A **manually-invoked** documentation reconciler. It is the deliberate,
end-of-session counterpart to a hook: you run it **only when you have settled
on the approach**, so mid-session experimentation carries zero documentation
overhead and never gets caught in write→re-run loops. It never blocks a task,
never fires automatically, and never runs the app.

**Golden rule (rule 17 `[R-TRUTH]`):** code is the source of truth. This skill
changes prose to match code — it does **not** change code, `package.json`, or
data to match prose. If the docs describe a *better* design than the code,
surface that as a note for the user; do not edit code here. The one
exception is `docs/TABLEAU-SPEC.md` (rule 5 `[R-TABLEAU]`): a deviation from
Tableau is documented there *before* it is coded, so if code deviates and the
spec does not say so, the finding is "undocumented deviation" and the user
decides which side moves.

## When to use / not use

- **Use** at the end of a session once the code change is final and you want
  the docs to reflect it; or when the user explicitly asks to align docs.
- **Do not use** mid-experiment, on a dirty exploratory tree the user is still
  tweaking, or to document an intended-but-unbuilt feature (capture those as
  "later" notes in `docs/DECISIONS.md` §Out of scope, not as current behaviour).

## Inputs

Scope the run to what actually changed this session. In order of preference:

1. An explicit base the user names ("since I branched", "this PR").
2. The shard's pinned SHA (`docs/shards/S<n>.md`), if this is a shard.
3. `git diff origin/main...HEAD` (committed work on the branch), plus
   `git diff` / `git status` for uncommitted working-tree changes.

```bash
git status --short
git diff --stat origin/main...HEAD   # committed on this branch
git diff --stat                      # unstaged working tree
```

If the diff is empty or the user hasn't settled, stop and say so — there is
nothing to sync.

## Step-by-step

### 1. Determine the changed code surface
List the changed files under `src/`, `scripts/`, `tools/`, `tests/`,
`data/datasets/`, the run scripts and the workflows. Group them by subsystem
using the directory: core contract, data engine, format, palette, charts,
stores, UI (shelves / drag / fields / chart / dialogs / shared), worker,
scripts + launcher, data catalog, workflows + hooks.

### 2. Map each changed subsystem to its docs
Use the **code→doc map** below to find every doc that makes claims about the
changed subsystem. A single code change often touches several docs (a new
`FormatSpec` field hits `types.ts` → `VIZSPEC.md`, `TABLEAU-SPEC.md` and the
FormatDialog section of `ARCHITECTURE.md`).

### 3. Verify the *current* behaviour against source — do not trust memory
For each candidate doc claim, read the actual code (the function, the
constant, the registry entry) and confirm what it does **now**. Quote
`file:line` in the proposed edit so the user can check. Pay special attention
to:
- **Defaults** — `spec-defaults.ts`, `constants.ts`, each `ChartDef.requires`
  and `channels`; the default is what the doc describes as the primary path.
- **Tableau semantics** — type inference order, null handling per aggregation,
  date-part labels, format dialog defaults. `TABLEAU-SPEC.md` is the contract;
  code that differs without a row in its "Documented deviations" table is a
  finding, not a doc edit.
- **Numbers** — budgets (§9), caps, sample sizes, step counts: read them from
  `constants.ts` / the test that asserts them, never paraphrase the old doc.
- **Chart registry** — `CHARTS.md` must list exactly the ids in
  `src/lib/charts/registry.ts`, in the same groups, with the same minimum
  shelves; the Show Me priority order is `show-me.ts::suggest`.
- **Palette registry** — `PALETTES.md` must list exactly the ids in
  `src/lib/palette/registry.ts` with their `colorblindSafe` / labels-required
  flags as the validator reports them (re-run it; never re-type a result).

### 4. Propose the edits, then apply on confirmation
Present a concise, per-file list of proposed changes (old claim → corrected
claim, with the `file:line` evidence). Apply with `Edit` after the user
confirms. Keep each doc's voice and structure; prefer surgical edits to
rewrites so the diff is reviewable. Preserve still-accurate content.

### 5. Separate "settled" from "later"
Anything discussed but **not yet built** goes into `docs/DECISIONS.md`
§Out of scope (or the shard's open-seams list in its report), never into a
reference doc as current behaviour. Ask the user if unsure which bucket a
change belongs in.

### 6. Record it in the changelog
Append a dated `CHANGELOG.md` entry (one per merged lane, rule 16
`[R-RECORDS]`) summarizing the settled change in a few lines: what changed in
the app + which docs were realigned. This is the durable session record.

### 7. Report
Summarize: files changed, the headline behaviour deltas, and any "later"
items parked. Do not commit/push unless the user asks.

## Code → doc map

| Code area | Docs that describe it |
|---|---|
| `src/lib/core/` — `types.ts` (THE contract), `constants.ts`, `spec-defaults.ts`, `validate-spec.ts`, `query-of.ts`, `url-codec.ts` | `docs/VIZSPEC.md` (one JSON example per chart type; `queryOf` stripping rules; URL codec); `CLAUDE.md` (Architecture). **A new or renamed field syncs to VIZSPEC first** |
| `src/lib/data/` — `protocol.ts`, `column-store.ts`, `type-inference.ts`, `date-parse.ts`, `csv-loader.ts`, `filters.ts`, `engine.ts`, `data-client.ts`; `src/workers/data.worker.ts` | `docs/ARCHITECTURE.md` (engine, storage, worker protocol, §9 budgets); `docs/TABLEAU-SPEC.md` §1–§4 (inference, roles, aggregation null semantics, date hierarchy, filters) |
| `src/lib/format/` — `number-format.ts`, `date-format.ts`, `formatter.ts` | `docs/TABLEAU-SPEC.md` §7–§8 (the number-format dialog, every option and example; date tokens) |
| `src/lib/palette/` — `registry.ts`, `categorical.ts`, `sequential.ts`, `diverging.ts`, `validate.ts`, `pick.ts`; `scripts/validate_palette.js` | `docs/PALETTES.md` (every id, construction, validation status, name-matching rules, `pick` resolution) |
| `src/lib/charts/` — `registry.ts`, `show-me.ts`, `spec-builder.ts`, `transforms.ts`, `option-common.ts`, `echarts-setup.ts`, `types/*.ts` | `docs/CHARTS.md` (the 33-row table, Show Me priority, shelf rearrangement on type switch); `docs/TABLEAU-SPEC.md` §9 (Show Me wording) |
| `src/lib/stores/` — `spec`, `dataset`, `query`, `views`, `ui` | `docs/ARCHITECTURE.md` (state, undo, effect pipeline, saved views + URL hash) |
| `src/lib/ui/**` and `src/App.svelte`, `src/app.css` | `docs/ARCHITECTURE.md` (component tree, mobile layout, tokens); the accessibility-audit skill's token list |
| `scripts/build_manifest.py`, `scripts/convert_keeper_bundle.py`, `tools/launcher.py`, `run-viz.bat`, `run-viz.sh` | `README.md` (run on desktop, add your own CSV); `data/datasets/README.md` (provenance; the convert script's lookup tables) |
| `data/datasets/*.csv`, `data/manifest.json` | `data/datasets/README.md`; `README.md` §Data |
| `.github/workflows/*.yml`, `.claude/**` | `CLAUDE.md` (GitHub Actions, Testing); `CONVENTIONS.md` |
| repo-wide conventions (naming, layout, rules) | `CONVENTIONS.md`; `CLAUDE.md`; docs index `docs/README.md` |
| anything | `CHANGELOG.md` (always append), `README.md` (only if the elevator pitch changed) |

Keep this map current: when a new doc or major module is added, add the row
here as part of the same sync.

## Guardrails

- **Read-only on code.** This skill edits Markdown only. If a doc/code
  mismatch is actually a code bug, report it — don't "fix" it by editing prose.
- **No builds, no data.** Documentation reconciliation never runs `vite build`,
  never touches `dist/` (rule 11) and never edits a dataset (rule 12).
- **Reviewable diffs.** Surgical edits over wholesale rewrites; preserve voice
  and still-true content.
- **Date-stamped records stay put.** `docs/records/**` files are point-in-time
  records — never rewrite history; if one is stale-as-current, add the banner
  from `docs/README.md`: `> Status: ACTIVE | RECORD (frozen <date>) |
  SUPERSEDED-BY <path> | ARCHIVED`. A `SUPERSEDED-BY` pointer must resolve on
  the tree. Only assert a status you verified.
- **Never hand-edit a generated file, and never re-type a generated value.**
  `dist/**` and `data/manifest.json` are machine output (marked
  `linguist-generated` in `.gitattributes`) — regenerate and compare bytes.
  Validator results in `PALETTES.md` are re-run, never copied from memory.
- **Rulings are verbatim.** `docs/DECISIONS.md` rows D-n are copied from the
  decision card, never paraphrased; a changed ruling is a new row, never an
  edit.
