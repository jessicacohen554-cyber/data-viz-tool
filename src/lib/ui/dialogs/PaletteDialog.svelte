<script lang="ts" module>
  import type { ChartTypeId, Pill } from '$core/types';
  import type { PaletteKind } from '$palette/registry';

  /** Which palette kinds apply to the current Color pill (docs/PALETTES.md §4). */
  export function kindsForPill(pill: Pill | undefined): PaletteKind[] {
    if (!pill) return ['categorical', 'sequential', 'diverging'];
    return pill.continuity === 'discrete' ? ['categorical'] : ['sequential', 'diverging'];
  }

  /** The id `pick.ts` uses when the selection names none (docs/PALETTES.md §4). */
  export function defaultPaletteId(kind: PaletteKind, chart: ChartTypeId): string {
    if (kind === 'categorical') return chart === 'dumbbell' || chart === 'slope' ? 'pairs-amber-indigo' : 'observatory';
    return kind === 'sequential' ? 'seq-sky' : 'div-cool-warm';
  }

  /** Tag the registry puts on sets that fail the CVD gate (docs/PALETTES.md §5). */
  export const LABELS_REQUIRED_TAG = 'labels-required';
</script>

<script lang="ts">
  /**
   * Palette dialog (shard S5, D-12): swatch rows grouped by kind from the
   * registry, showing only the kinds the Color pill can use, with CVD-safe and
   * labels-required badges; diverging switch and midpoint, reverse and domain
   * for continuous color; per-label overrides for categorical color. Every
   * choice is one `spec.patch` on `spec.palette` (mode becomes `manual`);
   * "Automatic" restores `{ mode: 'auto' }`.
   */
  import type { PaletteSelection } from '$core/types';
  import { pillKeyMap } from '$core/query-of';
  import { PALETTES, type Palette } from '$palette/registry';
  import { pickPalette } from '$palette/pick';
  import { spec } from '$stores/spec.svelte';
  import { dataset } from '$stores/dataset.svelte';
  import { query } from '$stores/query.svelte';
  import Dialog from './Dialog.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  const colorPill = $derived(spec.value.shelves.color[0]);
  const colorMeta = $derived(colorPill ? dataset.meta.find((m) => m.name === colorPill.field) : undefined);
  const sel = $derived(spec.value.palette);
  const kinds = $derived(kindsForPill(colorPill));
  const continuous = $derived(colorPill?.continuity === 'continuous');
  const grouped = $derived(kinds.map((kind) => ({ kind, palettes: PALETTES.filter((p) => p.kind === kind) })));

  function selectedId(kind: Palette['kind']): string {
    return sel[kind] ?? defaultPaletteId(kind, spec.value.chartType);
  }

  function patchPalette(fn: (p: PaletteSelection) => void): void {
    spec.patch((d) => { d.palette.mode = 'manual'; fn(d.palette); });
  }

  function choose(p: Palette): void {
    patchPalette((pal) => {
      pal[p.kind] = p.id;
      if (p.kind === 'diverging') pal.useDiverging = true;
      if (p.kind === 'sequential') pal.useDiverging = false;
    });
  }

  function resetAuto(): void {
    spec.patch((d) => { d.palette = { mode: 'auto' }; });
  }

  const midpointMode = $derived(typeof sel.midpoint === 'number' ? 'custom' : (sel.midpoint ?? 'zero'));

  function setMidpoint(mode: string): void {
    patchPalette((pal) => {
      if (mode === 'custom') pal.midpoint = typeof pal.midpoint === 'number' ? pal.midpoint : 0;
      else pal.midpoint = mode as 'zero' | 'mean' | 'median';
    });
  }

  const domainAuto = $derived(!Array.isArray(sel.domain));

  function setDomainBound(i: 0 | 1, v: string): void {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    patchPalette((pal) => {
      const cur: [number, number] = Array.isArray(pal.domain) ? [pal.domain[0], pal.domain[1]] : [0, 1];
      cur[i] = n;
      pal.domain = cur;
    });
  }

  /** Labels of the Color pill's domain: the current result's dimension, else the field's top values. */
  const labels = $derived.by((): string[] => {
    if (!colorPill || continuous) return [];
    const key = pillKeyMap(spec.value).get(colorPill.id);
    const dim = query.result?.dims.find((d) => d.key === key);
    if (dim?.labels?.length) return dim.labels;
    return (colorMeta?.topValues ?? []).map(([l]) => l);
  });

  const encoding = $derived(pickPalette(colorPill, colorMeta, sel, query.result, spec.value.chartType));
  const resolved = $derived(encoding.kind === 'categorical' ? encoding.map : {});
  const overrides = $derived(sel.overrides ?? {});

  function setOverride(label: string, hex: string): void {
    patchPalette((pal) => { pal.overrides = { ...(pal.overrides ?? {}), [label]: hex }; });
  }

  function clearOverride(label: string): void {
    patchPalette((pal) => {
      if (!pal.overrides) return;
      const next = { ...pal.overrides };
      delete next[label];
      if (Object.keys(next).length) pal.overrides = next; else delete pal.overrides;
    });
  }

  function clearOverrides(): void {
    patchPalette((pal) => { delete pal.overrides; });
  }

  const kindLabel: Record<Palette['kind'], string> = { categorical: 'Categorical', sequential: 'Sequential', diverging: 'Diverging' };
