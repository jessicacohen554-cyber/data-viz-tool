<script lang="ts">
  /**
   * The data pane: Dimensions and Measures groups (by effective role, i.e.
   * `FieldMeta.role` unless `spec.typeOverrides` says otherwise), a search
   * box, and the field context menu: Add to shelf…, Convert to
   * Dimension/Measure, Change Data Type, Day/Month toggle for ambiguous
   * dates, Default format…. Role and type changes are written to
   * `spec.typeOverrides` (one undo step); the dataset store (S5) re-parses
   * the column from there. `meta` is a prop so the pane works standalone.
   */
  import { onMount } from 'svelte';
  import type { DataType, FieldMeta, Role, ShelfId } from '../../core/types';
  import { ALL_SHELVES, DATA_TYPES } from '../../core/constants';
  import Icon from '../shared/Icon.svelte';
  import Menu, { type MenuItem, type MenuSection } from '../shared/Menu.svelte';
  import { dragController, type TapEvent } from '../drag/drag-controller';
  import { spec } from '../../stores/spec.svelte';
  import { ui } from '../../stores/ui.svelte';
  import { applyDrop, fieldPayload, selectionToken } from '../shelves/drop-rules';
  import { SHELF_LABEL } from '../shelves/shelf-labels';
  import FieldItem from './FieldItem.svelte';

  let {
    meta = [],
    onFormat,
    onChangeType,
  }: {
    meta?: FieldMeta[];
    /** Open the Format dialog (S5) for a field's default format. */
    onFormat?: (field: string) => void;
    /** Notified after a type override is written, so the dataset store can re-parse. */
    onChangeType?: (field: string, type: DataType, dateFormat?: string) => void;
  } = $props();

  let search = $state('');
  let menu = $state<{ meta: FieldMeta; anchor: HTMLElement } | null>(null);

  const TYPE_LABEL: Record<DataType, string> = {
    string: 'String', integer: 'Number (whole)', number: 'Number (decimal)', date: 'Date', datetime: 'Date & Time', boolean: 'Boolean',
  };

  function effectiveRole(m: FieldMeta): Role {
    return spec.value.typeOverrides[m.name]?.role ?? m.role;
  }
  function effectiveType(m: FieldMeta): DataType {
    return spec.value.typeOverrides[m.name]?.type ?? m.type;
  }

  const visible = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return q ? meta.filter((m) => m.name.toLowerCase().includes(q)) : meta;
  });
  const dimensions = $derived(visible.filter((m) => effectiveRole(m) === 'dimension'));
  const measures = $derived(visible.filter((m) => effectiveRole(m) === 'measure'));

  function setOverride(field: string, patch: { type?: DataType; role?: Role; dateFormat?: string }): void {
    spec.patch((d) => {
      const cur = d.typeOverrides[field] ?? {};
      const next = { ...cur, ...patch };
      if (!next.type && !next.role && !next.dateFormat) delete d.typeOverrides[field];
      else d.typeOverrides[field] = next;
    });
  }

  function addTo(m: FieldMeta, shelf: ShelfId): void {
    const out = applyDrop(spec, meta, fieldPayload(m.name), shelf);
    if (!out) ui.toast('Could not place that field', 'warn');
  }

  /** A field tapped on a phone: arm tap-to-place and jump to the shelves sheet. */
  function onTap(e: TapEvent): void {
    if (e.payload.kind !== 'field') return;
    if (ui.isMobile) {
      ui.tapSelection = selectionToken(e.payload);
      ui.toast(`Tap a shelf to place ${e.payload.field}`, 'info');
      ui.sheet = 'shelves';
      return;
    }
    const m = meta.find((x) => x.name === e.payload.field);
    if (m) menu = { meta: m, anchor: e.element };
  }

  onMount(() => dragController().on('tap', onTap));

  function menuSections(m: FieldMeta): MenuSection[] {
    const role = effectiveRole(m);
    const type = effectiveType(m);
    const addItems: MenuItem[] = ALL_SHELVES.map((s) => ({ id: `add-${s}`, label: SHELF_LABEL[s], onSelect: () => addTo(m, s) }));
    const typeItems: MenuItem[] = DATA_TYPES.map((t) => ({
      id: `type-${t}`, label: TYPE_LABEL[t], checked: type === t,
      onSelect: () => { setOverride(m.name, { type: t === m.type ? undefined : t }); onChangeType?.(m.name, t); },
    }));
    const convert: MenuItem = role === 'measure'
      ? { id: 'to-dim', label: 'Convert to Dimension', onSelect: () => setOverride(m.name, { role: m.role === 'dimension' ? undefined : 'dimension' }) }
      : { id: 'to-measure', label: 'Convert to Measure', disabled: type === 'boolean', onSelect: () => setOverride(m.name, { role: m.role === 'measure' ? undefined : 'measure' }) };
    const sections: MenuSection[] = [
      { items: [{ id: 'add', label: 'Add to shelf', icon: 'plus', children: [{ items: addItems }] }] },
      { items: [convert, { id: 'type', label: 'Change data type', hint: TYPE_LABEL[type], children: [{ items: typeItems }] }] },
    ];
    if (m.dateAmbiguous) {
      const swapped = m.dateFormat?.startsWith('d') ?? false;
      sections.push({ items: [{
        id: 'dm', label: swapped ? 'Read as Month/Day' : 'Read as Day/Month', icon: 'calendar',
        onSelect: () => {
          const fmt = m.dateFormat ?? 'MM/dd/yyyy';
          const next = swapped ? fmt.replace(/^d+\/M+/, (s) => s.split('/').reverse().join('/')) : fmt.replace(/^M+\/d+/, (s) => s.split('/').reverse().join('/'));
          setOverride(m.name, { dateFormat: next });
          onChangeType?.(m.name, type, next);
        },
      }] });
    }
    sections.push({ items: [{ id: 'format', label: 'Default format…', disabled: !onFormat, onSelect: () => onFormat?.(m.name) }] });
    return sections;
  }
