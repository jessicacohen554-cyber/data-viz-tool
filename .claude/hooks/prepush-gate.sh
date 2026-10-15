#!/bin/bash
# PreToolUse hook on Bash|mcp__github__push_files — type-check + test REFUSAL gate.
#
# Refuses a push when `npm run check` (svelte-check + tsc) or `vitest run`
# fails on the working tree. It is the mechanical form of the pre-push line in
# CLAUDE.md "Testing", ported from market-simulator's ruff-prepush-gate.sh.
#
# WHY A HOOK AND NOT .git/hooks/pre-push. `mcp__github__push_files` commits
# server-side over the GitHub API and NEVER TOUCHES LOCAL GIT, so a git
# pre-push hook physically cannot see it; new files pushed that way never fire
# an Edit|Write hook either. Only a PreToolUse hook sees both routes.
#
# CHECK-ONLY, NEVER WRITES. This gate only INSPECTS and REFUSES. It never
# writes to the tree, never `git add`s, never touches the index, never runs a
# formatter (rule 10 [R-PUSH]: a session's bytes are its own).
#
# SCOPED. Bash fires the matcher on EVERY call, so the non-push path must be
# cheap: the push regex runs first and nothing else happens for a non-push. A
# push whose branch changed no source, test or build-config file (docs-only,
# data-only) is let through without running the toolchain.
#
# FAIL-OPEN BY CONSTRUCTION. Every unexpected condition — missing jq/npm/git,
# no node_modules, an unreadable repo, a tool that crashed instead of
# reporting — exits 0 with no output, which lets the tool proceed through the
# normal permission flow. The gate refuses ONLY on a genuine, reported failure:
# svelte-check's own "found N errors" summary with N > 0, or vitest's
# "Test Files … failed" / "Tests … failed" summary. A tool that exits non-zero
# without its summary line (e.g. "No test files found") is an error, not a
# verdict, and lets the push through.
#
# CONTRACT: exit 0 + JSON on stdout (hookSpecificOutput.permissionDecision), not
# exit 2. Reason strings are built with `jq -n`, never string concatenation, so
# tool output can never break the payload.
set -uo pipefail

emit_allow() { exit 0; }   # no output => proceed through normal permission flow

command -v jq >/dev/null 2>&1 || emit_allow

payload=$(cat 2>/dev/null) || emit_allow
[ -n "$payload" ] || emit_allow

tool=$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null) || emit_allow

case "$tool" in
  mcp__github__push_files)
    : ;;                       # always a push
  Bash)
    cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)
    [ -n "$cmd" ] || emit_allow
    # `git ... push` as a real command invocation: at a statement boundary,
    # allowing shell keywords and `git -C x`/`git -c k=v` options, and requiring
    # a non-word char after `push` so `git push-notes`/`git pushx` do not match.
    push_re='(^|[;&|(]|&&|\|\|)[[:space:]]*((then|do|else|\{)[[:space:]]+)*git([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]-][^[:space:]]*)?)*[[:space:]]+push([^[:alnum:]_-]|$)'
    printf '%s' "$cmd" | grep -qE "$push_re" || emit_allow
    ;;
  *)
    emit_allow ;;
esac

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" 2>/dev/null || emit_allow
command -v npm >/dev/null 2>&1 || emit_allow
command -v npx >/dev/null 2>&1 || emit_allow
git rev-parse --git-dir >/dev/null 2>&1 || emit_allow
[ -f package.json ] || emit_allow
[ -d node_modules ] || emit_allow   # toolchain absent: cannot judge, let it through

# This branch's own changed files: staged + unstaged + committed-vs-merge-base.
tmp=$(mktemp 2>/dev/null) || emit_allow
{
  git diff --name-only --cached 2>/dev/null
  git diff --name-only 2>/dev/null
  if git rev-parse --verify -q origin/main >/dev/null 2>&1; then
    git diff --name-only origin/main...HEAD 2>/dev/null
  fi
} > "$tmp" 2>/dev/null || { rm -f "$tmp"; emit_allow; }

# Only these surfaces can turn check/test red; a docs- or data-only push skips
# the toolchain entirely.
if ! grep -qE '^(src/|tests/|index\.html$|package(-lock)?\.json$|vite\.config\.ts$|tsconfig\.json$|svelte\.config\.js$)' "$tmp" 2>/dev/null; then
  rm -f "$tmp"; emit_allow
fi
rm -f "$tmp"

chk_out=$(npm run --silent check 2>&1); chk_rc=$?
tst_out=$(npx vitest run --reporter=dot 2>&1); tst_rc=$?

# A verdict is a non-zero exit PLUS the tool's own summary line; anything else
# is a tool error and fails open.
chk_fail=0
if [ "$chk_rc" != "0" ] && printf '%s' "$chk_out" | grep -qE 'svelte-check found [1-9][0-9]* error'; then
  chk_fail=1
fi
tst_fail=0
if [ "$tst_rc" != "0" ] && printf '%s' "$tst_out" | grep -qE '(Test Files|Tests)[[:space:]]+[1-9][0-9]* failed'; then
  tst_fail=1
fi
[ "$chk_fail" = "1" ] || [ "$tst_fail" = "1" ] || emit_allow

reason="PUSH BLOCKED — check/test gate (.claude/hooks/prepush-gate.sh).

ci.yml runs the same two commands on the PR, so pushing this would turn CI red.
Scope is the working tree of THIS branch, so these are yours to fix."

if [ "$chk_fail" = "1" ]; then
  reason="${reason}

--- npm run check (FAILED) ---
$(printf '%s' "$chk_out" | tail -n 60)

Fix the type errors; never silence them with // @ts-ignore to satisfy this gate."
fi

if [ "$tst_fail" = "1" ]; then
  reason="${reason}

--- npx vitest run (FAILED) ---
$(printf '%s' "$tst_out" | tail -n 60)

Fix the failing tests or the code they test; never .skip a test to satisfy this gate."
fi

reason="${reason}

This gate is check-only and never edits your tree (rule 10 [R-PUSH]).
If it is wrong, the escape hatch is to disable the hook deliberately and say so
in the PR — do not work around it."

jq -n --arg r "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $r
  }
}'
exit 0
