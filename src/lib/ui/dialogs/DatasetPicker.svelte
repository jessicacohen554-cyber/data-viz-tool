<script lang="ts" module>
  /** A catalog file above this size gets the "Large" badge and the save-data warning (D-3). */
  export const LARGE_DATASET_BYTES = 10 * 1024 * 1024;

  /** Format a byte count for a card (`4.9 MB`, `312 KB`). */
  export function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  }

  /** True when the page is served by the local launcher (so `/api/manifest` exists). */
  export function isLocalServer(hostname: string): boolean {
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
  }
</script>

<script lang="ts">
  /**
   * Dataset picker (shard S5, owner decision D-9): the catalog from
   * `data/manifest.json` as cards (size, rows, "Large" badge over 10 MB) plus
   * "Open CSV from device", which hands the `File` to the worker and never
   * uploads it. Shows load progress from the dataset store and closes once
   * the fields are in. When served by the local launcher a "Refresh catalog"
   * button hits `/api/manifest`, which regenerates the manifest from disk.
   */
  import type { DatasetEntry, DatasetManifest } from '$core/types';
  import { dataset } from '$stores/dataset.svelte';
  import Dialog from './Dialog.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  let manifest = $state<DatasetManifest | null>(null);
  let fetching = $state(false);
  let fetchError = $state<string | null>(null);
  /** Id of the entry this dialog started loading, so another load does not close it. */
  let picked = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  const manifestUrl = `${import.meta.env.BASE_URL}data/manifest.json`;
  const local = typeof location !== 'undefined' && isLocalServer(location.hostname);
  const saveData = typeof navigator !== 'undefined'
    && Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

  const rowFmt = new Intl.NumberFormat(undefined);

  async function fetchManifest(url: string): Promise<void> {
    fetching = true;
    fetchError = null;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = (await res.json()) as DatasetManifest;
      if (!Array.isArray(json.datasets)) throw new Error('manifest has no datasets array');
      manifest = json;
    } catch (e) {
      fetchError = `Could not read the catalog: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      fetching = false;
    }
  }

  $effect(() => {
    if (open && !manifest && !fetching && !fetchError) void fetchManifest(manifestUrl);
  });

  $effect(() => {
    if (picked && dataset.ready && dataset.entry?.id === picked && !dataset.loading) {
      picked = null;
      onclose();
    }
  });

  function absoluteUrl(entry: DatasetEntry): string {
    return new URL(`${import.meta.env.BASE_URL}${entry.file}`, document.baseURI).href;
  }

  function pick(entry: DatasetEntry): void {
    picked = entry.id;
    void dataset.load({ ...entry, source: 'catalog' }, absoluteUrl(entry));
  }

  function onfile(e: Event): void {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    picked = null;
    void dataset.openLocal(file).then(() => { if (dataset.ready) onclose(); });
    (e.currentTarget as HTMLInputElement).value = '';
  }

  const progressPct = $derived.by(() => {
    const p = dataset.progress;
    if (!p || !p.total) return null;
    return Math.min(100, Math.round((p.loaded / p.total) * 100));
  });

  const phaseLabel: Record<string, string> = { download: 'Downloading', parse: 'Parsing', build: 'Building columns' };
</script>

<Dialog {open} {onclose} title="Open a dataset" width="lg">
  {#if saveData}
    <p class="notice notice--warn" role="status">Data Saver is on. Files over {formatBytes(LARGE_DATASET_BYTES)} are marked <strong>Large</strong>; a CSV opened from the device never uses the network.</p>
  {/if}

  {#if dataset.loading}
    <div class="loading" role="status" aria-live="polite">
      <div class="loading__row">
        <span>{phaseLabel[dataset.progress?.phase ?? 'download']} <strong>{dataset.entry?.name}</strong>…</span>
        <span class="num">{progressPct === null ? (dataset.progress?.rows ? `${rowFmt.format(dataset.progress.rows)} rows` : '') : `${progressPct}%`}</span>
      </div>
      <progress class="loading__bar" max="100" value={progressPct ?? undefined}></progress>
    </div>
  {:else if dataset.error}
    <p class="notice notice--error" role="alert">{dataset.error}</p>
  {/if}

  <section class="section">
    <div class="section__head">
      <h3 class="eyebrow">From this device</h3>
    </div>
    <label class="device card">
      <input bind:this={fileInput} type="file" accept=".csv,text/csv" onchange={onfile} class="device__input" />
      <span class="device__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <span class="device__text">
        <strong>Open CSV from device</strong>
        <span class="muted">Parsed in your browser. Nothing is uploaded.</span>
      </span>
    </label>
  </section>

  <section class="section">
    <div class="section__head">
      <h3 class="eyebrow">Catalog</h3>
      {#if local}
        <button type="button" class="btn" disabled={fetching} onclick={() => fetchManifest('/api/manifest')}>Refresh catalog</button>
      {:else}
        <button type="button" class="btn" disabled={fetching} onclick={() => fetchManifest(manifestUrl)}>Reload</button>
      {/if}
    </div>

    {#if fetchError}
      <p class="notice notice--error" role="alert">{fetchError}</p>
    {:else if fetching && !manifest}
      <p class="muted">Loading the catalog…</p>
    {:else if manifest && manifest.datasets.length === 0}
      <p class="muted">The catalog is empty. Drop a CSV in <code>data/datasets/</code> and refresh.</p>
    {:else if manifest}
      <ul class="cards">
        {#each manifest.datasets as entry (entry.id)}
          {@const large = entry.bytes > LARGE_DATASET_BYTES}
          {@const current = dataset.entry?.id === entry.id && dataset.ready}
          <li>
            <button type="button" class="dcard card" class:dcard--current={current} disabled={dataset.loading} onclick={() => pick(entry)} aria-current={current ? 'true' : undefined}>
              <span class="dcard__top">
                <span class="dcard__name">{entry.name}</span>
                {#if large}<span class="badge badge--large">Large</span>{/if}
                {#if current}<span class="badge">Open</span>{/if}
              </span>
              {#if entry.description}<span class="dcard__desc">{entry.description}</span>{/if}
              <span class="dcard__meta num">
                <span>{formatBytes(entry.bytes)}</span>
                <span>{entry.rows === null ? '— rows' : `${rowFmt.format(entry.rows)} rows`}</span>
                <span>{entry.columns.length} columns</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</Dialog>

<style>
  .section { margin-top: var(--space-md); }
  .section:first-child { margin-top: 0; }
  .section__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-sm); }

  .notice { margin: 0 0 var(--space-md); padding: var(--space-sm) var(--space-md); border-radius: var(--radius-sm); font-size: 0.82rem; }
  .notice--warn { background: var(--solar-bg); color: var(--amber-text); }
  .notice--error { background: color-mix(in srgb, var(--negative) 10%, transparent); color: var(--red-text); }
  .muted { color: var(--text-muted); font-size: 0.82rem; }

  .loading { margin-bottom: var(--space-md); }
  .loading__row { display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: var(--space-xs); }
  .loading__bar { width: 100%; height: var(--space-sm); accent-color: var(--hydro); }

  .device { display: flex; align-items: center; gap: var(--space-md); padding: var(--space-md); cursor: pointer; min-height: var(--touch-target); }
  .device:hover { background: var(--bg-page); }
  .device__input { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
  .device:focus-within { outline: 2px solid var(--hydro); outline-offset: 2px; }
  .device__icon { display: grid; place-items: center; width: var(--touch-target); height: var(--touch-target); border-radius: var(--radius-md); background: var(--hydro-bg); color: var(--hydro-text); }
  .device__text { display: flex; flex-direction: column; gap: 2px; }

  .cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: var(--space-sm); }
  .dcard { display: flex; flex-direction: column; gap: var(--space-xs); width: 100%; text-align: left; padding: var(--space-md); min-height: var(--touch-target); transition: box-shadow var(--transition-fast); }
  .dcard:hover:not(:disabled) { box-shadow: var(--shadow-md); }
  .dcard:disabled { opacity: 0.6; cursor: default; }
  .dcard--current { border-color: var(--hydro); }
  .dcard__top { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; }
  .dcard__name { font-weight: 600; color: var(--text-primary); }
  .dcard__desc { font-size: 0.8rem; color: var(--text-muted); }
  .dcard__meta { display: flex; gap: var(--space-md); font-size: 0.72rem; color: var(--text-muted); }

  .badge { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px var(--space-sm); border-radius: var(--pill-radius); background: var(--hydro-bg); color: var(--hydro-text); }
  .badge--large { background: var(--solar-bg); color: var(--amber-text); }
</style>
