<script lang="ts" module>
  import type { IconSet } from '../../icons';
  import { DEFAULT_ICON_SET, getIconSet, matchIcon } from '../../icons';

  /** Distinct labels asked of the profile for the Shape pill (sets hold ≤ 14 icons; the rest overflow). */
  export const LABEL_LIMIT = 50;

  /** The set a Shape pill draws with: the spec's `shapeSet` when it names a shipped set, else the default. */
  export function shapeSetOf(id: string | undefined): IconSet {
    return (id === undefined ? undefined : getIconSet(id)) ?? getIconSet(DEFAULT_ICON_SET)!;
  }

  /** How many of `labels` a set matches by name (docs/ICONS.md §3), ignoring overrides. */
  export function matchedCount(set: IconSet, labels: string[]): number {
    return labels.filter((l) => matchIcon(set, l) !== undefined).length;
  }
</script>

<script lang="ts">
  /**
   * Icon picker for the Shape shelf (shard T5, D-17; the PaletteDialog
   * pattern): the icon sets of `src/lib/icons` as rows, each icon drawn from
   * its SVG path, with per-label overrides and a "Shape by" summary. Labels
   * come from the Shape pill's profile (`client.profile`), falling back to the
   * field's top values while it loads. Every choice is one `spec.patch` on
   * `spec.marks.shapeSet` / `shapeOverrides`; "Automatic" clears both.
   */
  import { ICON_SETS, iconsFor, type Icon } from '../../icons';
  import { spec } from '$stores/spec.svelte';
  import { dataset } from '$stores/dataset.svelte';
  import Dialog from './Dialog.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
    /** Distinct labels of a field, by count; defaults to the data client's profile. */
    labelsOf?: (field: string) => Promise<string[]>;
  }

  let {
    open,
    onclose,
    labelsOf = (field) => dataset.client.profile(field, LABEL_LIMIT).then((p) => p.labels),
  }: Props = $props();

  const shapePill = $derived(spec.value.shelves.shape[0]);
  const shapeMeta = $derived(shapePill ? dataset.meta.find((m) => m.name === shapePill.field) : undefined);
  const set = $derived(shapeSetOf(spec.value.marks.shapeSet));
  const overrides = $derived(spec.value.marks.shapeOverrides ?? {});
  const automatic = $derived(spec.value.marks.shapeSet === undefined && spec.value.marks.shapeOverrides === undefined);

  /** Profiled labels of the Shape field; null until the profile answers (or when it fails). */
  let profiled = $state<{ field: string; labels: string[] } | null>(null);

  $effect(() => {
    const field = open ? shapePill?.field : undefined;
    if (!field) return;
    if (profiled?.field === field) return;
    let live = true;
    labelsOf(field).then(
      (labels) => { if (live) profiled = { field, labels }; },
      () => { /* keep the top-values fallback */ },
    );
    return () => { live = false; };
  });

  const labels = $derived.by((): string[] => {
    if (!shapePill) return [];
    if (profiled?.field === shapePill.field) return profiled.labels;
    return (shapeMeta?.topValues ?? []).map(([l]) => l);
  });

  const resolved = $derived(iconsFor(set, labels, overrides));
  const matched = $derived(matchedCount(set, labels));

  function chooseSet(id: string): void {
    if (spec.value.marks.shapeSet === id) return;
    // Override ids belong to a set; a new set starts clean.
    spec.patch((d) => { d.marks.shapeSet = id; delete d.marks.shapeOverrides; });
  }

  function setOverride(label: string, iconId: string): void {
    spec.patch((d) => {
      if (d.marks.shapeSet === undefined) d.marks.shapeSet = set.id;
      d.marks.shapeOverrides = { ...(d.marks.shapeOverrides ?? {}), [label]: iconId };
    });
  }

  function clearOverride(label: string): void {
    spec.patch((d) => {
      if (!d.marks.shapeOverrides) return;
      const next = { ...d.marks.shapeOverrides };
      delete next[label];
      if (Object.keys(next).length) d.marks.shapeOverrides = next; else delete d.marks.shapeOverrides;
    });
  }

  function clearOverrides(): void {
    spec.patch((d) => { delete d.marks.shapeOverrides; });
  }

  function resetAuto(): void {
    spec.patch((d) => { delete d.marks.shapeSet; delete d.marks.shapeOverrides; });
  }

  /** `name` / `position` / `overflow` — how a label got its icon, for the row hint. */
  function howOf(label: string, icon: Icon | undefined): string {
    if (!icon) return '';
    if (overrides[label] !== undefined) return 'override';
    if (matchIcon(set, label)?.id === icon.id) return 'name';
    return icon.id === 'other' ? 'overflow' : 'position';
  }
</script>