</script>

<Dialog {open} {onclose} title="Color palette" width="lg">
  {#snippet footer()}
    <button type="button" class="btn" onclick={resetAuto} disabled={sel.mode === 'auto'}>Automatic</button>
    <button type="button" class="btn btn--primary" onclick={onclose}>Done</button>
  {/snippet}

  {#if !colorPill}
    <p class="muted">No pill on Color: marks use the single default color. Drop a field on Color to choose a palette; the choice below is kept for when you do.</p>
  {:else}
    <p class="muted">
      Color: <strong>{colorPill.field}</strong> · {continuous ? 'continuous (gradient)' : 'discrete (one hue per value)'}
      · mode <span class="num">{sel.mode}</span>
    </p>
  {/if}

  {#if continuous}
    <div class="controls">
      <label class="check"><input type="checkbox" checked={Boolean(sel.useDiverging)} onchange={(e) => patchPalette((p) => { p.useDiverging = e.currentTarget.checked; })} /> Diverging</label>
      <label class="check"><input type="checkbox" checked={Boolean(sel.reverse)} onchange={(e) => patchPalette((p) => { p.reverse = e.currentTarget.checked; })} /> Reverse</label>
      {#if sel.useDiverging}
        <label class="field"><span>Midpoint</span>
          <select value={midpointMode} onchange={(e) => setMidpoint(e.currentTarget.value)}>
            <option value="zero">Zero</option><option value="mean">Mean</option><option value="median">Median</option><option value="custom">Custom…</option>
          </select>
        </label>
        {#if midpointMode === 'custom'}
          <label class="field"><span>Value</span>
            <input type="number" value={typeof sel.midpoint === 'number' ? sel.midpoint : 0} oninput={(e) => { const n = Number(e.currentTarget.value); if (Number.isFinite(n)) patchPalette((p) => { p.midpoint = n; }); }} />
          </label>
        {/if}
      {/if}
      <label class="check"><input type="checkbox" checked={domainAuto} onchange={(e) => patchPalette((p) => { if (e.currentTarget.checked) p.domain = 'auto'; else p.domain = Array.isArray(p.domain) ? p.domain : [colorMeta?.min ?? 0, colorMeta?.max ?? 1]; })} /> Domain from data</label>
      {#if !domainAuto && Array.isArray(sel.domain)}
        <label class="field"><span>Min</span><input type="number" value={sel.domain[0]} oninput={(e) => setDomainBound(0, e.currentTarget.value)} /></label>
        <label class="field"><span>Max</span><input type="number" value={sel.domain[1]} oninput={(e) => setDomainBound(1, e.currentTarget.value)} /></label>
      {/if}
    </div>
  {/if}

  {#if PALETTES.length === 0}
    <p class="muted">The palette registry is empty (shard S2 fills it); the default Observatory colors apply.</p>
  {/if}

  {#each grouped as group (group.kind)}
    {#if group.palettes.length > 0}
      <section class="group">
        <h3 class="eyebrow">{kindLabel[group.kind]}</h3>
        <ul class="swatches" role="listbox" aria-label="{kindLabel[group.kind]} palettes">
          {#each group.palettes as p (p.id)}
            {@const active = selectedId(p.kind) === p.id}
            <li>
              <button type="button" role="option" aria-selected={active} class="swatch" class:swatch--active={active} onclick={() => choose(p)}>
                <span class="swatch__name">{p.label}</span>
                <span class="swatch__chips" class:swatch__chips--ramp={p.kind !== 'categorical'} aria-hidden="true">
                  {#each p.colors as c, i (i)}<span class="chip" style:background={c}></span>{/each}
                </span>
                <span class="swatch__badges">
                  {#if p.colorblindSafe}<span class="badge badge--ok">CVD safe</span>{/if}
                  {#if p.tags.includes(LABELS_REQUIRED_TAG)}<span class="badge badge--warn">Use with labels</span>{/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/each}

  {#if colorPill && !continuous}
    <section class="group">
      <div class="group__head">
        <h3 class="eyebrow">Per-value colors</h3>
        {#if Object.keys(overrides).length}<button type="button" class="btn" onclick={clearOverrides}>Clear all</button>{/if}
      </div>
      {#if labels.length === 0}
        <p class="muted">Values appear here once the chart has data.</p>
      {:else}
        <ul class="overrides">
          {#each labels as label (label)}
            {@const value = overrides[label] ?? resolved[label]}
            <li class="override">
              <input type="color" value={value ?? undefined} aria-label="Color for {label}" oninput={(e) => setOverride(label, e.currentTarget.value)} />
              <span class="override__label">{label === '' ? '(empty)' : label}</span>
              {#if overrides[label]}
                <span class="num muted">{overrides[label]}</span>
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
  .controls { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-sm) var(--space-md); margin: var(--space-sm) 0 var(--space-md); }
  .check { display: inline-flex; align-items: center; gap: var(--space-xs); font-size: 0.82rem; min-height: var(--touch-target); }
  .field { display: flex; flex-direction: column; gap: var(--space-xs); font-size: 0.82rem; }
  .field > span { color: var(--text-muted); font-weight: 600; }
  input[type='number'], select { min-height: var(--touch-target); padding: var(--space-xs) var(--space-sm); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); }
  input[type='checkbox'] { width: var(--space-md); height: var(--space-md); accent-color: var(--hydro); }
  .group { margin-top: var(--space-md); }
  .group__head { display: flex; justify-content: space-between; align-items: center; }
  .swatches { list-style: none; margin: var(--space-sm) 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: var(--space-sm); }
  .swatch { display: flex; flex-direction: column; gap: var(--space-xs); width: 100%; min-height: var(--touch-target); padding: var(--space-sm) var(--space-md); text-align: left; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-card); }
  .swatch:hover { background: var(--bg-page); }
  .swatch--active { border-color: var(--hydro); box-shadow: 0 0 0 1px var(--hydro); }
  .swatch__name { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
  .swatch__chips { display: flex; gap: 2px; height: var(--space-md); }
  .chip { flex: 1; border-radius: 2px; }
  .swatch__chips--ramp { gap: 0; }
  .swatch__chips--ramp .chip { border-radius: 0; }
  .swatch__chips--ramp .chip:first-child { border-radius: 2px 0 0 2px; }
  .swatch__chips--ramp .chip:last-child { border-radius: 0 2px 2px 0; }
  .swatch__badges { display: flex; gap: var(--space-xs); flex-wrap: wrap; min-height: 1em; }
  .badge { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px var(--space-sm); border-radius: var(--pill-radius); }
  .badge--ok { background: var(--wind-bg); color: var(--green-text); }
  .badge--warn { background: var(--solar-bg); color: var(--amber-text); }
  .overrides { list-style: none; margin: var(--space-sm) 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: var(--space-xs) var(--space-md); }
  .override { display: flex; align-items: center; gap: var(--space-sm); min-height: var(--touch-target); font-size: 0.82rem; }
  .override input[type='color'] { width: var(--space-xl); height: var(--space-xl); padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: none; }
  .override__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
