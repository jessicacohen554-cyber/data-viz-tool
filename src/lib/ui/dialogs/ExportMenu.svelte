<script lang="ts">
  /**
   * Export menu (shard S5): a button with a popover offering PNG (through the
   * chart canvas callback), CSV of the aggregated table, the spec as JSON, and
   * "Import view…" which reads a JSON file into a validated spec. Failures
   * surface as toasts; nothing leaves the browser.
   */
  import { spec } from '$stores/spec.svelte';
  import { dataset } from '$stores/dataset.svelte';
  import { query } from '$stores/query.svelte';
  import { ui } from '$stores/ui.svelte';
  import { exportCsv, exportJson, exportPng, importJson, type CanvasToPng } from '../export';

  interface Props {
    /** Supplied by the app from ChartCanvas.toPng; PNG is disabled without it. */
    toPng?: CanvasToPng;
  }

  let { toPng }: Props = $props();

  let openMenu = $state(false);
  let root = $state<HTMLElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  const canExportData = $derived(Boolean(query.result && dataset.ready));
  const canExportSpec = $derived(Boolean(spec.value.datasetId));

  $effect(() => {
    if (!openMenu) return;
    const onDown = (e: PointerEvent) => { if (root && !root.contains(e.target as Node)) openMenu = false; };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') openMenu = false; };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  });

  async function png(): Promise<void> {
    openMenu = false;
    if (!toPng) return;
    try {
      if (!(await exportPng(toPng, spec.value))) ui.toast('Nothing to export yet', 'warn');
    } catch (e) {
      ui.toast(`PNG export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }

  function csv(): void {
    openMenu = false;
    if (!query.result) return;
    exportCsv(query.result, spec.value, dataset.meta);
  }

  function json(): void {
    openMenu = false;
    exportJson(spec.value);
  }

  async function onImport(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    openMenu = false;
    if (!file) return;
    try {
      const imported = await importJson(file, dataset.ready ? dataset.meta : undefined);
      if (dataset.ready && imported.datasetId !== dataset.entry?.id) {
        ui.toast(`This view is for dataset "${imported.datasetId}"; open that dataset first`, 'warn');
        return;
      }
      spec.replace(imported);
      ui.toast('View imported', 'success');
    } catch (err) {
      ui.toast(err instanceof Error ? err.message : String(err), 'error');
    }
  }
</script>

<div class="export" bind:this={root}>
  <button type="button" class="export__toggle" aria-haspopup="menu" aria-expanded={openMenu} onclick={() => { openMenu = !openMenu; }}>
    Export
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
  {#if openMenu}
    <ul class="menu card" role="menu" aria-label="Export">
      <li><button type="button" role="menuitem" onclick={png} disabled={!toPng || !canExportData}>Chart as PNG</button></li>
      <li><button type="button" role="menuitem" onclick={csv} disabled={!canExportData}>Table as CSV</button></li>
      <li><button type="button" role="menuitem" onclick={json} disabled={!canExportSpec}>View as JSON</button></li>
      <li class="menu__sep" role="separator"></li>
      <li><button type="button" role="menuitem" onclick={() => fileInput?.click()}>Import view…</button></li>
    </ul>
  {/if}
  <input bind:this={fileInput} type="file" accept=".json,application/json" class="export__file" onchange={onImport} aria-hidden="true" tabindex="-1" />
</div>

<style>
  .export { position: relative; display: inline-block; }
  .export__toggle { display: inline-flex; align-items: center; gap: var(--space-xs); min-height: var(--space-xl); padding: 0 var(--space-sm); border-radius: var(--radius-sm); font-size: 0.82rem; font-weight: 500; color: inherit; }
  .export__toggle:hover, .export__toggle[aria-expanded='true'] { background: color-mix(in srgb, currentColor 12%, transparent); }
  .menu { position: absolute; right: 0; top: calc(100% + var(--space-xs)); z-index: 30; min-width: 12rem; list-style: none; margin: 0; padding: var(--space-xs); box-shadow: var(--shadow-lg); color: var(--text-secondary); }
  .menu button { display: block; width: 100%; min-height: var(--touch-target); padding: 0 var(--space-md); text-align: left; font-size: 0.82rem; border-radius: var(--radius-sm); color: var(--text-secondary); }
  .menu button:hover:not(:disabled) { background: var(--bg-page); color: var(--text-primary); }
  .menu button:disabled { opacity: 0.45; cursor: default; }
  .menu__sep { height: 1px; margin: var(--space-xs) 0; background: var(--border-light); }
  .export__file { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; pointer-events: none; }
</style>
