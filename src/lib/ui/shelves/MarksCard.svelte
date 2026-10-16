<script lang="ts" module>
  import type { ChartTypeId as ChartTypeIdT, EnvelopeSpec, FieldMeta as FieldMetaT, MarkSettings, VizSpec } from '../../core/types';
  import { DEFAULT_ENVELOPE_LEVELS, GEO_LAYER_FOR_ROLE } from '../../core/constants';
  import { effectiveGeoRole } from '../fields/FieldPanel.svelte';

  /** A map chart draws a base layer and one of the map marks. */
  export function isMapChart(id: ChartTypeIdT): boolean {
    return id === 'map-choropleth' || id === 'map-symbol';
  }

  /** Map marks in menu order with their labels (D-17). */
  export const MAP_MARKS: ReadonlyArray<{ id: NonNullable<MarkSettings['mapMark']>; label: string }> = [
    { id: 'fill', label: 'Fill (choropleth)' },
    { id: 'symbol', label: 'Symbol' },
    { id: 'bubble', label: 'Bubble' },
    { id: 'heat', label: 'Heat' },
    { id: 'label', label: 'Label' },
  ];

  /** The map mark a chart starts with when the spec names none. */
  export function defaultMapMark(id: ChartTypeIdT): NonNullable<MarkSettings['mapMark']> {
    return id === 'map-symbol' ? 'symbol' : 'fill';
  }

  /** Shelves searched, in order, for the geo field that decides the automatic base layer. */
  const GEO_SHELVES = ['detail', 'columns', 'rows', 'label', 'color', 'tooltip'] as const;

  /** The base layer implied by the first pill with an area geo role (`GEO_LAYER_FOR_ROLE`), or undefined. */
  export function suggestedGeoLayer(spec: VizSpec, meta: FieldMetaT[]): string | undefined {
    for (const shelf of GEO_SHELVES) {
      for (const pill of spec.shelves[shelf]) {
        const m = meta.find((f) => f.name === pill.field);
        const role = m ? effectiveGeoRole(spec.typeOverrides, m) : null;
        const layer = role ? GEO_LAYER_FOR_ROLE[role] : undefined;
        if (layer) return layer;
      }
    }
    return undefined;
  }

  /** The envelope level presets as chips (D-15). */
  export const ENVELOPE_PRESETS: ReadonlyArray<{ id: string; label: string; level: readonly [number, number] }> = [
    { id: 'p5-p95', label: 'P5–P95', level: [5, 95] },
    { id: 'p10-p90', label: 'P10–P90', level: [10, 90] },
    { id: 'p25-p75', label: 'P25–P75', level: [25, 75] },
  ];

  /** The envelope a chart starts with when the spec carries none: percentile mode, the default levels. */
  export function defaultEnvelope(): EnvelopeSpec {
    return { mode: 'percentile', levels: DEFAULT_ENVELOPE_LEVELS.map(([lo, hi]) => [lo, hi]) };
  }

  /** True when `levels` holds `level`. */
  export function hasLevel(levels: ReadonlyArray<readonly [number, number]>, level: readonly [number, number]): boolean {
    return levels.some(([lo, hi]) => lo === level[0] && hi === level[1]);
  }

  /**
   * `levels` with `level` added or removed, kept outer-first (widest band
   * first, as `EnvelopeSpec.levels` requires). The last band cannot be
   * removed: an envelope always draws at least one.
   */
  export function toggleLevel(levels: ReadonlyArray<readonly [number, number]>, level: readonly [number, number]): Array<[number, number]> {
    const without = levels.filter(([lo, hi]) => !(lo === level[0] && hi === level[1])).map(([lo, hi]): [number, number] => [lo, hi]);
    if (without.length < levels.length) return without.length ? without : levels.map(([lo, hi]) => [lo, hi]);
    return [...without, [level[0], level[1]] as [number, number]].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  }
</script>

