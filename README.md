# data-viz-tool

A Tableau-style, browser-only data-visualization tool. Drag field pills onto
Columns / Rows / Filters and the Marks card (Color, Size, Label, Detail,
Tooltip, Shape); the app keeps Tableau's data-type, role, discrete/continuous,
aggregation and number/date-format semantics and ships a larger chart library
(33 types). It reads `.csv` files only — from the catalog folder in this repo
or from a file you open on the device, which is parsed in your browser and
never uploaded. Everything heavy runs in a Web Worker on a columnar engine, so
a ~430K-row file stays responsive.

![screenshot placeholder — the worksheet with a pill on Columns and Rows](docs/screenshot-placeholder.png)

## Run on desktop

Double-click `run-viz.bat` (Windows) or run `./run-viz.sh` (macOS / Linux).

- **Python 3.11+ is required** (standard library only; nothing to install).
- **Node is optional.** If `node` is on the path the launcher runs `npm ci`
  once and `npm run build`, then serves the fresh build. Without Node it serves
  the committed `dist/`, which CI rebuilds on every merge to `main`.
- The launcher (`tools/launcher.py`) serves `http://127.0.0.1:8766/` with
  `data/` overlaid on `dist/`, regenerates `data/manifest.json` on start, and
  opens your browser.

## Add your own CSV

1. Drop the file into `data/datasets/`.
2. Restart the launcher, or hit `GET /api/manifest` once — the catalog picks
   it up (the manifest records id, file, name, bytes, rows, columns, sha1,
   mtime).
3. Or skip the folder entirely: **Open CSV from device** in the dataset picker
   reads the file in the browser.

Types are inferred from the first 5,000 rows (`docs/TABLEAU-SPEC.md` §1); you
can change a field's type and role from its pill menu.

## Prototype on your phone

Every merge to `main` deploys to GitHub Pages:

`https://jessicacohen554-cyber.github.io/data-viz-tool/`

Phone layout is chart-first: the chart fills the viewport and Data / Shelves /
Marks / Chart-type open as bottom sheets. Drag pills, or tap a pill and then
tap a shelf. The 2024 ERCOT file (~5 MB) is the phone default; the full
2019–2025 file (~35 MB) is the stress test and shows its size in the picker.

## Develop

```bash
npm ci            # exact lockfile install
npm run dev       # Vite dev server
npm test          # vitest run (unit + boundary + palette validation)
npm run check     # svelte-check + tsc
python -m pytest tests/py -q      # launcher, manifest, convert script
PERF=1 npm run perf               # engine budgets on the full ERCOT file
```

Rules, layout and the pre-push gate: [`CLAUDE.md`](CLAUDE.md) and
[`CONVENTIONS.md`](CONVENTIONS.md). Docs index: [`docs/README.md`](docs/README.md).

## Data

The bundled datasets are the ERCOT 2019–2025 hourly outputs of the
`market-simulator` keeper bundle, converted from Parquet to CSV by
`scripts/convert_keeper_bundle.py` (no fabrication; Feb 29 is absent because
the model clock drops it). Provenance — bundle path, source git SHA, conversion
date — is in `data/datasets/README.md`.

## License

None declared yet.
