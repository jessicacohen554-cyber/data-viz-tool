SHARD S3 — charts. Repo jessicacohen554-cyber/data-viz-tool @ {{SHA}}. Model: Opus or Fable. Branch `claude/s3-charts`.

{{COMMON}}

GOAL: the chart registry (all 33 ids in `CHART_TYPE_IDS`), Show Me eligibility, the pure spec builder (VizSpec + QueryResult → ECharts option), ECharts tree-shaken setup, the canvas component and the DOM renderers (docs/CHARTS.md is the spec).

OWNS:
- `src/lib/charts/echarts-setup.ts` — `echarts/core` + `use([...])` of exactly the modules the registry declares; `CanvasRenderer`; exported `echarts`.
- `src/lib/charts/registry.ts` (replace stub, keep `ChartDef`/`Requirement`/`BuildContext` shapes), `src/lib/charts/types/*.ts` one file per chart exporting a `ChartDef`, `show-me.ts` (replace stub), `spec-builder.ts` (`buildOption(ctx)` dispatch), `option-common.ts` (Observatory theme from CSS tokens passed in, axis/tooltip/legend/grid/visualMap builders, formatter wiring), `transforms.ts` (pivot, percentStack, waterfall, rank/bump, slope pairs, dumbbell pairs, sankey links, tree nesting, bullet bands).
- `src/lib/ui/chart/ChartCanvas.svelte` — ECharts lifecycle (`init` canvas, `setOption` with `replaceMerge`, `ResizeObserver`→rAF, `dispose`), `toPng()`, swaps to DOM renderers for `kpi`/`text-table`/`highlight-table`; `KpiTile.svelte`, `TextTable.svelte` (virtualised > 200 rows), `HighlightTable.svelte`, `ChartPicker.svelte` (Show Me grid: icons, disabled with reason tooltip, ≥ 44px targets on mobile).
- Tests next to each module: eligibility matrix, transforms, `buildOption` snapshot per chart id on fixture QueryResults (plain objects, no canvas), a test that `echarts-setup` registers every `echartsModules` entry any ChartDef lists.

CONSUMES: `types.ts`, `constants.ts`, `query-of.ts` (`pillKeyMap`, `ChartNeeds`), `format/formatter.ts` (`makeFormatter` — stub until S2 lands; code against the signature), `palette/pick.ts` (`pickPalette`, `ColorEncoding` — stub until S2 lands), `stores/spec.svelte.ts` (ChartPicker only), `docs/CHARTS.md`, `docs/PALETTES.md`, the dataviz rules: thin marks, no dual axis, categorical hues in fixed order, text in text tokens never series color, legend for ≥ 2 series, hover tooltip by default.

PERFORMANCE: `large`/`progressive` for scatter > 2K points; `sampling:'lttb'` for long lines; animation off above 5K points or when `isMobile`; `tooltip.transitionDuration: 0`, `confine: true`, `triggerOn: 'click'` on touch; `dataZoom` inside for pan/zoom.

ACCEPTANCE: 33/33 ids registered; every chart renders from a fixture result without throwing; snapshots reviewed by eye once in `npm run dev` (describe what you saw in the report).
