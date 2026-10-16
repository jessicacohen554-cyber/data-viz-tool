<script lang="ts" module>
  import geoIndex from '../../../../public/geo/index.json';

  /** One entry of `public/geo/index.json` (built by scripts/build_geo_assets.py). */
  export interface GeoLayer {
    id: string;
    file: string;
    label: string;
    kind: string;
    /** Feature properties a geo field can be joined on, in preference order. */
    keyProps: string[];
    bytes: number;
    features: number;
    source: string;
    license: string;
    retrieved: string;
  }

  /** The shipped base layers, in index order. */
  export const GEO_LAYERS: readonly GeoLayer[] = geoIndex as GeoLayer[];

  /** Lookup by id; undefined when unknown. */
  export function geoLayer(id: string | undefined): GeoLayer | undefined {
    return id === undefined ? undefined : GEO_LAYERS.find((l) => l.id === id);
  }

  /** A layer at or above this size gets a data-saver warning (the counties file is 1.4 MB). */
  export const LARGE_LAYER_BYTES = 1_000_000;

  /** `1463432` → "1.4 MB", `23970` → "23 KB". */
  export function formatBytes(bytes: number): string {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
    return `${bytes} B`;
  }

  /** The warning to show for `layer`, or null: large layers warn when the browser asks to save data. */
  export function layerWarning(layer: GeoLayer, saveData: boolean): string | null {
    if (layer.bytes < LARGE_LAYER_BYTES) return null;
    return saveData
      ? `${formatBytes(layer.bytes)} download; your browser asks to save data`
      : null;
  }

  /** The browser's data-saver request (`navigator.connection.saveData`), false when unknown. */
  export function browserSaveData(): boolean {
    return typeof navigator !== 'undefined'
      && Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
  }
</script>

<script lang="ts">
  /**
   * Geo layer picker (shard T5, D-13): the base layers of `public/geo/index.json`
   * as rows with their feature count, download size and the feature
   * properties a field can join on. Choosing a row is one `spec.patch` on
   * `spec.geoLayer`. A layer of 1 MB or more carries a warning when the
   * browser's data-saver flag is on; "Automatic" clears the choice so the
   * chart derives the layer from the geo field's role.
   */
  import { spec } from '$stores/spec.svelte';
  import Dialog from './Dialog.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
    /** Layer the chart falls back to when the spec names none (shown as the automatic choice). */
    suggested?: string | undefined;
    /** Data-saver flag; defaults to the browser's. */
    saveData?: boolean;
  }

  let { open, onclose, suggested = undefined, saveData = browserSaveData() }: Props = $props();

  const chosen = $derived(spec.value.geoLayer);
  const current = $derived(chosen ?? suggested);

  function choose(id: string): void {
    if (spec.value.geoLayer !== id) spec.patch((d) => { d.geoLayer = id; });
  }

  function resetAuto(): void {
    if (spec.value.geoLayer !== undefined) spec.patch((d) => { delete d.geoLayer; });
  }
</script>

<Dialog {open} {onclose} title="Map layer" width="md">
  {#snippet footer()}
    <button type="button" class="btn" onclick={resetAuto} disabled={chosen === undefined}>Automatic</button>
    <button type="button" class="btn btn--primary" onclick={onclose}>Done</button>
  {/snippet}

  <p class="muted">
    {#if chosen}Layer: <strong>{geoLayer(chosen)?.label ?? chosen}</strong>
    {:else if suggested}Automatic: <strong>{geoLayer(suggested)?.label ?? suggested}</strong> from the geo field's role
    {:else}Automatic: the layer follows the geo field's role{/if}
  </p>

  <ul class="layers" role="listbox" aria-label="Map layers">
    {#each GEO_LAYERS as layer (layer.id)}
      {@const active = current === layer.id}
      {@const warning = layerWarning(layer, saveData)}
      <li>
        <button type="button" role="option" aria-selected={active} class="layer" class:layer--active={active} onclick={() => choose(layer.id)}>
          <span class="layer__head">
            <span class="layer__name">{layer.label}</span>
            <span class="layer__size num" class:layer__size--large={layer.bytes >= LARGE_LAYER_BYTES}>{formatBytes(layer.bytes)}</span>
          </span>
          <span class="layer__meta muted">
            <span class="num">{layer.features.toLocaleString()}</span> {layer.kind} features · joins on
            {#each layer.keyProps as key, i (key)}{i > 0 ? ', ' : ' '}<code class="layer__key">{key}</code>{/each}
          </span>
          {#if warning}<span class="badge badge--warn">{warning}</span>{/if}
        </button>
      </li>
    {/each}
  </ul>
</Dialog>

<style>
  .muted { color: var(--text-muted); font-size: 0.82rem; }
  .layers { list-style: none; margin: var(--space-sm) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-sm); }
  .layer { display: flex; flex-direction: column; gap: var(--space-xs); width: 100%; min-height: var(--touch-target); padding: var(--space-sm) var(--space-md); text-align: left; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-card); }
  .layer:hover { background: var(--bg-page); }
  .layer--active { border-color: var(--hydro); box-shadow: 0 0 0 1px var(--hydro); }
  .layer__head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-sm); }
  .layer__name { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
  .layer__size { font-size: 0.72rem; color: var(--text-muted); }
  .layer__size--large { color: var(--amber-text); font-weight: 600; }
  .layer__meta { font-size: 0.76rem; }
  .layer__key { font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-secondary); }
  .badge { align-self: flex-start; font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px var(--space-sm); border-radius: var(--pill-radius); }
  .badge--warn { background: var(--solar-bg); color: var(--amber-text); }
</style>