<script lang="ts">
  /**
   * The Marks card: chart type (from the registry's Show Me eligibility), the
   * six channel shelves Color / Size / Label / Detail / Tooltip / Shape as
   * vertical drop zones, and the v2 sections that appear only when relevant
   * (T5): map mark and base layer for a map chart, envelope mode / level
   * chips / low-high-mid fields for the envelope chart, and the "Icons…"
   * button beside a Shape pill. Drops are handled by ShelfPanel; every
   * control here is one `spec.patch` (R-SPEC).
   */
  import type { ChartTypeId, FieldMeta, Pill, ShelfId } from '../../core/types';
  import { CHART_TYPE_IDS, MARK_SHELVES, SINGLE_PILL_SHELVES } from '../../core/constants';
  import { eligibility } from '../../charts/show-me';
  import { spec } from '../../stores/spec.svelte';
  import GeoLayerPicker, { GEO_LAYERS, geoLayer } from '../dialogs/GeoLayerPicker.svelte';
  import IconPicker, { shapeSetOf } from '../dialogs/IconPicker.svelte';
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
  const chartType = $derived(spec.value.chartType);

  function setChart(e: Event): void {
    const id = (e.currentTarget as HTMLSelectElement).value as ChartTypeId;
    if (id !== spec.value.chartType) spec.patch((d) => { d.chartType = id; });
  }

  // --- Map ---------------------------------------------------------------
  const mapMark = $derived(spec.value.marks.mapMark ?? defaultMapMark(chartType));
  const suggestedLayer = $derived(suggestedGeoLayer(spec.value, meta));
  let layerOpen = $state(false);

  function setMapMark(e: Event): void {
    const id = (e.currentTarget as HTMLSelectElement).value as NonNullable<typeof spec.value.marks.mapMark>;
    if (id !== spec.value.marks.mapMark) spec.patch((d) => { d.marks.mapMark = id; });
  }

  function setLayer(e: Event): void {
    const id = (e.currentTarget as HTMLSelectElement).value;
    if ((id || undefined) === spec.value.geoLayer) return;
    spec.patch((d) => { if (id) d.geoLayer = id; else delete d.geoLayer; });
  }

  // --- Envelope ----------------------------------------------------------
  const envelope = $derived(spec.value.envelope ?? defaultEnvelope());
  const measures = $derived(meta.filter((m) => (spec.value.typeOverrides[m.name]?.role ?? m.role) === 'measure'));

  function patchEnvelope(fn: (env: EnvelopeSpec) => void): void {
    spec.patch((d) => { d.envelope ??= defaultEnvelope(); fn(d.envelope); });
  }

  function setMode(mode: EnvelopeSpec['mode']): void {
    if (envelope.mode !== mode) patchEnvelope((env) => { env.mode = mode; });
  }

  function toggle(level: readonly [number, number]): void {
    const next = toggleLevel(envelope.levels, level);
    if (next.length === envelope.levels.length && next.every((l, i) => hasLevel([envelope.levels[i]!], l))) return;
    patchEnvelope((env) => { env.levels = next; });
  }

  function setEnvelopeField(key: 'low' | 'high' | 'mid', e: Event): void {
    const field = (e.currentTarget as HTMLSelectElement).value;
    patchEnvelope((env) => { if (field) env[key] = field; else delete env[key]; });
  }

  // --- Shape icons -------------------------------------------------------
  const shapePill = $derived(spec.value.shelves.shape[0]);
  const shapeSet = $derived(shapeSetOf(spec.value.marks.shapeSet));
  let iconsOpen = $state(false);
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

  {#if isMapChart(chartType)}
    <div class="marks__section" data-section="map">
      <span class="eyebrow">Map</span>
      <label class="marks__row">
        <span class="marks__row-label">Mark</span>
        <select class="marks__select" value={mapMark} onchange={setMapMark} aria-label="Map mark">
          {#each MAP_MARKS as mm (mm.id)}<option value={mm.id}>{mm.label}</option>{/each}
        </select>
      </label>
      <label class="marks__row">
        <span class="marks__row-label">Layer</span>
        <select class="marks__select" value={spec.value.geoLayer ?? ''} onchange={setLayer} aria-label="Map layer">
          <option value="">Automatic{suggestedLayer ? ` (${geoLayer(suggestedLayer)?.label ?? suggestedLayer})` : ''}</option>
          {#each GEO_LAYERS as layer (layer.id)}<option value={layer.id}>{layer.label}</option>{/each}
        </select>
        <button type="button" class="btn marks__btn" onclick={() => { layerOpen = true; }}>Layers…</button>
      </label>
    </div>
  {/if}

  {#if chartType === 'envelope'}
    <div class="marks__section" data-section="envelope">
      <span class="eyebrow">Envelope</span>
      <div class="marks__segmented" role="radiogroup" aria-label="Envelope mode">
        <button type="button" role="radio" aria-checked={envelope.mode === 'percentile'} class="chip" class:chip--on={envelope.mode === 'percentile'} onclick={() => setMode('percentile')}>Percentile bands</button>
        <button type="button" role="radio" aria-checked={envelope.mode === 'columns'} class="chip" class:chip--on={envelope.mode === 'columns'} onclick={() => setMode('columns')}>Low / high columns</button>
      </div>
      {#if envelope.mode === 'percentile'}
        <div class="marks__chips" role="group" aria-label="Envelope levels">
          {#each ENVELOPE_PRESETS as p (p.id)}
            {@const on = hasLevel(envelope.levels, p.level)}
            <button type="button" class="chip" class:chip--on={on} aria-pressed={on} data-level={p.id} title={on && envelope.levels.length === 1 ? 'At least one band stays on' : undefined} onclick={() => toggle(p.level)}>{p.label}</button>
          {/each}
        </div>
      {:else}
        {#each [['low', 'Low'], ['high', 'High'], ['mid', 'Mid']] as const as [key, label] (key)}
          <label class="marks__row">
            <span class="marks__row-label">{label}</span>
            <select class="marks__select" value={envelope[key] ?? ''} onchange={(e) => setEnvelopeField(key, e)} aria-label="Envelope {label.toLowerCase()} field">
              <option value="">{key === 'mid' ? '(none)' : '(choose a measure)'}</option>
              {#each measures as m (m.name)}<option value={m.name}>{m.name}</option>{/each}
            </select>
          </label>
        {/each}
      {/if}
    </div>
  {/if}

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
      {#if id === 'shape' && shapePill}
        <div class="marks__row marks__row--shape" data-section="shape">
          <span class="marks__hint">Shape by <strong>{shapePill.field}</strong> · {shapeSet.label}</span>
          <button type="button" class="btn marks__btn" onclick={() => { iconsOpen = true; }}>Icons…</button>
        </div>
      {/if}
    {/each}
  </div>
</section>

<GeoLayerPicker open={layerOpen} suggested={suggestedLayer} onclose={() => { layerOpen = false; }} />
<IconPicker open={iconsOpen} onclose={() => { iconsOpen = false; }} />

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
  .marks__section { display: flex; flex-direction: column; gap: var(--space-xs); padding: var(--space-xs) 0; border-top: 1px solid var(--border-light); }
  .marks__row { display: flex; align-items: center; gap: var(--space-xs); font-size: 0.72rem; color: var(--text-muted); }
  .marks__row-label { width: 3em; flex: none; }
  .marks__row .marks__select { flex: 1; min-width: 0; }
  .marks__row--shape { justify-content: space-between; padding: 0 var(--space-xs); }
  .marks__hint { font-size: 0.72rem; color: var(--text-muted); }
  .marks__hint strong { color: var(--text-secondary); }
  .marks__btn { font-size: 0.72rem; padding: 2px var(--space-sm); }
  .marks__segmented, .marks__chips { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
  .chip {
    padding: 2px var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--pill-radius);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 0.72rem;
    line-height: 1.4;
  }
  .chip:hover { background: var(--bg-page); }
  .chip--on { background: var(--pill-discrete-bg); border-color: var(--pill-discrete-border); color: var(--pill-discrete-text); font-weight: 600; }
  .marks__shelves { display: flex; flex-direction: column; gap: var(--space-xs); }
  @media (max-width: 900px) {
    .marks__select, .chip, .marks__btn { min-height: var(--touch-target); }
  }
</style>