</script>

<div class="fields">
  <label class="fields__search">
    <span class="fields__search-icon" aria-hidden="true"><Icon name="search" /></span>
    <input type="search" placeholder="Search fields" aria-label="Search fields" bind:value={search} />
  </label>

  {#if meta.length === 0}
    <p class="fields__empty">Open a dataset to see its fields.</p>
  {:else}
    <section class="fields__group" aria-label="Dimensions">
      <div class="eyebrow fields__title">Dimensions <span class="num">{dimensions.length}</span></div>
      {#each dimensions as m (m.name)}
        <FieldItem meta={m} role="dimension" selected={ui.tapSelection === `field:${m.name}`} onMenu={(mm, a) => { menu = { meta: mm, anchor: a }; }} />
      {/each}
    </section>
    <section class="fields__group" aria-label="Measures">
      <div class="eyebrow fields__title">Measures <span class="num">{measures.length}</span></div>
      {#each measures as m (m.name)}
        <FieldItem meta={m} role="measure" selected={ui.tapSelection === `field:${m.name}`} onMenu={(mm, a) => { menu = { meta: mm, anchor: a }; }} />
      {/each}
    </section>
    {#if visible.length === 0}
      <p class="fields__empty">No field matches “{search}”.</p>
    {/if}
  {/if}
</div>

{#if menu}
  <Menu anchor={menu.anchor} sections={menuSections(menu.meta)} title={menu.meta.name} onClose={() => { menu = null; }} />
{/if}

<style>
  .fields { display: flex; flex-direction: column; gap: var(--space-sm); }
  .fields__search {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0 var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--pill-radius);
    background: var(--bg-card);
  }
  .fields__search:focus-within { border-color: var(--hydro); }
  .fields__search-icon { display: inline-flex; color: var(--text-muted); }
  .fields__search input {
    flex: 1;
    min-width: 0;
    min-height: 30px;
    border: none;
    background: none;
    outline: none;
    font-size: 0.82rem;
  }
  .fields__group { display: flex; flex-direction: column; gap: 1px; }
  .fields__title { display: flex; justify-content: space-between; padding: var(--space-xs) var(--space-sm); }
  .fields__empty { margin: 0; padding: var(--space-sm); font-size: 0.82rem; color: var(--text-muted); }
  @media (max-width: 900px) {
    .fields__search input { min-height: var(--touch-target); font-size: 1rem; }
  }
</style>
