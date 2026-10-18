<script lang="ts" module>
  import type { AxisSpec, FieldMeta, FormatSpec, MarkSettings, VizSpec } from '$core/types';
  import type { AxisId } from '$stores/ui.svelte';

  /** Dialog heading per axis. */
  export const AXIS_LABEL: Record<AxisId, string> = { x: 'X axis', y: 'Y axis', y2: 'Secondary Y axis' };

  /** How an axis title is sourced: auto from the pills, a custom string, or hidden (`AxisSpec.title` undefined / string / null). */
  export type TitleMode = 'auto' | 'custom' | 'none';

  /** A combo-chart mark (`MarkSettings.markByAxis` values). */
  export type ComboMark = NonNullable<MarkSettings['markByAxis']>['primary'];

  /** Combo-chart marks per axis, in menu order. */
  export const COMBO_MARKS: readonly ComboMark[] = ['bar', 'line', 'area'];

  /** Default combo marks when the spec has none: bars on the primary axis, a line on the secondary. */
  export function defaultMarkByAxis(): NonNullable<MarkSettings['markByAxis']> {
    return { primary: 'bar', secondary: 'line' };
  }

  /** The title mode an `AxisSpec` encodes. */
  export function titleMode(axis: AxisSpec): TitleMode {
    if (axis.title === null) return 'none';
    return typeof axis.title === 'string' ? 'custom' : 'auto';
  }

  /** True when a bound is fixed to a number (not `'auto'` / unset). */
  export function isFixed(v: number | 'auto' | undefined): v is number {
    return typeof v === 'number' && Number.isFinite(v);
  }

  /** True when any measure pill sits on the secondary axis, so the synchronize toggle applies. */
  export function hasSecondaryAxis(spec: VizSpec): boolean {
    return spec.shelves.rows.some((p) => p.axis === 'secondary') || spec.shelves.columns.some((p) => p.axis === 'secondary');
  }

  /**
   * A synthetic numeric field for the tick-format preview (an axis has no
   * single field: several measures may share it).
   */
  export function axisPreviewMeta(): FieldMeta {
    return {
      name: 'axis', index: 0, type: 'number', role: 'measure', defaultContinuity: 'continuous', defaultAggregation: 'sum',
      storage: 'f64', rowCount: 0, nullCount: 0, cardinality: 0, highCardinality: false, min: null, max: null,
      topValues: [], dateFormat: null, dateAmbiguous: false, parseErrors: 0, confidence: 1,
    };
  }

  /** Tick-format kinds offered (number kinds only: an axis is continuous). */
  export const TICK_KINDS: readonly FormatSpec['kind'][] = ['automatic', 'number', 'currency', 'percent', 'scientific'];
</script>

