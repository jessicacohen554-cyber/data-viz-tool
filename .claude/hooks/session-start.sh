#!/bin/bash
# SessionStart hook (Claude Code on the web).
#
# Guarantees the JS toolchain is present in the ephemeral web container so
# `npm run check`, `npm test` and the prepush-gate PreToolUse hook can actually
# run during the session. `npm ci` installs the exact lockfile — the same
# toolchain .github/workflows/ci.yml uses — and is skipped once node_modules
# exists, so a re-run is a no-op on a warm container.
#
# Then fast-forwards a stale web clone to real origin/main WITHOUT a full blob
# fetch: the repo commits dist/ and ~45 MB of CSV, so a plain `git fetch` can
# stall through the egress proxy, while a blobless fetch transfers only the
# commit/tree delta and fetches blobs lazily on checkout (promisor). No-op when
# already current. Every step is guarded so a failure can never break session
# start; the script always exits 0.
set -uo pipefail

# Web-only. Local sessions already have whatever env the developer set up; don't
# mutate it. ($CLAUDE_CODE_REMOTE == "true" only inside Claude Code on the web.)
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" 2>/dev/null || exit 0

if [ -f package-lock.json ] && [ ! -d node_modules ] && command -v npm >/dev/null 2>&1; then
  echo "session-start: npm ci (node_modules missing)"
  npm ci --prefer-offline --no-audit --no-fund 2>&1 | tail -n 3 || true
fi

git config remote.origin.promisor true 2>/dev/null || true
git config remote.origin.partialclonefilter blob:none 2>/dev/null || true
if git fetch --filter=blob:none --quiet origin main 2>/dev/null; then
  behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
  if [ "${behind:-0}" -gt 0 ]; then
    echo "session-start: fast-forwarding $behind commits to origin/main (blobless)"
    git merge --ff-only origin/main 2>/dev/null || true
  fi
fi
exit 0
