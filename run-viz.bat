@echo off
REM ===================================================================
REM  Data Viz Tool - desktop launcher (Windows)
REM  Double-click this file. If Node.js is installed it rebuilds the
REM  site first (npm ci on first run / lockfile change, then npm run
REM  build); otherwise it serves the committed dist\ folder as is.
REM  Either way it then starts the local server and opens your browser.
REM ===================================================================
setlocal
cd /d "%~dp0"

REM --- locate a Python interpreter ---
set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY (
  where python >nul 2>&1 && set "PY=python"
)
if not defined PY (
  echo.
  echo Python 3.11 or newer was not found on this PC.
  echo Install it from https://www.python.org/downloads/
  echo ^(tick "Add python.exe to PATH" during install^), then run this file again.
  echo.
  pause
  exit /b 1
)
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>&1
if errorlevel 1 (
  echo.
  echo Python 3.11 or newer is required ^(found an older version^).
  echo Install it from https://www.python.org/downloads/ and run this file again.
  echo.
  pause
  exit /b 1
)

REM --- rebuild the site when Node.js + npm are available ---
set "HAVE_NODE="
where node >nul 2>&1 && where npm >nul 2>&1 && set "HAVE_NODE=1"
if not defined HAVE_NODE (
  echo Node.js/npm not found - serving the committed dist\ folder as is.
  goto :serve
)

REM npm ci only when node_modules is missing or package-lock.json is newer
REM than the stamp npm leaves behind in node_modules\.package-lock.json.
set "NEED_CI="
if not exist "node_modules\.package-lock.json" set "NEED_CI=1"
if not defined NEED_CI (
  %PY% -c "import os, sys; sys.exit(0 if os.path.getmtime('package-lock.json') > os.path.getmtime('node_modules/.package-lock.json') else 1)" && set "NEED_CI=1"
)
if defined NEED_CI (
  echo Installing npm dependencies ^(first run or lockfile changed^)...
  call npm ci
  if errorlevel 1 (
    echo npm ci failed - continuing with the committed dist\ folder.
    goto :serve
  )
)
echo Building the site ^(npm run build^)...
call npm run build
if errorlevel 1 (
  echo npm run build failed - continuing with the committed dist\ folder.
)

:serve
REM --- launch the local server ---
echo.
echo Starting the viewer. Your browser will open at http://127.0.0.1:8766/
echo Drop CSV files into data\datasets\ and refresh the page.
echo Leave this window open while you work; close it to stop the server.
echo.
%PY% tools\launcher.py
pause
