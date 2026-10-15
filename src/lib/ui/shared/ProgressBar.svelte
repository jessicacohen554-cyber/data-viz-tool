<script lang="ts">
  /**
   * Load progress bar. `max === null` renders an indeterminate sweep (row
   * count unknown while streaming); otherwise a determinate fill.
   */
  let {
    value,
    max,
    label = '',
  }: {
    value: number;
    max: number | null;
    /** Text shown beside the bar (e.g. "Parsing 120,000 rows"). */
    label?: string;
  } = $props();

  const ratio = $derived(max && max > 0 ? Math.min(1, Math.max(0, value / max)) : null);
  const pct = $derived(ratio === null ? null : Math.round(ratio * 100));
</script>

<div class="progress" role="progressbar" aria-label={label || 'Loading'} aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct ?? undefined}>
  <div class="progress__track">
    <div class="progress__fill" class:progress__fill--indeterminate={ratio === null} style={ratio === null ? '' : `width:${ratio * 100}%`}></div>
  </div>
  {#if label || pct !== null}
    <div class="progress__label">
      <span>{label}</span>
      {#if pct !== null}<span class="num">{pct}%</span>{/if}
    </div>
  {/if}
</div>

<style>
  .progress { display: flex; flex-direction: column; gap: var(--space-xs); width: 100%; }
  .progress__track {
    position: relative;
    height: 6px;
    overflow: hidden;
    border-radius: var(--pill-radius);
    background: var(--border-light);
  }
  .progress__fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--hydro);
    border-radius: inherit;
    transition: width var(--transition-fast);
  }
  .progress__fill--indeterminate {
    width: 35%;
    animation: progress-sweep 1.2s ease-in-out infinite;
  }
  @keyframes progress-sweep {
    from { left: -35%; }
    to { left: 100%; }
  }
  .progress__label {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
    color: var(--text-muted);
  }
</style>