<Dialog {open} {onclose} title="Shape icons" width="lg">
  {#snippet footer()}
    <button type="button" class="btn" onclick={resetAuto} disabled={automatic}>Automatic</button>
    <button type="button" class="btn btn--primary" onclick={onclose}>Done</button>
  {/snippet}

  {#if !shapePill}
    <p class="muted">No pill on Shape: marks use the set's first icon. Drop a discrete field on Shape to map its values to icons; the set chosen below is kept for when you do.</p>
  {:else}
    <p class="muted summary" data-testid="shape-summary">
      Shape by <strong>{shapePill.field}</strong> · set <strong>{set.label}</strong>
      · <span class="num">{matched}</span> of <span class="num">{labels.length}</span> values matched by name
      {#if labels.length > set.icons.length}· <span class="num">{labels.length - set.icons.length}</span> beyond the set{/if}
    </p>
  {/if}

  <section class="group">
    <h3 class="eyebrow">Icon sets</h3>
    <ul class="sets" role="listbox" aria-label="Icon sets">
      {#each ICON_SETS as s (s.id)}
        {@const active = set.id === s.id}
        <li>
          <button type="button" role="option" aria-selected={active} class="set" class:set--active={active} onclick={() => chooseSet(s.id)}>
            <span class="set__head">
              <span class="set__name">{s.label}</span>
              <span class="set__badges">
                <span class="badge">{s.icons.length} icons</span>
                {#if s.smallSafe}<span class="badge badge--ok">12 px safe</span>{/if}
              </span>
            </span>
            <span class="set__desc muted">{s.description}</span>
            <span class="set__icons" aria-hidden="true">
              {#each s.icons as icon (icon.id)}
                <svg class="glyph" viewBox="0 0 24 24"><title>{icon.label}</title><path d={icon.path} fill="currentColor" /></svg>
              {/each}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  </section>

  {#if shapePill}
    <section class="group">
      <div class="group__head">
        <h3 class="eyebrow">Per-value icons</h3>
        {#if Object.keys(overrides).length}<button type="button" class="btn" onclick={clearOverrides}>Clear all</button>{/if}
      </div>
      {#if labels.length === 0}
        <p class="muted">Values appear here once the field is profiled.</p>
      {:else}
        <ul class="overrides">
          {#each labels as label (label)}
            {@const icon = resolved[label]}
            <li class="override" data-label={label}>
              <span class="override__icon" aria-hidden="true">
                {#if icon}<svg class="glyph glyph--lg" viewBox="0 0 24 24"><path d={icon.path} fill="currentColor" /></svg>{/if}
              </span>
              <span class="override__label">{label === '' ? '(empty)' : label}</span>
              <span class="override__how muted">{howOf(label, icon)}</span>
              <select class="override__select" aria-label="Icon for {label}" value={overrides[label] ?? icon?.id ?? ''} onchange={(e) => setOverride(label, e.currentTarget.value)}>
                {#if !icon}<option value="">(none)</option>{/if}
                {#each set.icons as i (i.id)}<option value={i.id}>{i.label}</option>{/each}
              </select>
              {#if overrides[label] !== undefined}
                <button type="button" class="btn" onclick={() => clearOverride(label)}>Reset</button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</Dialog>

<style>
  .muted { color: var(--text-muted); font-size: 0.82rem; }
  .summary strong { color: var(--text-primary); }
  .group { margin-top: var(--space-md); }
  .group__head { display: flex; justify-content: space-between; align-items: center; }
  .sets { list-style: none; margin: var(--space-sm) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-sm); }
  .set { display: flex; flex-direction: column; gap: var(--space-xs); width: 100%; min-height: var(--touch-target); padding: var(--space-sm) var(--space-md); text-align: left; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-secondary); }
  .set:hover { background: var(--bg-page); }
  .set--active { border-color: var(--hydro); box-shadow: 0 0 0 1px var(--hydro); }
  .set__head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-sm); }
  .set__name { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
  .set__desc { font-size: 0.76rem; }
  .set__badges { display: flex; gap: var(--space-xs); flex-wrap: wrap; }
  .set__icons { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
  .glyph { width: var(--space-lg); height: var(--space-lg); flex: none; }
  .glyph--lg { width: var(--space-xl); height: var(--space-xl); }
  .badge { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px var(--space-sm); border-radius: var(--pill-radius); background: var(--border-light); color: var(--text-muted); }
  .badge--ok { background: var(--wind-bg); color: var(--green-text); }
  .overrides { list-style: none; margin: var(--space-sm) 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: var(--space-xs) var(--space-md); }
  .override { display: flex; align-items: center; gap: var(--space-sm); min-height: var(--touch-target); font-size: 0.82rem; }
  .override__icon { display: inline-flex; width: var(--space-xl); justify-content: center; color: var(--text-secondary); }
  .override__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .override__how { font-size: 0.7rem; }
  .override__select { min-height: var(--touch-target); padding: var(--space-xs) var(--space-sm); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); max-width: 10rem; }
</style>
