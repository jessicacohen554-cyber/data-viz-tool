#!/usr/bin/env bash
# ===================================================================
#  Data Viz Tool - desktop launcher (macOS / Linux)
#  Mirrors run-viz.bat. If Node.js is installed it rebuilds the
#  site first (npm ci on first run / lockfile change, then npm run
#  build); otherwise it serves the committed dist/ folder as is.
#  Either way it then starts the local server and opens your browser.
#  Run: ./run-viz.sh
# ===================================================================
cd "$(dirname "$0")"

# --- locate a Python interpreter ---
PY=""
command -v python3 >/dev/null 2>&1 && PY="python3"
if [ -z "$PY" ]; then
  command -v python >/dev/null 2>&1 && PY="python"
fi
if [ -z "$PY" ]; then
  echo
  echo "Python 3.11 or newer was not found on this machine."
  echo "Install it from https://www.python.org/downloads/"
  echo "(or your package manager), then run this file again."
  echo
  exit 1
fi
if ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' >/dev/null 2>&1; then
  echo
  echo "Python 3.11 or newer is required (found an older version)."
  echo "Install it from https://www.python.org/downloads/ and run this file again."
  echo
  exit 1
fi

# --- rebuild the site when Node.js + npm are available ---
HAVE_NODE=""
command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && HAVE_NODE=1
build_site() {
  if [ -z "$HAVE_NODE" ]; then
    echo "Node.js/npm not found - serving the committed dist/ folder as is."
    return
  fi

  # npm ci only when node_modules is missing or package-lock.json is newer
  # than the stamp npm leaves behind in node_modules/.package-lock.json.
  NEED_CI=""
  [ -f "node_modules/.package-lock.json" ] || NEED_CI=1
  if [ -z "$NEED_CI" ]; then
    [ "package-lock.json" -nt "node_modules/.package-lock.json" ] && NEED_CI=1
  fi
  if [ -n "$NEED_CI" ]; then
    echo "Installing npm dependencies (first run or lockfile changed)..."
    if ! npm ci; then
      echo "npm ci failed - continuing with the committed dist/ folder."
      return
    fi
  fi
  echo "Building the site (npm run build)..."
  if ! npm run build; then
    echo "npm run build failed - continuing with the committed dist/ folder."
  fi
}
build_site

# --- launch the local server ---
echo
echo "Starting the viewer. Your browser will open at http://127.0.0.1:8766/"
echo "Drop CSV files into data/datasets/ and refresh the page."
echo "Leave this window open while you work; press Ctrl+C to stop the server."
echo
exec "$PY" tools/launcher.py "$@"
