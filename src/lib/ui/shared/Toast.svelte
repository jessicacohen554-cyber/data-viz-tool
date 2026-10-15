<script lang="ts">
  /**
   * Toast stack bound to `ui.toasts` (polite live region). Mount once in the
   * app shell; `ui.toast(message, kind)` from anywhere shows one for
   * `TOAST_MS`; the × dismisses early.
   */
  import Icon from './Icon.svelte';
  import { ui } from '../../stores/ui.svelte';
</script>

<div class="toasts" aria-live="polite" aria-relevant="additions">
  {#each ui.toasts as t (t.id)}
    <div class="toast toast--{t.kind}" role="status">
      <span class="toast__icon"><Icon name={t.kind} /></span>
      <span class="toast__msg">{t.message}</span>
      <button type="button" class="toast__close" aria-label="Dismiss" onclick={() => ui.dismissToast(t.id)}>
        <Icon name="close" />
      </button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: calc(var(--space-md) + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    width: min(420px, calc(100vw - 2 * var(--space-md)));
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-sm) var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    background: var(--navy);
    color: var(--text-on-dark);
    box-shadow: var(--shadow-lg);
    font-size: 0.82rem;
    pointer-events: auto;
    border-left: 4px solid var(--info);
  }
  .toast--warn { border-left-color: var(--warning); }
  .toast--error { border-left-color: var(--negative); }
  .toast--success { border-left-color: var(--positive); }
  .toast__icon { display: inline-flex; color: var(--text-muted-dark); }
  .toast__msg { flex: 1; }
  .toast__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    color: var(--text-muted-dark);
  }
  .toast__close:hover { background: var(--bg-card-dark); color: var(--text-on-dark); }
  @media (max-width: 900px) {
    /* Phones: drop from below the nav so the stack never covers a bottom sheet's shelves. */
    .toasts { top: calc(var(--nav-height) + var(--space-sm)); bottom: auto; }
    .toast__close { width: var(--touch-target); height: var(--touch-target); }
  }
</style>
