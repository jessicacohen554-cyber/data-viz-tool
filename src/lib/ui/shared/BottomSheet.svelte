<script lang="ts" module>
  /** A drag on the handle longer than this (px, downward) closes the sheet. */
  export const SHEET_DISMISS_PX = 64;
</script>

<script lang="ts">
  /**
   * Phone bottom sheet (D-11): hosts the Data / Shelves / Marks / Chart
   * panels below 900px. Backdrop tap, Escape, the × and a downward swipe on
   * the handle all close it. The sheet is `aria-modal`; focus moves to it on
   * open and returns to the opener on close.
   */
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    open,
    title,
    onClose,
    children,
  }: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: Snippet;
  } = $props();

  let panel = $state<HTMLElement | null>(null);
  let dragStartY: number | null = null;
  let offset = $state(0);
  let opener: HTMLElement | null = null;

  function onHandleDown(e: PointerEvent): void {
    dragStartY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onHandleMove(e: PointerEvent): void {
    if (dragStartY === null) return;
    offset = Math.max(0, e.clientY - dragStartY);
  }
  function onHandleUp(): void {
    if (dragStartY === null) return;
    const shouldClose = offset > SHEET_DISMISS_PX;
    dragStartY = null;
    offset = 0;
    if (shouldClose) onClose();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }

  $effect(() => {
    if (open) {
      opener = document.activeElement as HTMLElement | null;
      panel?.focus();
    } else if (opener) {
      opener.focus?.();
      opener = null;
    }
  });
</script>

{#if open}
  <div class="sheet__backdrop" role="presentation" onclick={onClose}></div>
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    bind:this={panel}
    style={offset ? `transform: translateY(${offset}px)` : ''}
    onkeydown={onKey}
  >
    <div
      class="sheet__handle"
      role="button"
      tabindex="0"
      aria-label="Drag down to close"
      onpointerdown={onHandleDown}
      onpointermove={onHandleMove}
      onpointerup={onHandleUp}
      onpointercancel={onHandleUp}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClose(); } }}
    >
      <span class="sheet__grip" aria-hidden="true"></span>
    </div>
    <header class="sheet__head">
      <h2 class="sheet__title">{title}</h2>
      <button type="button" class="sheet__close" aria-label="Close" onclick={onClose}><Icon name="close" /></button>
    </header>
    <div class="sheet__body">
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .sheet__backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: var(--navy-dark);
    opacity: 0.35;
  }
  .sheet {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 31;
    display: flex;
    flex-direction: column;
    max-height: 80dvh;
    background: var(--bg-card);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    box-shadow: var(--shadow-xl);
    padding-bottom: calc(var(--bottom-bar-height) + env(safe-area-inset-bottom));
    outline: none;
    transition: transform var(--transition-fast);
  }
  .sheet__handle {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: var(--touch-target);
    touch-action: none;
    cursor: grab;
  }
  .sheet__grip {
    width: 40px;
    height: 4px;
    border-radius: var(--pill-radius);
    background: var(--border);
  }
  .sheet__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-md) var(--space-sm);
  }
  .sheet__title { font-size: 1rem; }
  .sheet__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--touch-target);
    height: var(--touch-target);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
  }
  .sheet__close:hover { background: var(--bg-page); }
  .sheet__body { overflow: auto; min-height: 0; padding: 0 var(--space-md) var(--space-md); }
</style>