<script lang="ts">
  /**
   * Axis dialog (T4): Tableau's Edit Axis + Format Axis for `x`, `y` or `y2`.
   * Title (auto / custom / none), range (auto or fixed min–max), log, reversed,
   * gridlines, show axis, tick number format (the FormatDialog number controls
   * as a sub-panel, writing `AxisSpec.tickFormat`), and for the y axes the
   * dual-axis synchronize toggle (D-19) and, on a combo chart, the mark per
   * axis (`marks.markByAxis`; the Marks card is not T4's, see the report).
   * Every control patches the spec at once (R-SPEC). Tokens only (R-TOKENS).
   */
  import { makeFormatter } from '$format/formatter';
  import { spec } from '$stores/spec.svelte';
  import Dialog from './Dialog.svelte';
  import { MAX_DECIMALS, compactFormat } from './FormatDialog.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
    which: AxisId | null;
  }

  let { open, onclose, which }: Props = $props();

  const axis = $derived<AxisSpec | null>(which ? spec.value.axes[which] : null);
  const mode = $derived(axis ? titleMode(axis) : 'auto');
  const rangeFixed = $derived(!!axis && (isFixed(axis.min) || isFixed(axis.max)));
  const tick = $derived<FormatSpec>(axis?.tickFormat ?? { kind: 'automatic' });
  const showNumberOptions = $derived(tick.kind === 'number' || tick.kind === 'currency' || tick.kind === 'percent');
  const isY = $derived(which === 'y' || which === 'y2');
  const combo = $derived(spec.value.chartType === 'combo');
  const comboSide = $derived<'primary' | 'secondary'>(which === 'y2' ? 'secondary' : 'primary');
  const comboMark = $derived((spec.value.marks.markByAxis ?? defaultMarkByAxis())[comboSide]);
  const previewMeta = axisPreviewMeta();
  const SAMPLES = [1234567.891, 1234.5, 0.1234, 0];
  const preview = $derived.by(() => {
    try {
      const fmt = makeFormatter(previewMeta, compactFormat(tick));
      return SAMPLES.map((v) => fmt(v)).join(' · ');
    } catch (e) {
      return `⚠ ${e instanceof Error ? e.message : String(e)}`;
    }
  });

  function patchAxis(fn: (a: AxisSpec) => void): void {
    if (!which) return;
    const w = which;
    spec.patch((d) => fn(d.axes[w]));
  }

  function setTitleMode(m: TitleMode): void {
    if (m === mode) return;
    patchAxis((a) => {
      if (m === 'auto') delete a.title;
      else if (m === 'none') a.title = null;
      else a.title = typeof a.title === 'string' ? a.title : '';
    });
  }

  function setRangeMode(fixed: boolean): void {
    patchAxis((a) => {
      if (!fixed) { delete a.min; delete a.max; }
      else { if (!isFixed(a.min)) a.min = 0; if (!isFixed(a.max)) a.max = 'auto'; }
    });
  }

  function setBound(key: 'min' | 'max', raw: string): void {
    const t = raw.trim();
    patchAxis((a) => {
      if (t === '') { a[key] = 'auto'; return; }
      const n = Number(t);
      if (Number.isFinite(n)) a[key] = n;
    });
  }

  function patchTick(fn: (f: FormatSpec) => void): void {
    patchAxis((a) => {
      const next: FormatSpec = { ...(a.tickFormat ?? { kind: 'automatic' }) };
      fn(next);
      const compact = compactFormat(next);
      if (compact.kind === 'automatic' && Object.keys(compact).length === 1) delete a.tickFormat;
      else a.tickFormat = compact;
    });
  }

  /** Switch the tick kind; Automatic drops every option so the axis is back to the default. */
  function setTickKind(kind: FormatSpec['kind']): void {
    patchTick((f) => {
      if (kind === 'automatic') { for (const k of Object.keys(f)) delete f[k as keyof FormatSpec]; }
      f.kind = kind;
      if (kind === 'currency' && !f.currency) f.currency = 'USD';
    });
  }

  function clampDecimals(v: string): number | undefined {
    if (v === '') return undefined;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(MAX_DECIMALS, n)) : undefined;
  }

  function setComboMark(m: ComboMark): void {
    if (m === comboMark) return;
    spec.patch((d) => {
      const cur = d.marks.markByAxis ?? defaultMarkByAxis();
      d.marks.markByAxis = { ...cur, [comboSide]: m };
    });
  }

  function reset(): void {
    patchAxis((a) => {
      delete a.title; delete a.min; delete a.max; delete a.tickFormat;
      a.log = false; a.reversed = false; a.gridlines = true; a.showAxis = true;
    });
  }
</script>

