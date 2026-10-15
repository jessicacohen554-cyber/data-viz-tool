<script lang="ts">
  /**
   * Saved views dialog (shard S5, D-7): save the current spec under a name
   * (with an optional thumbnail from the chart canvas), list the views of the
   * open dataset, load one (one undo step), rename or delete it, and copy the
   * share link (the URL hash is flushed first so it carries the latest spec).
   */
  import type { SavedView } from '$core/types';
  import { spec } from '$stores/spec.svelte';
  import { dataset } from '$stores/dataset.svelte';
  import { views } from '$stores/views.svelte';
  import { ui } from '$stores/ui.svelte';
  import Dialog from './Dialog.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
    /** Captures a small PNG data URL of the chart for the card (ChartCanvas.toPng, wired by the app). */
    thumbnail?: () => Promise<string | undefined>;
  }

  let { open, onclose, thumbnail }: Props = $props();

  const datasetId = $derived(spec.value.datasetId);
  const list = $derived(datasetId ? views.list(datasetId) : []);
  let name = $state('');
  let saving = $state(false);
  let renaming = $state<string | null>(null);
  let renameText = $state('');
  let confirmDelete = $state<string | null>(null);

  const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  async function save(): Promise<void> {
    if (!datasetId || saving) return;
    saving = true;
    try {
      let thumb: string | undefined;
      try { thumb = await thumbnail?.(); } catch { thumb = undefined; }
      const v = views.save(name || defaultName(), spec.value, thumb);
      name = '';
      ui.toast(`Saved "${v.name}"`, 'success');
    } finally {
      saving = false;
    }
  }

  function defaultName(): string {
    const n = list.length + 1;
    return spec.value.title.trim() || `${spec.value.chartType} view ${n}`;
  }

  function load(v: SavedView): void {
    if (views.load(v.id)) { ui.toast(`Loaded "${v.name}"`); onclose(); }
  }

  function startRename(v: SavedView): void {
    renaming = v.id;
    renameText = v.name;
  }

  function commitRename(): void {
    if (renaming) views.rename(renaming, renameText);
    renaming = null;
  }

  function remove(v: SavedView): void {
    if (confirmDelete !== v.id) { confirmDelete = v.id; return; }
    views.remove(v.id);
    confirmDelete = null;
  }

  async function copyLink(): Promise<void> {
    await views.flush();
    try {
      await navigator.clipboard.writeText(location.href);
      ui.toast('Link copied', 'success');
    } catch {
      ui.toast('Could not copy; use the address bar', 'warn');
    }
  }

  function when(iso: string): string {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? dateFmt.format(t) : iso;
  }
</script>

<Dialog {open} {onclose} title="Saved views" width="md">
  {#snippet footer()}
    <button type="button" class="btn" onclick={copyLink} disabled={!datasetId}>Copy link</button>
    <button type="button" class="btn btn--primary" onclick={onclose}>Done</button>
  {/snippet}

  {#if !datasetId || !dataset.ready}
    <p class="muted">Open a dataset first; views are saved per dataset.</p>
  {:else}
    <form class="save" onsubmit={(e) => { e.preventDefault(); void save(); }}>
      <input type="text" placeholder={defaultName()} bind:value={name} aria-label="View name" maxlength="80" />
      <button type="submit" class="btn btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save current'}</button>
    </form>

    {#if list.length === 0}
      <p class="muted">No saved views for <strong>{dataset.entry?.name ?? datasetId}</strong> yet. Views live in this browser's storage; the link carries the current view.</p>
    {:else}
      <ul class="list">
        {#each list as v (v.id)}
          <li class="view card">
            <button type="button" class="view__main" onclick={() => load(v)} aria-label="Load {v.name}">
              {#if v.thumbnail}
                <img class="view__thumb" src={v.thumbnail} alt="" />
              {:else}
                <span class="view__thumb view__thumb--empty" aria-hidden="true">{v.spec.chartType}</span>
              {/if}
              <span class="view__text">
                {#if renaming === v.id}
                  <!-- svelte-ignore a11y_autofocus -->
                  <input type="text" class="view__rename" bind:value={renameText} autofocus aria-label="New name"
                    onclick={(e) => e.stopPropagation()}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } if (e.key === 'Escape') { e.stopPropagation(); renaming = null; } }}
                    onblur={commitRename} />
                {:else}
                  <span class="view__name">{v.name}</span>
                {/if}
                <span class="view__meta muted">{v.spec.chartType} · {when(v.createdAt)}</span>
              </span>
            </button>
            <span class="view__actions">
              <button type="button" class="btn" onclick={() => startRename(v)}>Rename</button>
              <button type="button" class="btn" class:btn--danger={confirmDelete === v.id} onclick={() => remove(v)} onblur={() => { if (confirmDelete === v.id) confirmDelete = null; }}>
                {confirmDelete === v.id ? 'Confirm' : 'Delete'}
              </button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</Dialog>

<style>
  .muted { color: var(--text-muted); font-size: 0.82rem; }
  .save { display: flex; gap: var(--space-sm); margin-bottom: var(--space-md); }
  .save input { flex: 1; }
  input[type='text'] { min-height: var(--touch-target); padding: var(--space-xs) var(--space-sm); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-sm); }
  .view { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-sm); }
  .view__main { flex: 1; display: flex; align-items: center; gap: var(--space-md); min-width: 0; min-height: var(--touch-target); text-align: left; border-radius: var(--radius-md); }
  .view__main:hover { background: var(--bg-page); }
  .view__thumb { width: var(--space-2xl); height: var(--space-xl); object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-light); flex: none; }
  .view__thumb--empty { display: grid; place-items: center; font-size: 0.6rem; color: var(--text-muted); background: var(--bg-page); }
  .view__text { display: flex; flex-direction: column; min-width: 0; }
  .view__name { font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .view__rename { width: 100%; }
  .view__actions { display: flex; gap: var(--space-xs); flex: none; }
  .btn--danger { color: var(--red-text); border-color: var(--negative); }
</style>
