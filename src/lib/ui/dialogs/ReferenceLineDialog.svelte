<script lang="ts" module>
  import type { ReferenceLine } from '$core/types';
  import { REFERENCE_LINE_KINDS } from '$core/constants';
  import { newId } from '$core/spec-defaults';

  /** Menu wording per kind. */
  export const KIND_LABEL: Record<ReferenceLine['kind'], string> = {
    constant: 'Constant', average: 'Average', median: 'Median', min: 'Minimum', max: 'Maximum', percentile: 'Percentile', band: 'Band',
  };

  /** Statistic tokens a band may start from / end at, plus `custom` for a number. */
  export const BAND_FROM: ReadonlyArray<NonNullable<ReferenceLine['from']> | 'custom'> = ['min', 'p25', 'average', 'median', 'custom'];
  export const BAND_TO: ReadonlyArray<NonNullable<ReferenceLine['to']> | 'custom'> = ['max', 'p75', 'average', 'median', 'custom'];

  /** Default percentile for a new percentile line. */
  export const DEFAULT_PERCENTILE = 90;

  /** A fresh average line on the y axis (Tableau's default). */
  export function newReferenceLine(): ReferenceLine {
    return { id: newId(), axis: 'y', kind: 'average', dash: true, scope: 'all' };
  }

  /** A one-line description for the list: `y · Average`, `y · Constant 42`, `x · Band min → max`. */
  export function describeReferenceLine(l: ReferenceLine): string {
    const where = l.axis;
    if (l.kind === 'constant') return `${where} · Constant ${l.value ?? '?'}`;
    if (l.kind === 'percentile') return `${where} · P${l.value ?? DEFAULT_PERCENTILE}`;
    if (l.kind === 'band') return `${where} · Band ${String(l.from ?? 'min')} → ${String(l.to ?? 'max')}`;
    return `${where} · ${KIND_LABEL[l.kind]}`;
  }

  /** Switch a line's kind, seeding the fields the new kind needs and dropping the rest. */
  export function setKind(l: ReferenceLine, kind: ReferenceLine['kind']): void {
    l.kind = kind;
    delete l.value; delete l.from; delete l.to;
    if (kind === 'constant') l.value = 0;
    if (kind === 'percentile') l.value = DEFAULT_PERCENTILE;
    if (kind === 'band') { l.from = 'min'; l.to = 'max'; }
  }

  /** Kinds in menu order (re-exported for the select). */
  export const KINDS: readonly ReferenceLine['kind'][] = REFERENCE_LINE_KINDS;
</script>

<script lang="ts">
  /**
   * Reference lines dialog (T4, D-16): the list of `VizSpec.referenceLines`
   * with add / edit / remove. The selected line's form edits axis, kind,
   * value or percentile, band from / to, label, color, dash and scope; every
   * change is one `spec.patch` (R-SPEC). Tokens only (R-TOKENS). The chart
   * layer draws them (T2); this dialog only writes the spec.
   */
  import { spec } from '$stores/spec.svelte';
  import Dialog from './Dialog.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  const lines = $derived(spec.value.referenceLines);
  let selectedId = $state<string | null>(null);
  const selected = $derived(lines.find((l) => l.id === selectedId) ?? null);
  const hasY2 = $derived(spec.value.shelves.rows.some((p) => p.axis === 'secondary') || spec.value.shelves.columns.some((p) => p.axis === 'secondary'));

  // Select the first line when the dialog opens with none selected (or the selection was removed).
  $effect(() => {
    if (!open) return;
    if (!selected && lines.length) selectedId = lines[0]!.id;
  });

  function patchLine(fn: (l: ReferenceLine) => void): void {
    const id = selectedId;
    if (!id) return;
    spec.patch((d) => { const l = d.referenceLines.find((x) => x.id === id); if (l) fn(l); });
  }

  function add(): void {
    const l = newReferenceLine();
    spec.patch((d) => { d.referenceLines.push(l); });
    selectedId = l.id;
  }

  function remove(id: string): void {
    spec.patch((d) => { d.referenceLines = d.referenceLines.filter((x) => x.id !== id); });
    if (selectedId === id) selectedId = null;
  }

  function setNumber(key: 'value', raw: string, min?: number, max?: number): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const v = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
    patchLine((l) => { l[key] = v; });
  }

  function bandMode(v: ReferenceLine['from'] | ReferenceLine['to']): string {
    return typeof v === 'number' ? 'custom' : String(v ?? 'custom');
  }

  function setBandEdge(edge: 'from' | 'to', mode: string): void {
    patchLine((l) => {
      if (mode === 'custom') { l[edge] = typeof l[edge] === 'number' ? l[edge] : 0; return; }
      if (edge === 'from') l.from = mode as ReferenceLine['from']; else l.to = mode as ReferenceLine['to'];
    });
  }

  function setBandNumber(edge: 'from' | 'to', raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    patchLine((l) => { l[edge] = n; });
  }
