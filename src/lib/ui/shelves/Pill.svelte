<script lang="ts">
  /**
   * One pill on a shelf: blue (discrete) or green (continuous) per
   * docs/TABLEAU-SPEC.md §4, labelled by `pillLabel()`. The body is the drag
   * handle (`use:draggable`); the caret opens the pill menu; Enter/Space and
   * the context-menu key open it too (keyboard "Move to…" lives inside).
   * `data-drop-item` lets the controller compute drop indices.
   */
  import type { Pill, ShelfId } from '../../core/types';
  import Icon from '../shared/Icon.svelte';
  import { draggable } from '../drag/use-draggable';
  import { pillDescription, pillLabel } from './pill-label';
  import { pillPayload } from './drop-rules';

  let {
    pill,
    shelf,
    selected = false,
    hasFilter = false,
    onMenu,
  }: {
    pill: Pill;
    shelf: ShelfId;
    /** Tap-to-place selection (phones). */
    selected?: boolean;
    /** Filters shelf: whether the pill's filter is set (dot). */
    hasFilter?: boolean;
    /** Open the pill menu anchored on the element. */
    onMenu: (pill: Pill, shelf: ShelfId, anchor: HTMLElement) => void;
  } = $props();

  let el = $state<HTMLElement | null>(null);

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ContextMenu') {
      e.preventDefault();
      if (el) onMenu(pill, shelf, el);
    }
  }
</script>

<div
  class="pill pill--{pill.continuity}"
  class:pill--selected={selected}
  role="button"
  tabindex="0"
  aria-label={pillDescription(pill)}
  aria-haspopup="menu"
  data-drop-item={pill.id}
  data-pill-id={pill.id}
  bind:this={el}
  use:draggable={() => pillPayload(pill, shelf)}
  onkeydown={onKey}
  oncontextmenu={(e) => { e.preventDefault(); if (el) onMenu(pill, shelf, el); }}
>
  <span class="pill__grip" aria-hidden="true"><Icon name="grip" /></span>
  <span class="pill__label">{pillLabel(pill)}</span>
  {#if hasFilter}<span class="pill__dot" aria-hidden="true"></span>{/if}
  <button
    type="button"
    class="pill__caret"
    aria-label="Pill options"
    tabindex="-1"
    onclick={(e) => { e.stopPropagation(); if (el) onMenu(pill, shelf, el); }}
  >
    <Icon name="chevron-down" />
  </button>
</div>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: var(--pill-height);
    max-width: 100%;
    padding: 0 2px 0 var(--space-xs);
    border: 1px solid var(--pill-discrete-border);
    border-radius: var(--pill-radius);
    background: var(--pill-discrete-bg);
    color: var(--pill-discrete-text);
    font-size: var(--pill-font);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    transition: box-shadow var(--transition-fast), opacity var(--transition-fast);
  }
  .pill--continuous {
    border-color: var(--pill-continuous-border);
    background: var(--pill-continuous-bg);
    color: var(--pill-continuous-text);
  }
  .pill:hover { box-shadow: var(--shadow-sm); }
  .pill--selected { box-shadow: 0 0 0 2px var(--hydro); }
  .pill:global(.is-dragging) { opacity: 0.4; }
  :global(.drag-ghost) { opacity: 0.95; box-shadow: var(--drag-ghost-shadow); cursor: grabbing; }
  :global(body.is-dragging) { cursor: grabbing; }
  :global(body.is-dragging) * { cursor: grabbing !important; }
  .pill__grip { display: inline-flex; opacity: 0.5; }
  .pill__label { overflow: hidden; text-overflow: ellipsis; }
  .pill__dot {
    width: 6px;
    height: 6px;
    border-radius: var(--pill-radius);
    background: currentColor;
    margin-left: 2px;
  }
  .pill__caret {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: var(--pill-radius);
    color: inherit;
    opacity: 0.7;
  }
  .pill__caret:hover { opacity: 1; background: var(--bg-card); }
  @media (max-width: 900px) {
    .pill { height: var(--touch-target); padding-left: var(--space-sm); font-size: 0.9rem; }
    .pill__caret { width: 40px; height: 40px; }
  }
</style>
