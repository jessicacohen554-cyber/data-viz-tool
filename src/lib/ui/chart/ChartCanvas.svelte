<script lang="ts">
  /**
   * The chart surface. Owns the ECharts lifecycle (`init` on a canvas,
   * `setOption` with `replaceMerge`, `ResizeObserver` → rAF resize, `dispose`)
   * and swaps to the DOM renderers for `kpi`, `text-table` and
   * `highlight-table`. Reads the live CSS tokens once per mount and hands them
   * to the pure builders as `BuildContext.theme` (rule R-TOKENS: ECharts
   * cannot read `var()`). `toPng()` exports the canvas for saved-view thumbnails.
   *
   * v2: loads a map's GeoJSON layer on demand (`__meta.geoPending` → `loadGeoLayer`
   * → rebuild), injects the style panel's web font, draws `style.border`,
   * emits `onMarkClick` for clicks on marks and `onAnnotationDrag` when a note's
   * drag handle is released (the note itself follows on the next spec patch).
   */
  import { onDestroy, untrack } from 'svelte';
  import type { FieldMeta, QueryResult, VizSpec } from '$core/types';
  import { echarts, type EChartsInstance } from '$charts/echarts-setup';
  import { REPLACE_MERGE_KEYS, tryBuildOption, type BuildOutcome } from '$charts/spec-builder';
  import { chartDef } from '$charts/registry';
  import { eligibility } from '$charts/show-me';
  import { DEFAULT_THEME, type ChartTheme } from '$charts/option-common';
  import { loadGeoLayer } from '$charts/geo-loader';
  import { annotationAnchors, type AnnotationAnchor } from '$charts/decorations';
  import type { KpiModel } from '$charts/types/kpi';
  import type { TableModel } from '$charts/types/text-table';
  import type { HighlightModel } from '$charts/types/highlight-table';
  import { ui } from '$stores/ui.svelte';
  import { ensureFont } from './fonts';
  import type { ChartEvents } from './events';
  import KpiTile from './KpiTile.svelte';
  import TextTable from './TextTable.svelte';
  import HighlightTable from './HighlightTable.svelte';

  interface Props extends ChartEvents {
    spec: VizSpec;
    /** `null` while no query has answered yet. */
    result: QueryResult | null;
    meta: FieldMeta[];
    isMobile?: boolean;
    /** True while a query is in flight; dims the surface without tearing down the chart. */
    busy?: boolean;
    /** Raw first rows of the dataset (S3 seam 6): shown as a text table while no pill drives a query. */
    raw?: TableModel | null;
  }

  let { spec, result, meta, isMobile = false, busy = false, raw = null, onMarkClick, onAnnotationDrag }: Props = $props();

  let host = $state<HTMLDivElement>();
  let frame = $state<HTMLDivElement>();
  /** Reactive (raw, no proxy) so the option effect re-runs once the instance exists: the host div and the first
   * result can land in the same flush, where the option effect would otherwise run before `init` and never again. */
  let chart = $state.raw<EChartsInstance | null>(null);
  let observer: ResizeObserver | null = null;
  let raf = 0;
  let theme = $state<ChartTheme>(DEFAULT_THEME);
  let toasted = new Set<string>();
  /** Bumped when a map layer finishes loading so the option is rebuilt with the regions available. */
  let geoTick = $state(0);
  /** Anchors of the current option's annotations (for the drag handles). */
  let anchors: AnnotationAnchor[] = [];

  const def = $derived(chartDef(spec.chartType));
  const isDom = $derived(def.renderer === 'dom');
  const outcome = $derived.by<BuildOutcome | null>(() => { void geoTick; return result ? tryBuildOption({ spec, result, meta, isMobile, theme }) : null; });
  const reason = $derived(eligibility(spec, meta).find((e) => e.id === spec.chartType)?.reason);
  const empty = $derived(result !== null && result.groups === 0);
  const bordered = $derived(spec.style.border);

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

  // Web fonts: request the style panel's families once each (no-op for system stacks).
  $effect(() => {
    const st = spec.style;
    for (const id of [st.fontFamily, st.axis.fontFamily, st.labels.fontFamily, st.legend.fontFamily]) ensureFont(id);
  });

  // ECharts lifecycle: (re)create when the host element appears, dispose when it leaves (DOM renderer).
  $effect(() => {
    const el = host;
    // `chart` is read untracked here: this effect depends on the host element only, never on the instance it creates.
    if (!el) { untrack(disposeChart); return; }
    // Dirty-rect repainting (experimental in ECharts) leaves un-repainted holes under markPoint labels and
    // geo scatter symbols after an incremental setOption, so the canvas repaints in full (the ECharts default).
    const instance = echarts.init(el, undefined, { renderer: 'canvas', useDirtyRect: false });
    chart = instance;
    instance.on('click', (params: unknown) => emitClick(params as ClickParams));
    observer = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { raf = 0; instance.resize(); syncHandles(); });
    });
    observer.observe(el);
    return () => untrack(disposeChart);
  });

  // Push the option whenever it changes. `replaceMerge` drops series/axes that vanished.
  $effect(() => {
    if (!chart || isDom || !outcome?.ok) return;
    const { __meta, ...option } = outcome.option as Record<string, unknown> & { __meta?: Record<string, unknown> };
    anchors = annotationAnchors(outcome.option);
    chart.setOption(option, { replaceMerge: [...REPLACE_MERGE_KEYS] });
    syncHandles(option.graphic);
    announce(__meta);
  });

  // Map layers: fetch the layer a built option still waits for, then rebuild once.
  $effect(() => {
    const m = outcome?.ok ? (outcome.option.__meta as { geoPending?: boolean; geoLayer?: string } | undefined) : undefined;
    if (!m?.geoPending || !m.geoLayer) return;
    const id = m.geoLayer;
    loadGeoLayer(id).then(() => { geoTick++; }).catch((e: unknown) => {
      const key = `geo:${id}`;
      if (!toasted.has(key)) { toasted.add(key); ui.toast(`Map layer "${id}" failed to load: ${e instanceof Error ? e.message : String(e)}`, 'error'); }
    });
  });

  interface ClickParams { componentType?: string; seriesName?: string; seriesType?: string; name?: string; value?: unknown; data?: unknown; event?: { offsetX: number; offsetY: number } }

  /** Translate an ECharts click on a series mark into `onMarkClick`. */
  function emitClick(p: ClickParams): void {
    if (!onMarkClick || p.componentType !== 'series') return;
    const v = p.value;
    let x: string | number = p.name ?? '';
    let y: number | null = null;
    if (Array.isArray(v)) { x = (v[0] as string | number) ?? x; y = typeof v[1] === 'number' ? v[1] : null; }
    else if (typeof v === 'number') y = v;
    onMarkClick({ x, y, seriesKey: p.seriesName ?? '', pixel: [p.event?.offsetX ?? 0, p.event?.offsetY ?? 0] });
  }

  /**
   * Transparent draggable handles over each annotation label (`graphic`
   * elements with ids `ann:<id>`), positioned from the anchor's pixel. The
   * builder's own graphic elements are kept; `replaceMerge` on `graphic`
   * clears stale handles. On release the new offset is reported.
   */
  function syncHandles(builderGraphic?: unknown): void {
    const instance = chart;
    if (!instance || !onAnnotationDrag || anchors.length === 0) return;
    const fontSize = (outcome?.ok ? Number((outcome.option.__meta as { fontSize?: number } | undefined)?.fontSize) : NaN) || 11;
    const own = Array.isArray(builderGraphic) ? (builderGraphic as Array<Record<string, unknown>>) : [];
    const handles: Array<Record<string, unknown>> = [];
    for (const a of anchors) {
      let px: number[] | null = null;
      try { px = instance.convertToPixel({ seriesIndex: a.seriesIndex }, [a.x, a.y] as number[]) as number[]; } catch { px = null; }
      if (!px || !Number.isFinite(px[0]!) || !Number.isFinite(px[1]!)) continue;
      const w = Math.max(24, a.text.length * fontSize * 0.6 + 12);
      const h = fontSize + 10;
      const x0 = px[0]! + a.offset[0] - w / 2;
      const y0 = px[1]! + a.offset[1] - h - 8;
      handles.push({
        id: `ann:${a.id}`, type: 'rect', x: x0, y: y0, z: 100, draggable: true, cursor: 'move',
        shape: { width: w, height: h }, style: { fill: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)' },
        ondragend: (e: { target: { x: number; y: number } }) => {
          const dx = e.target.x - x0; const dy = e.target.y - y0;
          if (dx !== 0 || dy !== 0) onAnnotationDrag?.(a.id, [Math.round(a.offset[0] + dx), Math.round(a.offset[1] + dy)]);
        },
      });
    }
    instance.setOption({ graphic: [...own, ...handles] }, { replaceMerge: ['graphic'] });
  }

  /** Surface the builder's data notes (folded slices, dropped rows, unmatched regions …) once each as toasts. */
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
    if (m.colorIgnored === true) notes.push('Several measures on the axis: the Color dimension is not applied');
    if (Array.isArray(m.unmatched) && m.unmatched.length > 0) {
      const list = (m.unmatched as string[]).slice(0, 5).join(', ');
      notes.push(`${m.unmatched.length} value${m.unmatched.length === 1 ? '' : 's'} matched no region: ${list}${m.unmatched.length > 5 ? ', …' : ''}`);
    }
    if (typeof m.unplaced === 'number' && m.unplaced > 0) notes.push(`${m.unplaced} rows have no location`);
    if (Array.isArray(m.notes)) for (const n of m.notes as string[]) notes.push(n);
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

<div class="chart-canvas" class:chart-canvas--busy={busy} class:chart-canvas--bordered={bordered} bind:this={frame} aria-busy={busy}>
  {#if !result && raw}
    <TextTable model={raw} />
  {:else if !result}
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
  .chart-canvas--bordered { box-shadow: inset 0 0 0 1px var(--border); }
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
