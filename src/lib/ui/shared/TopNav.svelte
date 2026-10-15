<script lang="ts">
  /**
   * Top navigation: brand, undo/redo on the spec store, and three slots the
   * integration shard fills with the DatasetPicker, SavedViews and ExportMenu
   * triggers (S5). Slots are Svelte 5 snippets so this component has no
   * dependency on the dialogs.
   */
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { spec } from '../../stores/spec.svelte';

  let {
    version = '',
    title = '',
    dataset,
    views,
    exportSlot,
  }: {
    /** Shown as `v<version>` beside the brand. */
    version?: string;
    /** Current worksheet title (empty = hidden). */
    title?: string;
    dataset?: Snippet;
    views?: Snippet;
    exportSlot?: Snippet;
  } = $props();

  function onKey(e: KeyboardEvent): void {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || e.key.toLowerCase() !== 'z') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    if (e.shiftKey) spec.redo(); else spec.undo();
  }
</script>

<svelte:window onkeydown={onKey} />

<header class="topnav">
  <div class="topnav__brand">
    <span class="topnav__bolt"><Icon name="bolt" /></span>
    <span class="topnav__word">Data Viz Tool</span>
    {#if version}<span class="topnav__ver num">v{version}</span>{/if}
    {#if title}<span class="topnav__title" aria-label="Worksheet title">{title}</span>{/if}
  </div>
  <div class="topnav__history" role="group" aria-label="History">
    <button type="button" class="topnav__icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!spec.canUndo} onclick={() => spec.undo()}>
      <Icon name="undo" />
    </button>
    <button type="button" class="topnav__icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!spec.canRedo} onclick={() => spec.redo()}>
      <Icon name="redo" />
    </button>
  </div>
  <nav class="topnav__links" aria-label="Primary">
    {#if dataset}{@render dataset()}{:else}<button class="topnav__link" type="button" disabled>Dataset</button>{/if}
    {#if views}{@render views()}{:else}<button class="topnav__link" type="button" disabled>Views</button>{/if}
    {#if exportSlot}{@render exportSlot()}{:else}<button class="topnav__link" type="button" disabled>Export</button>{/if}
  </nav>
</header>

<style>
  .topnav {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    height: var(--nav-height);
    padding: 0 var(--space-md);
    background: var(--navy);
    color: var(--text-on-dark);
    min-width: 0;
    overflow: hidden;
  }
  .topnav__brand { display: flex; align-items: center; gap: var(--space-sm); min-width: 0; flex: 1 1 0; overflow: hidden; }
  .topnav__bolt { display: inline-flex; flex: none; color: var(--hydro); --icon-size: 20px; }
  .topnav__word {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .topnav__ver { font-size: 0.68rem; opacity: 0.6; }
  .topnav__title {
    margin-left: var(--space-sm);
    padding-left: var(--space-sm);
    border-left: 1px solid var(--text-muted-dark);
    font-size: 0.82rem;
    color: var(--text-muted-dark);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .topnav__history { display: flex; flex: none; gap: 2px; }
  .topnav__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    color: var(--text-muted-dark);
  }
  .topnav__icon:hover:not(:disabled) { background: var(--bg-card-dark); color: var(--text-on-dark); }
  .topnav__icon:disabled { opacity: 0.35; cursor: default; }
  .topnav__links { display: flex; flex: none; gap: var(--space-xs); }
  .topnav__links :global(.topnav__link) {
    color: var(--text-muted-dark);
    font-size: 0.82rem;
    font-weight: 500;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
  }
  .topnav__links :global(.topnav__link:hover:not(:disabled)) { background: var(--bg-card-dark); color: var(--text-on-dark); }
  .topnav__links :global(.topnav__link:disabled) { opacity: 0.45; cursor: default; }
  @media (max-width: 900px) {
    .topnav { gap: var(--space-sm); padding: 0 var(--space-sm); }
    /* Phones: bolt only; the word would clip to "Data …" beside three links and undo/redo. */
    .topnav__word, .topnav__ver, .topnav__title { display: none; }
    .topnav__icon { width: var(--touch-target); height: var(--touch-target); }
    .topnav__links :global(.topnav__link) { min-height: var(--touch-target); padding: 6px var(--space-sm); }
  }
</style>
