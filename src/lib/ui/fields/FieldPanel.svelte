<script lang="ts" module>
  import type { FieldMeta as FieldMetaT, GeoRole, VizSpec } from '../../core/types';

  /** One field's `typeOverrides` entry. */
  type TypeOverride = VizSpec['typeOverrides'][string];

  /** The geographic role in force: the override when the spec carries one (`null` = none), else the inferred role. */
  export function effectiveGeoRole(overrides: VizSpec['typeOverrides'], m: FieldMetaT): GeoRole | null {
    const o = overrides[m.name];
    return o && 'geoRole' in o ? (o.geoRole ?? null) : (m.geoRole ?? null);
  }

  /**
   * The override entry after choosing `role` for a field (Tableau "Geographic
   * Role ▸ …", None clears): a role equal to the inferred one needs no
   * override; None over an inferred role is recorded as `null`; an entry
   * with nothing left is dropped (`undefined`).
   */
  export function withGeoRole(cur: TypeOverride | undefined, inferred: GeoRole | null, role: GeoRole | null): TypeOverride | undefined {
    const next: TypeOverride = { ...(cur ?? {}) };
    delete next.geoRole;
    if (role !== inferred) next.geoRole = role;
    return Object.keys(next).length ? next : undefined;
  }
</script>

<script lang="ts">
  /**
   * The data pane: Dimensions and Measures groups (by effective role, i.e.
   * `FieldMeta.role` unless `spec.typeOverrides` says otherwise), a search
   * box, and the field context menu: Add to shelf…, Convert to
   * Dimension/Measure, Change Data Type, Geographic role (v2), Day/Month
   * toggle for ambiguous dates, Default format…. Role, type and geo-role
   * changes are written to `spec.typeOverrides` (one undo step); the dataset
   * store (S5) re-parses the column from there. `meta` is a prop so the pane
   * works standalone.
   */
  import { onMount } from 'svelte';
  import type { DataType, FieldMeta, Role, ShelfId } from '../../core/types';
  import { ALL_SHELVES, DATA_TYPES, GEO_ROLES } from '../../core/constants';
  import Icon from '../shared/Icon.svelte';
  import Menu, { type MenuItem, type MenuSection } from '../shared/Menu.svelte';
  import { dragController, type TapEvent } from '../drag/drag-controller';
  import { spec } from '../../stores/spec.svelte';
  import { ui } from '../../stores/ui.svelte';
  import { applyDrop, fieldPayload, selectionToken } from '../shelves/drop-rules';
  import { SHELF_LABEL } from '../shelves/shelf-labels';
  import FieldItem, { GEO_ROLE_LABEL } from './FieldItem.svelte';

  let {
    meta = [],
    onFormat,
    onChangeType,
    onChangeGeoRole,
  }: {
    meta?: FieldMeta[];
    /** Open the Format dialog (S5) for a field's default format. */
    onFormat?: (field: string) => void;
    /** Notified after a type override is written, so the dataset store can re-parse. */
    onChangeType?: (field: string, type: DataType, dateFormat?: string) => void;
    /** Notified after a geo-role override is written (`null` = none), so the dataset store can refresh `meta` (`dataset.setGeoRole`). */
    onChangeGeoRole?: (field: string, role: GeoRole | null) => void;
  } = $props();

  let search = $state('');
  let menu = $state<{ meta: FieldMeta; anchor: HTMLElement } | null>(null);
  let root = $state<HTMLElement | null>(null);

  /** A hidden instance (the desktop pane under `display:none` on phones) must not react to taps. */
  function isShown(): boolean { return !!root && root.getClientRects().length > 0; }

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
      if (!next.type && !next.role && !next.dateFormat && !('geoRole' in next)) delete d.typeOverrides[field];
      else d.typeOverrides[field] = next;
    });
  }

  function setGeoRole(m: FieldMeta, role: GeoRole | null): void {
    spec.patch((d) => {
      const next = withGeoRole(d.typeOverrides[m.name], m.geoRole ?? null, role);
      if (next) d.typeOverrides[m.name] = next; else delete d.typeOverrides[m.name];
    });
    onChangeGeoRole?.(m.name, role);
  }

  function addTo(m: FieldMeta, shelf: ShelfId): void {
    const out = applyDrop(spec, meta, fieldPayload(m.name), shelf);
    if (!out) ui.toast('Could not place that field', 'warn');
  }

  /** A field tapped on a phone: arm tap-to-place and jump to the shelves sheet. */
  function onTap(e: TapEvent): void {
    if (e.payload.kind !== 'field' || !isShown()) return;
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
    const geo = effectiveGeoRole(spec.value.typeOverrides, m);
    const geoItems: MenuItem[] = [
      ...GEO_ROLES.map((g): MenuItem => ({ id: `geo-${g}`, label: GEO_ROLE_LABEL[g], checked: geo === g, onSelect: () => setGeoRole(m, g) })),
      { id: 'geo-none', label: 'None', checked: geo === null, onSelect: () => setGeoRole(m, null) },
    ];
    const sections: MenuSection[] = [
      { items: [{ id: 'add', label: 'Add to shelf', icon: 'plus', children: [{ items: addItems }] }] },
      { items: [
        convert,
        { id: 'type', label: 'Change data type', hint: TYPE_LABEL[type], children: [{ items: typeItems }] },
        { id: 'geo', label: 'Geographic role', hint: geo ? GEO_ROLE_LABEL[geo] : 'None', children: [{ items: geoItems }] },
      ] },
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

  const menuAnchor = $derived(menu?.anchor ?? null);
  const menuSectionsNow = $derived(menu ? menuSections(menu.meta) : []);
</script>

<div class="fields" bind:this={root}>
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
        <FieldItem meta={m} role="dimension" geoRole={effectiveGeoRole(spec.value.typeOverrides, m)} selected={ui.tapSelection === `field:${m.name}`} onMenu={(mm, a) => { menu = { meta: mm, anchor: a }; }} />
      {/each}
    </section>
    <section class="fields__group" aria-label="Measures">
      <div class="eyebrow fields__title">Measures <span class="num">{measures.length}</span></div>
      {#each measures as m (m.name)}
        <FieldItem meta={m} role="measure" geoRole={effectiveGeoRole(spec.value.typeOverrides, m)} selected={ui.tapSelection === `field:${m.name}`} onMenu={(mm, a) => { menu = { meta: mm, anchor: a }; }} />
      {/each}
    </section>
    {#if visible.length === 0}
      <p class="fields__empty">No field matches “{search}”.</p>
    {/if}
  {/if}
</div>

{#if menu}
  <!-- Derived props stay readable after the menu closes: Menu positions itself in a deferred tick. -->
  <Menu anchor={menuAnchor} sections={menuSectionsNow} title={menu.meta.name} onClose={() => { menu = null; }} />
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
