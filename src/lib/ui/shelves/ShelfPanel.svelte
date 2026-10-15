<script lang="ts">
  /**
   * The worksheet's shelf area: Columns, Rows, Filters and the Marks card.
   * This is the one subscriber to the drag controller for drops: it applies
   * `drop-rules.ts` to the spec store, shows the hover indicator, runs the
   * tap-to-place fallback (`ui.tapSelection`), and hosts the pill menu.
   * `meta` arrives as a prop so the panel renders standalone until the
   * dataset store (S5) lands; the Format / Filter dialogs are reached
   * through callback props.
   */
  import { onMount } from 'svelte';
  import type { FieldMeta, Pill, ShelfId } from '../../core/types';
  import { MAIN_SHELVES } from '../../core/constants';
  import { dragController, type DropEvent, type HoverEvent, type TapEvent, type ZoneTapEvent } from '../drag/drag-controller';
  import { spec } from '../../stores/spec.svelte';
  import { ui } from '../../stores/ui.svelte';
  import { applyDrop, findMeta, payloadFromToken, selectionToken } from './drop-rules';
  import { SHELF_ICON, SHELF_LABEL } from './shelf-labels';
  import MarksCard from './MarksCard.svelte';
  import PillMenu from './PillMenu.svelte';
  import Shelf from './Shelf.svelte';

  let {
    meta = [],
    showMarks = true,
    onFormat,
    onFilter,
  }: {
    meta?: FieldMeta[];
    /** Render the Marks card below the main shelves (off when it sits in its own sheet). */
    showMarks?: boolean;
    /** Open the Format dialog (S5) for a pill. */
    onFormat?: (pillId: string) => void;
    /** Open the Filter dialog (S5) for a pill; also called right after a drop on Filters. */
    onFilter?: (pillId: string) => void;
  } = $props();

  let hover = $state<{ zone: ShelfId | null; index: number } | null>(null);
  let menu = $state<{ pill: Pill; shelf: ShelfId; anchor: HTMLElement } | null>(null);

  const armed = $derived(ui.tapSelection !== null);
  const filteredIds = $derived(spec.value.filters.map((f) => f.pillId));

  function drop(payload: DropEvent['payload'], zone: ShelfId, index?: number): void {
    const out = applyDrop(spec, meta, payload, zone, index);
    if (!out) { ui.toast('Could not place that field', 'warn'); return; }
    if (out.filterCreated) onFilter?.(out.pill.id);
  }

  function onDrop(e: DropEvent): void { drop(e.payload, e.zone, e.index); }
  function onHover(e: HoverEvent): void { hover = e.zone ? { zone: e.zone, index: e.index } : null; }
  function onEnd(): void { hover = null; }

  /** A pill tapped: on phones select it for placement; on desktop open its menu. */
  function onTap(e: TapEvent): void {
    if (e.payload.kind !== 'pill') return;
    if (ui.isMobile) {
      const token = selectionToken(e.payload);
      ui.tapSelection = ui.tapSelection === token ? null : token;
      if (ui.tapSelection) ui.toast(`Tap a shelf to move ${e.payload.field}`, 'info');
      return;
    }
    const found = spec.findPill(e.payload.pillId);
    if (found) menu = { pill: found.pill, shelf: found.shelf, anchor: e.element };
  }

  /** A shelf tapped while a selection waits: place it there. */
  function onZoneTap(e: ZoneTapEvent): void {
    const token = ui.tapSelection;
    if (!token) return;
    const payload = payloadFromToken(token, spec);
    ui.tapSelection = null;
    if (!payload) return;
    drop(payload, e.zone);
  }

  onMount(() => {
    const ctl = dragController();
    const offs = [ctl.on('drop', onDrop), ctl.on('hover', onHover), ctl.on('end', onEnd), ctl.on('tap', onTap), ctl.on('zonetap', onZoneTap)];
    return () => { for (const off of offs) off(); };
  });

  function openMenu(pill: Pill, shelf: ShelfId, anchor: HTMLElement): void {
    menu = { pill, shelf, anchor };
  }

  /** Keep the open menu bound to the live pill (its label/aggregation change under it). */
  const menuPill = $derived(menu ? spec.findPill(menu.pill.id) : null);
  // Close the menu when its pill is removed from under it.
  $effect(() => { if (menu && !menuPill) menu = null; });
</script>

<div class="shelves" class:shelves--armed={armed}>
  {#each MAIN_SHELVES as id (id)}
    <Shelf
      {id}
      label={SHELF_LABEL[id]}
      icon={SHELF_ICON[id]}
      pills={spec.value.shelves[id]}
      orientation={id === 'filters' ? 'vertical' : 'horizontal'}
      hoverIndex={hover && hover.zone === id ? hover.index : null}
      selectedId={ui.tapSelection}
      {armed}
      {filteredIds}
      onPillMenu={openMenu}
    />
  {/each}
  {#if showMarks}
    <MarksCard {meta} {hover} selectedId={ui.tapSelection} {armed} onPillMenu={openMenu} />
  {/if}
  {#if armed}
    <button type="button" class="btn shelves__cancel" onclick={() => { ui.tapSelection = null; }}>Cancel placement</button>
  {/if}
</div>

{#if menu && menuPill}
  <PillMenu
    pill={menuPill.pill}
    shelf={menuPill.shelf}
    anchor={menu.anchor}
    meta={findMeta(meta, menuPill.pill.field)}
    onClose={() => { menu = null; }}
    {onFormat}
    {onFilter}
  />
{/if}

<style>
  .shelves { display: flex; flex-direction: column; gap: var(--space-sm); }
  .shelves__cancel { align-self: flex-start; }
</style>
