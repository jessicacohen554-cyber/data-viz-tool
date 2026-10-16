<script lang="ts" module>
  import type { GeoRole } from '../../core/types';

  /** Menu and badge labels per geographic role (Tableau's names; `ercot-zone` is this app's). */
  export const GEO_ROLE_LABEL: Record<GeoRole, string> = {
    country: 'Country', 'us-state': 'US State', 'us-county': 'US County', 'ercot-zone': 'ERCOT zone',
    latitude: 'Latitude', longitude: 'Longitude',
  };

  /** Area roles draw a globe; latitude/longitude draw a pin (docs/TABLEAU-SPEC.md §1.1 geographic glyph). */
  export function geoGlyph(role: GeoRole): 'globe' | 'pin' {
    return role === 'latitude' || role === 'longitude' ? 'pin' : 'globe';
  }

  /** Inline SVG paths of the two geo glyphs (24-unit box; `shared/Icon.svelte` has no geo icons yet, T5 seam). */
  const GEO_PATH: Record<'globe' | 'pin', string> = {
    globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 9h-3a15 15 0 0 0-1.3-5.6A8 8 0 0 1 18.9 11zM12 4.1c.9 1.2 1.7 3.5 1.9 6.9h-3.8c.2-3.4 1-5.7 1.9-6.9zM9.4 5.4A15 15 0 0 0 8.1 11h-3a8 8 0 0 1 4.3-5.6zM5.1 13h3c.1 2.1.6 4 1.3 5.6A8 8 0 0 1 5.1 13zM12 19.9c-.9-1.2-1.7-3.5-1.9-6.9h3.8c-.2 3.4-1 5.7-1.9 6.9zm2.6-1.3a15 15 0 0 0 1.3-5.6h3a8 8 0 0 1-4.3 5.6z',
    pin: 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z',
  };
</script>

<script lang="ts">
  /**
   * One row of the data pane: type icon in its `--type-*` colour (a globe or
   * pin when the field has a geographic role, v2), the field name, a
   * cardinality/null hint, and the caret that opens the field menu. The row
   * is a drag source (`use:draggable`); Enter/Space or the context-menu key
   * open the menu (keyboard "Add to…").
   */
  import type { FieldMeta, Role } from '../../core/types';
  import Icon, { typeIcon } from '../shared/Icon.svelte';
  import { draggable } from '../drag/use-draggable';
  import { fieldPayload } from '../shelves/drop-rules';

  let {
    meta,
    role,
    geoRole = meta.geoRole ?? null,
    selected = false,
    onMenu,
  }: {
    meta: FieldMeta;
    /** Effective role (after `typeOverrides`), which decides the group. */
    role: Role;
    /** Effective geographic role (after `typeOverrides`); defaults to the inferred one. */
    geoRole?: GeoRole | null;
    /** Tap-to-place selection (phones). */
    selected?: boolean;
    onMenu: (meta: FieldMeta, anchor: HTMLElement) => void;
  } = $props();

  let el = $state<HTMLElement | null>(null);

  const typeClass = $derived(
    meta.type === 'number' || meta.type === 'integer' ? 'number'
      : meta.type === 'date' || meta.type === 'datetime' ? 'date'
      : meta.type === 'boolean' ? 'boolean' : 'string',
  );
  const hint = $derived.by(() => {
    const parts: string[] = [];
    if (meta.cardinality > 0) parts.push(`${meta.cardinality.toLocaleString()} distinct`);
    if (meta.nullCount > 0) parts.push(`${meta.nullCount.toLocaleString()} null`);
    if (meta.parseErrors > 0) parts.push(`${meta.parseErrors.toLocaleString()} unparsed`);
    return parts.join(' · ');
  });

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ContextMenu') {
      e.preventDefault();
      if (el) onMenu(meta, el);
    }
  }
</script>

<div
  class="field field--{role}"
  class:field--selected={selected}
  class:field--warn={meta.dateAmbiguous || meta.parseErrors > 0}
  role="button"
  tabindex="0"
  aria-label="{meta.name}, {meta.type} {role}{geoRole ? `, ${GEO_ROLE_LABEL[geoRole]}` : ''}"
  aria-haspopup="menu"
  title={hint}
  data-field={meta.name}
  data-geo-role={geoRole ?? undefined}
  bind:this={el}
  use:draggable={() => fieldPayload(meta.name)}
  onkeydown={onKey}
  oncontextmenu={(e) => { e.preventDefault(); if (el) onMenu(meta, el); }}
>
  {#if geoRole}
    <span class="field__type field__type--geo" aria-hidden="true" title={GEO_ROLE_LABEL[geoRole]}>
      <svg class="field__geo" viewBox="0 0 24 24"><path d={GEO_PATH[geoGlyph(geoRole)]} fill="currentColor" /></svg>
    </span>
  {:else}
    <span class="field__type field__type--{typeClass}" aria-hidden="true"><Icon name={typeIcon(meta.type)} /></span>
  {/if}
  <span class="field__name">{meta.name}</span>
  {#if meta.highCardinality}<span class="field__badge" title="High cardinality: needs a Top N filter on a discrete axis">∞</span>{/if}
  {#if meta.dateAmbiguous}<span class="field__badge field__badge--warn" title="Day/month order ambiguous">?</span>{/if}
  <button
    type="button"
    class="field__caret"
    aria-label="Field options"
    tabindex="-1"
    onclick={(e) => { e.stopPropagation(); if (el) onMenu(meta, el); }}
  >
    <Icon name="chevron-down" />
  </button>
</div>

<style>
  .field {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-height: 30px;
    padding: 2px var(--space-xs) 2px var(--space-sm);
    border-radius: var(--radius-sm);
    font-size: 0.82rem;
    color: var(--text-secondary);
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
  }
  .field:hover { background: var(--bg-page); }
  .field--selected { box-shadow: inset 0 0 0 2px var(--hydro); background: var(--drop-target); }
  .field:global(.is-dragging) { opacity: 0.4; }
  .field__type {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.6em;
    flex: none;
    font-size: 0.9em;
  }
  .field__type--string { color: var(--type-string); }
  .field__type--number { color: var(--type-number); }
  .field__type--date { color: var(--type-date); }
  .field__type--boolean { color: var(--type-boolean); }
  .field__type--geo { color: var(--info); }
  .field__geo { width: 1.1em; height: 1.1em; display: block; }
  .field__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .field--measure .field__name { color: var(--pill-continuous-text); }
  .field--dimension .field__name { color: var(--pill-discrete-text); }
  .field__badge {
    flex: none;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--text-muted);
    padding: 0 var(--space-xs);
    border-radius: var(--pill-radius);
    background: var(--border-light);
  }
  .field__badge--warn { color: var(--amber-text); }
  .field__caret {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    opacity: 0;
  }
  .field:hover .field__caret, .field:focus-within .field__caret { opacity: 1; }
  .field__caret:hover { background: var(--border-light); }
  @media (max-width: 900px) {
    .field { min-height: var(--touch-target); font-size: 0.9rem; }
    .field__caret { opacity: 1; width: 40px; height: 40px; }
  }
</style>
