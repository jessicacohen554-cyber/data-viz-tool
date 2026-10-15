<script lang="ts">
  /**
   * The Marks card: chart type (from the registry's Show Me eligibility) and
   * the six channel shelves Color / Size / Label / Detail / Tooltip / Shape as
   * vertical drop zones. Drops are handled by ShelfPanel; this component only
   * renders state from the spec store.
   */
  import type { ChartTypeId, FieldMeta, Pill, ShelfId } from '../../core/types';
  import { CHART_TYPE_IDS, MARK_SHELVES, SINGLE_PILL_SHELVES } from '../../core/constants';
  import { eligibility } from '../../charts/show-me';
  import { spec } from '../../stores/spec.svelte';
  import Shelf from './Shelf.svelte';
  import { SHELF_ICON, SHELF_LABEL } from './shelf-labels';

  let {
    meta = [],
    hover = null,
    selectedId = null,
    armed = false,
    onPillMenu,
  }: {
    meta?: FieldMeta[];
    /** Hovered zone + index from the drag controller. */
    hover?: { zone: ShelfId | null; index: number } | null;
    selectedId?: string | null;
    armed?: boolean;
    onPillMenu: (pill: Pill, shelf: ShelfId, anchor: HTMLElement) => void;
  } = $props();

  const eligible = $derived(eligibility(spec.value, meta));

  function setChart(e: Event): void {
    const id = (e.currentTarget as HTMLSelectElement).value as ChartTypeId;
    if (id !== spec.value.chartType) spec.patch((d) => { d.chartType = id; });
  }
</script>

<section class="marks" aria-label="Marks">
  <div class="marks__head">
    <span class="eyebrow">Marks</span>
    <label class="marks__type">
      <span class="marks__type-label">Type</span>
      <select class="marks__select" value={spec.value.chartType} onchange={setChart} aria-label="Chart type">
        {#each CHART_TYPE_IDS as id (id)}
          {@const e = eligible.find((x) => x.id === id)}
          <option value={id} disabled={e ? !e.ok : false}>{id}{e && !e.ok && e.reason ? ` — ${e.reason}` : ''}</option>
        {/each}
      </select>
    </label>
  </div>
  <div class="marks__shelves">
    {#each MARK_SHELVES as id (id)}
      <Shelf
        {id}
        label={SHELF_LABEL[id]}
        icon={SHELF_ICON[id]}
        pills={spec.value.shelves[id]}
        orientation="vertical"
        single={SINGLE_PILL_SHELVES.has(id)}
        hoverIndex={hover && hover.zone === id ? hover.index : null}
        {selectedId}
        {armed}
        {onPillMenu}
      />
    {/each}
  </div>
</section>

<style>
  .marks { display: flex; flex-direction: column; gap: var(--space-sm); }
  .marks__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
  .marks__type { display: flex; align-items: center; gap: var(--space-xs); font-size: 0.72rem; color: var(--text-muted); }
  .marks__select {
    max-width: 160px;
    padding: 4px var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    font-size: 0.78rem;
  }
  .marks__shelves { display: flex; flex-direction: column; gap: var(--space-xs); }
  @media (max-width: 900px) {
    .marks__select { min-height: var(--touch-target); }
  }
</style>
