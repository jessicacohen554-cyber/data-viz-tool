<script lang="ts">
  /**
   * The chart surface. Owns the ECharts lifecycle (`init` on a canvas,
   * `setOption` with `replaceMerge`, `ResizeObserver` → rAF resize, `dispose`)
   * and swaps to the DOM renderers for `kpi`, `text-table` and
   * `highlight-table`. Reads the live CSS tokens once per mount and hands them
   * to the pure builders as `BuildContext.theme` (rule R-TOKENS: ECharts
   * cannot read `var()`). `toPng()` exports the canvas for saved-view thumbnails.
   */
  import { onDestroy } from 'svelte';
  import type { FieldMeta, QueryResult, VizSpec } from '$core/types';
  import { echarts, type EChartsInstance } from '$charts/echarts-setup';
  import { REPLACE_MERGE_KEYS, tryBuildOption, type BuildOutcome } from '$charts/spec-builder';
  import { chartDef } from '$charts/registry';
  import { eligibility } from '$charts/show-me';
  import { DEFAULT_THEME, type ChartTheme } from '$charts/option-common';
  import type { KpiModel } from '$charts/types/kpi';
  import type { TableModel } from '$charts/types/text-table';
  import type { HighlightModel } from '$charts/types/highlight-table';
  import { ui } from '$stores/ui.svelte';
  import KpiTile from './KpiTile.svelte';
  import TextTable from './TextTable.svelte';
  import HighlightTable from './HighlightTable.svelte';

  interface Props {
    spec: VizSpec;
    /** `null` while no query has answered yet. */
    result: QueryResult | null;
    meta: FieldMeta[];
    isMobile?: boolean;
    /** True while a query is in flight; dims the surface without tearing down the chart. */
    busy?: boolean;
  }

  let { spec, result, meta, isMobile = false, busy = false }: Props = $props();

  let host = $state<HTMLDivElement>();
  let frame = $state<HTMLDivElement>();
  let chart: EChartsInstance | null = null;
  let observer: ResizeObserver | null = null;
  let raf = 0;
  let theme = $state<ChartTheme>(DEFAULT_THEME);
  let toasted = new Set<string>();

  const def = $derived(chartDef(spec.chartType));
  const isDom = $derived(def.renderer === 'dom');
  const outcome = $derived<BuildOutcome | null>(result ? tryBuildOption({ spec, result, meta, isMobile, theme }) : null);
  const reason = $derived(eligibility(spec, meta).find((e) => e.id === spec.chartType)?.reason);
  const empty = $derived(result !== null && result.groups === 0);

  /** Resolve the CSS tokens the option builders need from the computed style of the frame. */
  function readTheme(el: HTMLElement): ChartTheme {
    const cs = getComputedStyle(el);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    return {
      bg: v('--chart-bg', DEFAULT_THEME.bg),
      grid: v('--chart-grid', DEFAULT_THEME.grid),
      tick: v('--chart-tick', DEFAULT_THEME.tick),
      axisText: v('--chart-axis-text', DEFAULT_THEME.axisText),
      text: v('--text-secondary', DEFAULT_THEME.text),
      textMuted: v('--text-muted', DEFAULT_THEME.textMuted),
      textOnDark: v('--text-on-dark', DEFAULT_THEME.textOnDark),
      border: v('--border', DEFAULT_THEME.border),
      borderLight: v('--border-light', DEFAULT_THEME.borderLight),
      positive: v('--positive', DEFAULT_THEME.positive),
      negative: v('--negative', DEFAULT_THEME.negative),
      navy: v('--navy', DEFAULT_THEME.navy),
      accent: v('--hydro', DEFAULT_THEME.accent),
      fontBody: v('--font-body', DEFAULT_THEME.fontBody),
      fontMono: v('--font-mono', DEFAULT_THEME.fontMono),
    };
  }

  function disposeChart(): void {
    observer?.disconnect();
    observer = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    chart?.dispose();
    chart = null;
  }

  // Theme: read once the frame exists (tokens are static in the light-only theme, D-6).
  $effect(() => {
    if (frame) theme = readTheme(frame);
  });

  // ECharts lifecycle: (re)create when the host element appears, dispose when it leaves (DOM renderer).
  $effect(() => {
    const el = host;
    if (!el) { disposeChart(); return; }
    chart = echarts.init(el, undefined, { renderer: 'canvas', useDirtyRect: true });
    observer = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { raf = 0; chart?.resize(); });
    });
    observer.observe(el);
    return disposeChart;
  });

  // Push the option whenever it changes. `replaceMerge` drops series/axes that vanished.
  $effect(() => {
    if (!chart || isDom || !outcome?.ok) return;
    const { __meta, ...option } = outcome.option as Record<string, unknown> & { __meta?: Record<string, unknown> };
    chart.setOption(option, { replaceMerge: [...REPLACE_MERGE_KEYS] });
    announce(__meta);
  });

  /** Surface the builder's data notes (folded slices, dropped rows …) once each as toasts. */
  function announce(m: Record<string, unknown> | undefined): void {
    if (!m) return;
    const notes: string[] = [];
    if (typeof m.folded === 'number' && m.folded > 0) notes.push(`${m.folded} small slices folded into "Other"`);
    if (typeof m.droppedNegative === 'number' && m.droppedNegative > 0) notes.push(`${m.droppedNegative} negative values dropped`);
    if (typeof m.excludedNegatives === 'number' && m.excludedNegatives > 0) notes.push(`${m.excludedNegatives} negative values excluded from the 100% total`);
    if (typeof m.dropped === 'number' && m.dropped > 0) notes.push(`${m.dropped} rows dropped (zero, negative or inconsistent values)`);
    if (typeof m.negativeSizes === 'number' && m.negativeSizes > 0) notes.push(`${m.negativeSizes} negative sizes drawn at the smallest size`);
    if (m.tooDeep === true) notes.push('More than 4 levels: add fewer levels for a readable treemap');
    if (m.labelsRequired === true) notes.push('More than 8 series: use with labels');
    if (m.tooManyCellsMobile === true) notes.push('Over 5K cells on a phone: add a Top N filter');
    for (const n of notes) { const key = `${spec.chartType}:${n}`; if (!toasted.has(key)) { toasted.add(key); ui.toast(n, 'warn'); } }
  }

  // A new chart type starts the toast de-duplication over.
  $effect(() => { spec.chartType; toasted = new Set(); });

  onDestroy(disposeChart);

  /** PNG data URL of the current ECharts canvas (null for DOM renderers or before the first paint). */
  export function toPng(pixelRatio = 2): string | null {
    if (!chart) return null;
    return chart.getDataURL({ type: 'png', pixelRatio, backgroundColor: theme.bg });
  }