</script>

<Dialog {open} {onclose} title="Reference lines" width="lg">
  {#snippet footer()}
    <button type="button" class="btn" onclick={add}>Add line</button>
    <button type="button" class="btn btn--primary" onclick={onclose}>Done</button>
  {/snippet}

  <div class="layout">
    <section class="list" aria-label="Reference lines">
      {#if lines.length === 0}
        <p class="muted">No reference lines yet. Add one to mark an average, a constant threshold, a percentile or a band.</p>
      {:else}
        <ul class="list__items" role="listbox" aria-label="Lines">
          {#each lines as l (l.id)}
            {@const active = l.id === selectedId}
            <li class="list__item" class:list__item--active={active}>
              <button type="button" role="option" class="list__select" aria-selected={active} data-line={l.id} onclick={() => { selectedId = l.id; }}>
                <span class="list__swatch" style:background={l.color ?? undefined} class:list__swatch--auto={!l.color} aria-hidden="true"></span>
                <span class="list__text">{l.label || describeReferenceLine(l)}</span>
              </button>
              <button type="button" class="list__remove" aria-label="Remove {l.label || describeReferenceLine(l)}" onclick={() => remove(l.id)}>✕</button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if selected}
      <section class="form" aria-label="Edit reference line">
        <div class="grid">
          <label class="row">
            <span>Axis</span>
            <select value={selected.axis} aria-label="Axis" onchange={(e) => { const v = e.currentTarget.value as ReferenceLine['axis']; patchLine((l) => { l.axis = v; }); }}>
              <option value="y">Y</option>
              <option value="x">X</option>
              <option value="y2" disabled={!hasY2}>Secondary Y</option>
            </select>
          </label>
          <label class="row">
            <span>Kind</span>
            <select value={selected.kind} aria-label="Kind" onchange={(e) => { const k = e.currentTarget.value as ReferenceLine['kind']; patchLine((l) => setKind(l, k)); }}>
              {#each KINDS as k (k)}<option value={k}>{KIND_LABEL[k]}</option>{/each}
            </select>
          </label>

          {#if selected.kind === 'constant'}
            <label class="row"><span>Value</span><input type="number" class="num" aria-label="Value" value={selected.value ?? 0} onchange={(e) => setNumber('value', e.currentTarget.value)} /></label>
          {:else if selected.kind === 'percentile'}
            <label class="row"><span>Percentile (0–100)</span><input type="number" class="num" min="0" max="100" step="1" aria-label="Percentile" value={selected.value ?? DEFAULT_PERCENTILE} onchange={(e) => setNumber('value', e.currentTarget.value, 0, 100)} /></label>
          {:else if selected.kind === 'band'}
            <label class="row">
              <span>From</span>
              <select value={bandMode(selected.from)} aria-label="Band from" onchange={(e) => setBandEdge('from', e.currentTarget.value)}>
                {#each BAND_FROM as o (o)}<option value={o}>{o === 'custom' ? 'Constant…' : o}</option>{/each}
              </select>
            </label>
            {#if typeof selected.from === 'number'}
              <label class="row"><span>From value</span><input type="number" class="num" aria-label="Band from value" value={selected.from} onchange={(e) => setBandNumber('from', e.currentTarget.value)} /></label>
            {/if}
            <label class="row">
              <span>To</span>
              <select value={bandMode(selected.to)} aria-label="Band to" onchange={(e) => setBandEdge('to', e.currentTarget.value)}>
                {#each BAND_TO as o (o)}<option value={o}>{o === 'custom' ? 'Constant…' : o}</option>{/each}
              </select>
            </label>
            {#if typeof selected.to === 'number'}
              <label class="row"><span>To value</span><input type="number" class="num" aria-label="Band to value" value={selected.to} onchange={(e) => setBandNumber('to', e.currentTarget.value)} /></label>
            {/if}
          {/if}

          <label class="row row--wide">
            <span>Label</span>
            <input type="text" aria-label="Label" value={selected.label ?? ''} placeholder={describeReferenceLine(selected)}
              onchange={(e) => { const t = e.currentTarget.value.trim(); patchLine((l) => { if (t) l.label = t; else delete l.label; }); }} />
          </label>

          <div class="row">
            <span>Color</span>
            <div class="inline">
              <input type="color" aria-label="Color" value={selected.color ?? '#000000'} onchange={(e) => { const c = e.currentTarget.value; patchLine((l) => { l.color = c; }); }} />
              {#if selected.color}
                <span class="num muted">{selected.color}</span>
                <button type="button" class="btn" onclick={() => patchLine((l) => { delete l.color; })}>Auto</button>
              {:else}
                <span class="muted">Automatic</span>
              {/if}
            </div>
          </div>

          <label class="row row--check">
            <input type="checkbox" checked={selected.dash} aria-label="Dashed" onchange={(e) => { const v = e.currentTarget.checked; patchLine((l) => { l.dash = v; }); }} />
            <span>Dashed</span>
          </label>

          <div class="row">
            <span>Scope</span>
            <div class="seg-ctrl" role="radiogroup" aria-label="Scope">
              <button type="button" role="radio" class:active={selected.scope === 'all'} aria-checked={selected.scope === 'all'} data-scope="all" onclick={() => patchLine((l) => { l.scope = 'all'; })}>Whole chart</button>
              <button type="button" role="radio" class:active={selected.scope === 'per-series'} aria-checked={selected.scope === 'per-series'} data-scope="per-series" onclick={() => patchLine((l) => { l.scope = 'per-series'; })}>Per series</button>
            </div>
          </div>
        </div>
      </section>
    {/if}
  </div>
</Dialog>

<style>
  .muted { color: var(--text-muted); font-size: 0.82rem; margin: 0; }
  .layout { display: grid; grid-template-columns: minmax(12rem, 1fr) 2fr; gap: var(--space-md); font-size: 0.82rem; }
  .list__items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-xs); }
  .list__item { display: flex; align-items: stretch; gap: var(--space-xs); border: 1px solid var(--border-light); border-radius: var(--radius-sm); background: var(--bg-card); }
  .list__item--active { border-color: var(--hydro); box-shadow: 0 0 0 1px var(--hydro); }
  .list__select { flex: 1; display: flex; align-items: center; gap: var(--space-sm); min-height: var(--touch-target); padding: var(--space-xs) var(--space-sm); text-align: left; color: var(--text-secondary); }
  .list__select:hover { background: var(--bg-page); }
  .list__swatch { width: var(--space-md); height: 3px; border-radius: 2px; background: var(--text-muted); }
  .list__swatch--auto { background: var(--text-muted); }
  .list__text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .list__remove { width: var(--touch-target); min-height: var(--touch-target); color: var(--text-muted); border-radius: var(--radius-sm); }
  .list__remove:hover { background: var(--bg-page); color: var(--red-text); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: var(--space-sm) var(--space-md); }
  .row { display: flex; flex-direction: column; gap: var(--space-xs); min-width: 0; }
  .row > span { color: var(--text-muted); font-weight: 600; }
  .row--wide { grid-column: 1 / -1; }
  .row--check { flex-direction: row; align-items: center; gap: var(--space-sm); min-height: var(--touch-target); align-self: end; }
  .row--check > span { color: var(--text-secondary); font-weight: 500; }
  .inline { display: flex; align-items: center; gap: var(--space-sm); min-height: var(--touch-target); }
  input[type='text'], input[type='number'], select {
    min-height: var(--touch-target);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
  }
  input[type='checkbox'] { width: var(--space-md); height: var(--space-md); accent-color: var(--hydro); }
  input[type='color'] { width: var(--touch-target); height: var(--touch-target); padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: none; }
  .seg-ctrl button { min-height: var(--space-xl); }
  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; }
    .seg-ctrl button { min-height: var(--touch-target); }
  }
</style>
