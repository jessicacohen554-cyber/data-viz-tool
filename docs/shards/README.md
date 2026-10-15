> Status: ACTIVE

# Shard prompts

One file per shard. The parent session renders `{{SHA}}` to the 40-char commit of `main` that the shard must start from, then hands the whole file to a child session (`mcp__claude-code-remote__create_session`, `source_revision` = that SHA). Rule R-SHARD governs: one branch, owned files only, hard stops, a required report. A shard that stops with a clear report is a success; one that repairs infrastructure is a failure.

| Shard | Branch | Owns | Lands |
|---|---|---|---|
| S1 | `claude/s1-data-engine` | `src/lib/data/*` (not protocol.ts), `src/workers/data.worker.ts`, `tests/perf/*` | parallel |
| S2 | `claude/s2-format-palette` | `src/lib/format/*`, `src/lib/palette/*`, `scripts/validate_palette.js` | parallel |
| S3 | `claude/s3-charts` | `src/lib/charts/*`, `src/lib/ui/chart/*` | parallel |
| S4 | `claude/s4-shelves-drag` | `src/lib/ui/shelves/*`, `src/lib/ui/drag/*`, `src/lib/ui/fields/*`, `src/lib/ui/shared/*` | parallel |
| S5 | `claude/s5-dialogs-flow` | `src/lib/ui/dialogs/*`, `src/lib/stores/{dataset,query,views}.svelte.ts`, `src/lib/ui/export.ts` | parallel |
| S6 | `claude/s6-integration` | `src/App.svelte`, `src/app.css` (mobile pass), `docs/ARCHITECTURE.md`, `README.md` | last |

Common rules every prompt carries are in `_common.md`.
