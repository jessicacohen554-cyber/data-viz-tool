<script lang="ts">
  /**
   * Dialog shell (shard S5): a centred modal on desktop and a bottom sheet on
   * phones (`ui.isMobile`, D-11). Closes on Escape, on the backdrop and on
   * the ✕ button; focus moves into the panel when it opens and back to the
   * previously focused element when it closes. Content is a snippet; an
   * optional `footer` snippet holds the action row. Tokens only (R-TOKENS).
   */
  import type { Snippet } from 'svelte';
  import { ui } from '$stores/ui.svelte';

  interface Props {
    open: boolean;
    title: string;
    onclose: () => void;
    /** Desktop panel width; sheets always span the viewport. */
    width?: 'sm' | 'md' | 'lg';
    children: Snippet;
    footer?: Snippet;
  }

  let { open, title, onclose, width = 'md', children, footer }: Props = $props();

  let panel = $state<HTMLElement | null>(null);
  const titleId = `dlg-${Math.random().toString(36).slice(2, 9)}`;

  $effect(() => {
    if (!open || !panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.querySelector<HTMLElement>('input, select, textarea, button:not(.dialog__close), [tabindex]:not([tabindex="-1"])');
    (first ?? panel).focus();
    return () => previous?.focus?.();
  });

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.stopPropagation(); onclose(); }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dialog-backdrop" class:dialog-backdrop--sheet={ui.isMobile} role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) onclose(); }} onkeydown={onkeydown}>
    <div
      class="dialog card dialog--{width}"
      class:dialog--sheet={ui.isMobile}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabindex="-1"
      bind:this={panel}
    >
      <header class="dialog__header">
        {#if ui.isMobile}<div class="dialog__grip" aria-hidden="true"></div>{/if}
        <h2 class="dialog__title" id={titleId}>{title}</h2>
        <button type="button" class="dialog__close" aria-label="Close" onclick={onclose}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
        </button>
      </header>
      <div class="dialog__body">
        {@render children()}
      </div>
      {#if footer}
        <footer class="dialog__footer">
          {@render footer()}
        </footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: var(--space-md);
    background: color-mix(in srgb, var(--navy) 45%, transparent);
    animation: fade var(--transition-fast);
  }
  .dialog-backdrop--sheet { place-items: end stretch; padding: 0; }

  .dialog {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: calc(100dvh - 2 * var(--space-md));
    box-shadow: var(--shadow-xl);
    outline: none;
    animation: rise var(--transition-base);
  }
  .dialog--sm { max-width: 24rem; }
  .dialog--md { max-width: 36rem; }
  .dialog--lg { max-width: 52rem; }
  .dialog--sheet {
    max-width: none;
    max-height: calc(100dvh - var(--space-2xl));
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .dialog__header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-md) var(--space-sm);
    border-bottom: 1px solid var(--border-light);
    position: relative;
  }
  .dialog__grip {
    position: absolute;
    top: var(--space-xs);
    left: 50%;
    width: var(--space-xl);
    height: var(--space-xs);
    margin-left: calc(-1 * var(--space-md));
    border-radius: var(--pill-radius);
    background: var(--border);
  }
  .dialog__title { flex: 1; font-size: 1rem; }
  .dialog__close {
    display: grid;
    place-items: center;
    width: var(--touch-target);
    height: var(--touch-target);
    margin: calc(-1 * var(--space-sm));
    border-radius: var(--radius-sm);
    color: var(--text-muted);
  }
  .dialog__close:hover { background: var(--bg-page); color: var(--text-primary); }

  .dialog__body { flex: 1; min-height: 0; overflow: auto; padding: var(--space-md); }
  .dialog__footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md) var(--space-md);
    border-top: 1px solid var(--border-light);
  }

  @keyframes fade { from { opacity: 0; } }
  @keyframes rise { from { transform: translateY(var(--space-md)); opacity: 0; } }
</style>
