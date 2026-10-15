<script lang="ts">
  /**
   * Show Me grid (CHARTS.md §2–§3): every chart type by picker group, eligible
   * ones enabled, the rest disabled with the reason as tooltip; the suggested
   * type is marked "Recommended". Choosing a type rearranges the pills in one
   * `spec.patch` (one undo step). Targets are ≥ 44px on phones (D-11).
   */
  import type { ChartTypeId, FieldMeta } from '$core/types';
  import { CHART_TYPES, PICKER_GROUPS } from '$charts/registry';
  import { arrangeFor, eligibility, suggest } from '$charts/show-me';
  import { spec } from '$stores/spec.svelte';
  import { ui } from '$stores/ui.svelte';

  let { meta = [] }: { meta?: FieldMeta[] } = $props();

  const states = $derived(new Map(eligibility(spec.value, meta).map((e) => [e.id, e])));
  const recommended = $derived(suggest(spec.value, meta));
  const current = $derived(spec.value.chartType);

  function choose(id: ChartTypeId): void {
    if (!states.get(id)?.ok || id === current) return;
    spec.patch((d) => arrangeFor(d, id));
    if (ui.isMobile) ui.sheet = 'none';
  }
</script>

<div class="picker" role="listbox" aria-label="Chart type">
  {#each PICKER_GROUPS as group (group.label)}
    <div class="picker__group">
      <div class="eyebrow picker__group-label">{group.label}</div>
      <div class="picker__grid">
        {#each group.ids as id (id)}
          {@const def = CHART_TYPES[id]}
          {@const state = states.get(id)}
          {#if def}
            <button
              type="button"
              role="option"
              class="picker__item"
              class:picker__item--active={id === current}
              class:picker__item--disabled={!state?.ok}
              aria-selected={id === current}
              aria-disabled={!state?.ok}
              title={state?.ok ? def.label : `${def.label} — ${state?.reason ?? ''}`}
              onclick={() => choose(id)}
            >
              <span class="picker__icon" aria-hidden="true">{@html def.icon}</span>
              <span class="picker__label">{def.label}</span>
              {#if id === recommended && state?.ok}<span class="picker__badge">Recommended</span>{/if}
              {#if !state?.ok}<span class="picker__reason">{state?.reason}</span>{/if}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: var(--space-md); }
  .picker__group-label { margin-bottom: var(--space-xs); }
  .picker__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(calc(var(--touch-target) * 2), 1fr));
    gap: var(--space-xs);
  }
  .picker__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    min-height: var(--touch-target);
    padding: var(--space-sm) var(--space-xs);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: var(--pill-font);
    line-height: 1.2;
    text-align: center;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }
  .picker__item:hover:not(.picker__item--disabled) { background: var(--bg-page); border-color: var(--border); }
  .picker__item--active { border-color: var(--hydro); background: var(--drop-target); color: var(--hydro-text); }
  .picker__item--disabled { color: var(--text-muted); opacity: 0.55; cursor: not-allowed; }
  .picker__icon { display: inline-flex; color: currentColor; }
  .picker__badge {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--green-text);
  }
  .picker__reason { display: none; font-size: 0.68rem; color: var(--text-muted); }
  @media (max-width: 900px) {
    .picker__grid { grid-template-columns: repeat(3, 1fr); }
    .picker__item { min-height: calc(var(--touch-target) + var(--space-md)); }
    .picker__item--disabled .picker__reason { display: block; }
  }
</style>
