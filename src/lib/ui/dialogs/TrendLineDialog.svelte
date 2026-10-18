<script lang="ts" module>
  import type { TrendLine } from '$core/types';
  import { TREND_MODELS } from '$core/constants';

  /** Menu wording per model. */
  export const MODEL_LABEL: Record<TrendLine['model'], string> = { linear: 'Linear', log: 'Logarithmic', exp: 'Exponential', poly: 'Polynomial' };

  /** Polynomial degree bounds (`TrendLine.degree` 2..5). */
  export const DEGREE = { min: 2, max: 5 } as const;

  /** Models in menu order (re-exported for the select). */
  export const MODELS: readonly TrendLine['model'][] = TREND_MODELS;

  /** Clamp a raw degree to the contract range; the minimum when not a number. */
  export function clampDegree(raw: string | number): number {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return DEGREE.min;
    return Math.max(DEGREE.min, Math.min(DEGREE.max, n));
  }

  /** Switch the model, seeding `degree` for `poly` and dropping it otherwise. */
  export function setModel(t: TrendLine, model: TrendLine['model']): void {
    t.model = model;
    if (model === 'poly') t.degree = t.degree ?? DEGREE.min; else delete t.degree;
  }
</script>

<script lang="ts">
  /**
   * Trend line dialog (T4, D-16): enable, model (linear / log / exp / poly),
   * polynomial degree, per-series, show equation, color. Each control is one
   * `spec.patch` on `VizSpec.trendLine` (R-SPEC). Tokens only (R-TOKENS).
   * The fit itself is the chart layer's (T2).
   */
  import { spec } from '$stores/spec.svelte';
  import Dialog from './Dialog.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  const trend = $derived(spec.value.trendLine);

  function patchTrend(fn: (t: TrendLine) => void): void {
    spec.patch((d) => fn(d.trendLine));
  }
</script>

<Dialog {open} {onclose} title="Trend line" width="sm">
  {#snippet footer()}
    <button type="button" class="btn btn--primary" onclick={onclose}>Done</button>
  {/snippet}

  <div class="form">
    <label class="row row--check">
      <input type="checkbox" checked={trend.enabled} aria-label="Show trend line" onchange={(e) => { const v = e.currentTarget.checked; patchTrend((t) => { t.enabled = v; }); }} />
      <span>Show trend line</span>
    </label>

    <label class="row">
      <span>Model</span>
      <select value={trend.model} aria-label="Model" disabled={!trend.enabled} onchange={(e) => { const m = e.currentTarget.value as TrendLine['model']; patchTrend((t) => setModel(t, m)); }}>
        {#each MODELS as m (m)}<option value={m}>{MODEL_LABEL[m]}</option>{/each}
      </select>
    </label>

    {#if trend.model === 'poly'}
      <label class="row">
        <span>Degree ({DEGREE.min}–{DEGREE.max})</span>
        <input type="number" class="num" min={DEGREE.min} max={DEGREE.max} step="1" aria-label="Degree" value={trend.degree ?? DEGREE.min} disabled={!trend.enabled}
          onchange={(e) => { const d = clampDegree(e.currentTarget.value); patchTrend((t) => { t.degree = d; }); }} />
      </label>
    {/if}

    <label class="row row--check">
      <input type="checkbox" checked={trend.perSeries} aria-label="One trend line per series" disabled={!trend.enabled} onchange={(e) => { const v = e.currentTarget.checked; patchTrend((t) => { t.perSeries = v; }); }} />
      <span>One line per color series</span>
    </label>

    <label class="row row--check">
      <input type="checkbox" checked={trend.showEquation} aria-label="Show equation" disabled={!trend.enabled} onchange={(e) => { const v = e.currentTarget.checked; patchTrend((t) => { t.showEquation = v; }); }} />
      <span>Show equation and R²</span>
    </label>

    <div class="row">
      <span>Color</span>
      <div class="inline">
        <input type="color" aria-label="Color" value={trend.color ?? '#000000'} disabled={!trend.enabled} onchange={(e) => { const c = e.currentTarget.value; patchTrend((t) => { t.color = c; }); }} />
        {#if trend.color}
          <span class="num muted">{trend.color}</span>
          <button type="button" class="btn" onclick={() => patchTrend((t) => { delete t.color; })}>Auto</button>
        {:else}
          <span class="muted">Automatic (series color)</span>
        {/if}
      </div>
    </div>
  </div>
</Dialog>

<style>
  .muted { color: var(--text-muted); font-size: 0.82rem; }
  .form { display: flex; flex-direction: column; gap: var(--space-sm); font-size: 0.82rem; }
  .row { display: flex; flex-direction: column; gap: var(--space-xs); }
  .row > span { color: var(--text-muted); font-weight: 600; }
  .row--check { flex-direction: row; align-items: center; gap: var(--space-sm); min-height: var(--touch-target); }
  .row--check > span { color: var(--text-secondary); font-weight: 500; }
  .inline { display: flex; align-items: center; gap: var(--space-sm); min-height: var(--touch-target); }
  input[type='number'], select {
    min-height: var(--touch-target);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
  }
  input[type='checkbox'] { width: var(--space-md); height: var(--space-md); accent-color: var(--hydro); }
  input[type='color'] { width: var(--touch-target); height: var(--touch-target); padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: none; }
  input:disabled, select:disabled { opacity: 0.45; }
</style>
