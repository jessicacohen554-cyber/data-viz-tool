SHARD S2 — format + palette. Repo jessicacohen554-cyber/data-viz-tool @ {{SHA}}. Model: Opus or Fable. Branch `claude/s2-format-palette`.

{{COMMON}}

GOAL: Tableau's number/date formatting, and the palette registry with validation and the Color-shelf resolver (docs/PALETTES.md, owner decision D-12: monotone sequential, temperature diverging, complementary and other categorical sets, per-category overrides).

OWNS:
- `src/lib/format/number-format.ts` — number / currency / percent / scientific / custom (`#,##0.00;(#,##0.00)` subset) with decimals, thousands, units K/M/B/auto, prefix/suffix, negative styles `-`/`()`/`red`/`-red` (red = returns a marker the UI can style; document it), locale via `Intl.NumberFormat`.
- `src/lib/format/date-format.ts` — pattern tokens `yyyy yy MM M MMM MMMM dd d ddd dddd HH H mm ss Q ww` with literal quoting; date-part labels (`Q3`, `Mar`, `Mon`, ISO week `W12`); standard format list.
- `src/lib/format/formatter.ts` — replace the stub: `makeFormatter(meta, spec)`, `autoFormat(meta)` (numbers: thousands + up to 2 decimals, integers 0 decimals; dates by level; booleans True/False).
- `src/lib/palette/registry.ts` (replace stub), `categorical.ts`, `sequential.ts`, `diverging.ts`, `validate.ts`, `pick.ts` (replace stub, keep `ColorEncoding` and `pickPalette` signature).
- `scripts/validate_palette.js` — port of the dataviz validator (OKLab ΔE, CVD simulation, contrast); CLI `node scripts/validate_palette.js "<hex,hex,...>" --mode light`; also importable so a Vitest test can run every categorical set.
- Tests next to each module.

CONSUMES: `types.ts` (`FormatSpec`, `FieldMeta`, `PaletteSelection`, `Pill`, `QueryResult`, `ChartTypeId`), `docs/TABLEAU-SPEC.md` §Formatting (the examples table is your test oracle), `docs/PALETTES.md` (every palette id and hex listed there must exist; Observatory hexes come from there).

ACCEPTANCE: every row of the TABLEAU-SPEC formatting examples table passes; every categorical palette passes `validate.ts` on `#FFFFFF` and `#F8F9FC` or carries `tags: ['labels-required']`; sequential ramps strictly monotone in OKLCH lightness; `pickPalette` matrix: no pill → single color; discrete → categorical with stable label→color map (same label keeps its color when the domain shrinks); continuous → sequential; spans zero or `useDiverging` → diverging with midpoint zero/mean/median/custom; `overrides` win; `reverse` flips.
