<script lang="ts">
  /**
   * One shelf (Columns, Rows, Filters, or a Marks channel): a labelled drop
   * zone holding pills in nesting order. Shows the drop indicator at the
   * hovered index while a drag is over it, an empty-state hint, and an
   * "armed" state when a tap-to-place selection is waiting for a shelf tap
   * (phones, D-11). Drops are applied by ShelfPanel through the controller.
   */
  import type { Pill as PillT, ShelfId } from '../../core/types';
  import type { IconName } from '../shared/Icon.svelte';
  import Icon from '../shared/Icon.svelte';
  import { dropzone } from '../drag/use-dropzone';
  import Pill from './Pill.svelte';

  let {
    id,
    label,
    pills,
    orientation = 'horizontal',
    icon,
    hoverIndex = null,
    selectedId = null,
    armed = false,
    filteredIds = [],
    single = false,
    onPillMenu,
  }: {
    id: ShelfId;
    label: string;
    pills: PillT[];
    orientation?: 'horizontal' | 'vertical';
    icon?: IconName;
    /** Drop index while a drag hovers this shelf; null otherwise. */
    hoverIndex?: number | null;
    /** Pill id selected by tap (phones). */
    selectedId?: string | null;
    /** A tap selection is waiting: tapping the shelf places it here. */
    armed?: boolean;
    /** Pill ids whose filter entry is set (Filters shelf dot). */
    filteredIds?: string[];
    /** One-pill shelf (replaces on drop). */
    single?: boolean;
    onPillMenu: (pill: PillT, shelf: ShelfId, anchor: HTMLElement) => void;
  } = $props();

  const hint = $derived(armed ? 'Tap to place here' : single ? 'Drop a field' : 'Drop fields here');
</script>

<div
  class="shelf shelf--{orientation}"
  class:shelf--armed={armed}
  class:shelf--hover={hoverIndex !== null}
  role="group"
  aria-label="{label} shelf"
  data-shelf={id}
  use:dropzone={{ id, orientation }}
>
  <div class="shelf__label">
    {#if icon}<span class="shelf__icon" aria-hidden="true"><Icon name={icon} /></span>{/if}
    <span>{label}</span>
  </div>
  <div class="shelf__pills">
    {#each pills as pill, i (pill.id)}
      {#if hoverIndex === i}<span class="shelf__indicator" aria-hidden="true"></span>{/if}
      <Pill {pill} shelf={id} selected={selectedId === pill.id} hasFilter={filteredIds.includes(pill.id)} onMenu={onPillMenu} />
    {/each}
    {#if hoverIndex !== null && hoverIndex >= pills.length}<span class="shelf__indicator" aria-hidden="true"></span>{/if}
    {#if pills.length === 0}
      <!-- Only on an empty shelf: arming must not change layout (a bottom sheet would shift under the finger). -->
      <span class="shelf__hint" aria-hidden={armed ? undefined : 'true'}>{hint}</span>
    {/if}
  </div>
</div>

<style>
  .shelf {
    display: flex;
    align-items: stretch;
    gap: var(--space-sm);
    min-height: calc(var(--pill-height) + 2 * var(--space-sm));
    padding: var(--space-xs) var(--space-sm);
    background: var(--shelf-bg);
    border: 1px dashed var(--shelf-border);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }
  .shelf--hover, .shelf:global(.is-drop-over) { background: var(--drop-target); border-color: var(--drop-target-border); border-style: solid; }
  .shelf--armed { border-color: var(--drop-target-border); cursor: pointer; }
  .shelf__label {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex: none;
    width: 68px;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--shelf-label);
  }
  .shelf__icon { display: inline-flex; color: var(--text-muted); }
  .shelf__pills {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
    min-width: 0;
  }
  .shelf--vertical .shelf__pills { flex-direction: column; align-items: stretch; }
  .shelf--vertical .shelf__pills :global(.pill) { justify-content: flex-start; }
  .shelf__indicator {
    flex: none;
    width: 3px;
    align-self: stretch;
    min-height: var(--pill-height);
    border-radius: var(--pill-radius);
    background: var(--drop-target-border);
  }
  .shelf--vertical .shelf__indicator { width: auto; height: 3px; min-height: 0; }
  .shelf__hint {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-style: italic;
    padding: 0 var(--space-xs);
  }
  .shelf--armed .shelf__hint { color: var(--hydro-text); font-style: normal; font-weight: 600; }
  @media (max-width: 900px) {
    .shelf { min-height: calc(var(--touch-target) + 2 * var(--space-sm)); }
    .shelf__label { width: 56px; }
  }
</style>
