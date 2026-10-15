<script lang="ts">
  /** KPI tile (CHARTS.md #32): one formatted number, its label, an optional sign-colored delta. */
  import type { KpiModel } from '$charts/types/kpi';

  let { model }: { model: KpiModel } = $props();
</script>

<div class="kpi">
  <div class="eyebrow kpi__label">{model.label}</div>
  <div class="kpi__value num">{model.value}</div>
  {#if model.delta}
    <div class="kpi__delta num" class:kpi__delta--positive={model.delta.sign === 'positive'} class:kpi__delta--negative={model.delta.sign === 'negative'}>
      {model.delta.text} <span class="kpi__delta-label">{model.delta.label}</span>
    </div>
  {/if}
</div>

<style>
  .kpi {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-lg);
    text-align: center;
  }
  .kpi__value {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 3rem;
    line-height: 1;
    letter-spacing: -0.03em;
    color: var(--text-primary);
  }
  .kpi__delta { font-weight: 600; color: var(--text-muted); }
  .kpi__delta--positive { color: var(--green-text); }
  .kpi__delta--negative { color: var(--red-text); }
  .kpi__delta-label { font-family: var(--font-body); font-weight: 400; color: var(--text-muted); }
  @media (max-width: 900px) {
    .kpi__value { font-size: 2.4rem; }
  }
</style>