<Dialog {open} {onclose} title={which ? AXIS_LABEL[which] : 'Axis'} width="md">
  {#snippet footer()}
    <button type="button" class="btn" onclick={reset} disabled={!axis}>Reset axis</button>
    <button type="button" class="btn btn--primary" onclick={onclose}>Done</button>
  {/snippet}

  {#if !axis || !which}
    <p class="muted">No axis selected.</p>
  {:else}
    <section class="sect" aria-label="Title">
      <h3 class="eyebrow">Title</h3>
      <div class="seg-ctrl" role="radiogroup" aria-label="Axis title">
        {#each ['auto', 'custom', 'none'] as const as m (m)}
          <button type="button" role="radio" class:active={mode === m} aria-checked={mode === m} data-title-mode={m} onclick={() => setTitleMode(m)}>
            {m === 'auto' ? 'Automatic' : m === 'custom' ? 'Custom' : 'None'}
          </button>
        {/each}
      </div>
      {#if mode === 'custom'}
        <input type="text" aria-label="Axis title text" value={typeof axis.title === 'string' ? axis.title : ''} placeholder="Axis title"
          onchange={(e) => { const t = e.currentTarget.value; patchAxis((a) => { a.title = t; }); }} />
      {/if}
    </section>

    <section class="sect" aria-label="Range">
      <h3 class="eyebrow">Range</h3>
      <div class="seg-ctrl" role="radiogroup" aria-label="Axis range">
        <button type="button" role="radio" class:active={!rangeFixed} aria-checked={!rangeFixed} data-range="auto" onclick={() => setRangeMode(false)}>Automatic</button>
        <button type="button" role="radio" class:active={rangeFixed} aria-checked={rangeFixed} data-range="fixed" onclick={() => setRangeMode(true)}>Fixed</button>
      </div>
      {#if rangeFixed}
        <div class="inline">
          <label class="row"><span>Min</span><input type="number" class="num" aria-label="Axis minimum" placeholder="auto" value={isFixed(axis.min) ? axis.min : ''} onchange={(e) => setBound('min', e.currentTarget.value)} /></label>
          <label class="row"><span>Max</span><input type="number" class="num" aria-label="Axis maximum" placeholder="auto" value={isFixed(axis.max) ? axis.max : ''} onchange={(e) => setBound('max', e.currentTarget.value)} /></label>
        </div>
        <p class="muted">Leave a bound empty to keep it automatic.</p>
      {/if}
      <div class="inline">
        <label class="row row--check"><input type="checkbox" checked={axis.log} aria-label="Logarithmic" onchange={(e) => patchAxis((a) => { a.log = e.currentTarget.checked; })} /><span>Logarithmic</span></label>
        <label class="row row--check"><input type="checkbox" checked={axis.reversed} aria-label="Reversed" onchange={(e) => patchAxis((a) => { a.reversed = e.currentTarget.checked; })} /><span>Reversed</span></label>
      </div>
    </section>

    <section class="sect" aria-label="Display">
      <h3 class="eyebrow">Display</h3>
      <div class="inline">
        <label class="row row--check"><input type="checkbox" checked={axis.showAxis} aria-label="Show axis" onchange={(e) => patchAxis((a) => { a.showAxis = e.currentTarget.checked; })} /><span>Show axis</span></label>
        <label class="row row--check"><input type="checkbox" checked={axis.gridlines} aria-label="Gridlines" onchange={(e) => patchAxis((a) => { a.gridlines = e.currentTarget.checked; })} /><span>Gridlines</span></label>
        {#if isY}
          <label class="row row--check">
            <input type="checkbox" checked={spec.value.axes.synchronized} aria-label="Synchronize axes" disabled={!hasSecondaryAxis(spec.value) && !combo}
              onchange={(e) => spec.patch((d) => { d.axes.synchronized = e.currentTarget.checked; })} />
            <span>Synchronize dual axes</span>
          </label>
        {/if}
      </div>
      {#if isY && combo}
        <div class="row">
          <span>Mark on this axis</span>
          <div class="seg-ctrl" role="radiogroup" aria-label="Combo mark">
            {#each COMBO_MARKS as m (m)}
              <button type="button" role="radio" class:active={comboMark === m} aria-checked={comboMark === m} data-combo-mark={m} onclick={() => setComboMark(m)}>{m}</button>
            {/each}
          </div>
        </div>
      {/if}
    </section>

    <section class="sect" aria-label="Tick format">
      <h3 class="eyebrow">Tick numbers</h3>
      <div class="grid">
        <label class="row">
          <span>Kind</span>
          <select value={tick.kind} aria-label="Tick format kind" onchange={(e) => setTickKind(e.currentTarget.value as FormatSpec['kind'])}>
            {#each TICK_KINDS as k (k)}<option value={k}>{k === 'automatic' ? 'Automatic' : k.charAt(0).toUpperCase() + k.slice(1)}</option>{/each}
          </select>
        </label>
        {#if showNumberOptions || tick.kind === 'scientific'}
          <label class="row">
            <span>Decimals</span>
            <input type="number" class="num" min="0" max={MAX_DECIMALS} step="1" value={tick.decimals ?? ''} placeholder="auto" aria-label="Tick decimals"
              onchange={(e) => { const v = clampDecimals(e.currentTarget.value); patchTick((f) => { if (v === undefined) delete f.decimals; else f.decimals = v; }); }} />
          </label>
        {/if}
        {#if showNumberOptions}
          <label class="row row--check">
            <input type="checkbox" checked={tick.thousands ?? true} aria-label="Thousands separator" onchange={(e) => patchTick((f) => { f.thousands = e.currentTarget.checked; })} />
            <span>Thousands separator</span>
          </label>
          {#if tick.kind !== 'percent'}
            <label class="row">
              <span>Units</span>
              <select value={tick.units ?? 'none'} aria-label="Tick units" onchange={(e) => patchTick((f) => { f.units = e.currentTarget.value as FormatSpec['units']; })}>
                <option value="none">None</option><option value="K">Thousands (K)</option><option value="M">Millions (M)</option><option value="B">Billions (B)</option><option value="auto">Auto (per axis)</option>
              </select>
            </label>
            <label class="row">
              <span>Negative</span>
              <select value={tick.negative ?? '-'} aria-label="Negative numbers" onchange={(e) => patchTick((f) => { f.negative = e.currentTarget.value as FormatSpec['negative']; })}>
                <option value="-">-1234</option><option value="()">(1234)</option><option value="red">1234 in red</option><option value="-red">-1234 in red</option>
              </select>
            </label>
          {/if}
        {/if}
        {#if tick.kind === 'number'}
          <label class="row"><span>Prefix</span><input type="text" aria-label="Prefix" value={tick.prefix ?? ''} onchange={(e) => { const v = e.currentTarget.value; patchTick((f) => { f.prefix = v; }); }} /></label>
          <label class="row"><span>Suffix</span><input type="text" aria-label="Suffix" value={tick.suffix ?? ''} onchange={(e) => { const v = e.currentTarget.value; patchTick((f) => { f.suffix = v; }); }} /></label>
        {/if}
        {#if tick.kind === 'currency'}
          <label class="row"><span>Currency</span><input type="text" maxlength="3" class="mono" aria-label="Currency" value={tick.currency ?? 'USD'} onchange={(e) => { const v = e.currentTarget.value.toUpperCase(); patchTick((f) => { f.currency = v; }); }} /></label>
        {/if}
      </div>
      <p class="preview num" aria-live="polite">{preview}</p>
    </section>
  {/if}
</Dialog>

<style>
  .muted { color: var(--text-muted); font-size: 0.82rem; margin: 0; }
  .sect { display: flex; flex-direction: column; gap: var(--space-sm); margin-bottom: var(--space-md); font-size: 0.82rem; }
  .inline { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-sm) var(--space-md); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: var(--space-sm) var(--space-md); }
  .row { display: flex; flex-direction: column; gap: var(--space-xs); }
  .row > span { color: var(--text-muted); font-weight: 600; }
  .row--check { flex-direction: row; align-items: center; gap: var(--space-sm); min-height: var(--touch-target); }
  .row--check > span { color: var(--text-secondary); font-weight: 500; }
  input[type='text'], input[type='number'], select {
    min-height: var(--touch-target);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
  }
  input[type='checkbox'] { width: var(--space-md); height: var(--space-md); accent-color: var(--hydro); }
  input:disabled { opacity: 0.45; }
  .seg-ctrl button { min-height: var(--space-xl); text-transform: capitalize; }
  .preview { margin: 0; padding: var(--space-sm) var(--space-md); border-radius: var(--radius-md); background: var(--bg-page); color: var(--text-primary); }
  @media (max-width: 900px) {
    .seg-ctrl button { min-height: var(--touch-target); }
  }
</style>