</script>

<div class="chart-canvas" class:chart-canvas--busy={busy} bind:this={frame} aria-busy={busy}>
  {#if !result}
    <p class="chart-canvas__hint">Drop fields on Columns and Rows to start a chart.</p>
  {:else if reason}
    <p class="chart-canvas__hint"><strong>{def.label}</strong> · {reason}</p>
  {:else if empty}
    <p class="chart-canvas__hint">No rows match the current filters.</p>
  {:else if outcome && !outcome.ok}
    <p class="chart-canvas__hint chart-canvas__hint--error" role="alert">{outcome.error}</p>
  {:else if isDom && outcome?.ok}
    {#if outcome.option.kind === 'kpi'}
      <KpiTile model={outcome.option as unknown as KpiModel} />
    {:else if outcome.option.kind === 'table'}
      <TextTable model={outcome.option as unknown as TableModel} />
    {:else if outcome.option.kind === 'highlight'}
      <HighlightTable model={outcome.option as unknown as HighlightModel} />
    {/if}
  {:else}
    <div class="chart-canvas__host" bind:this={host} role="img" aria-label={spec.title || def.label}></div>
  {/if}
</div>

<style>
  .chart-canvas {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    background: var(--chart-bg);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: opacity var(--transition-fast);
  }
  .chart-canvas--busy { opacity: 0.6; }
  .chart-canvas__host { flex: 1 1 auto; min-width: 0; min-height: 0; }
  .chart-canvas__hint {
    margin: auto;
    padding: var(--space-md);
    color: var(--text-muted);
    text-align: center;
    max-width: var(--sidebar-width);
  }
  .chart-canvas__hint--error { color: var(--red-text); }
</style>
