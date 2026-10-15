<script lang="ts" module>
  /**
   * Context menu / popover shared by pills and field items. Anchored below
   * its element on desktop; a bottom sheet on phones (D-11). Submenus drill
   * in place with a "Back" row (▸ on the parent) so touch users never need
   * hover. Keyboard: arrows move, Enter/Space select, Right opens a submenu,
   * Left/Escape go back, Escape at the root closes.
   */
  import type { IconName } from './Icon.svelte';

  export interface MenuItem {
    id: string;
    label: string;
    icon?: IconName;
    /** Right-aligned hint (shortcut, current value). */
    hint?: string;
    /** Radio/check state shown as a tick. */
    checked?: boolean;
    disabled?: boolean;
    /** Destructive styling (Remove). */
    danger?: boolean;
    /** Submenu rows; the item then drills instead of selecting. */
    children?: MenuSection[];
    onSelect?: () => void;
  }

  export interface MenuSection {
    title?: string;
    items: MenuItem[];
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { ui } from '../../stores/ui.svelte';

  let {
    anchor,
    sections,
    title = '',
    onClose,
  }: {
    /** Element the menu hangs from (null = centred). */
    anchor: HTMLElement | null;
    sections: MenuSection[];
    /** Heading shown on the sheet variant and as the aria-label. */
    title?: string;
    onClose: () => void;
  } = $props();

  /** Drill path: each entry is the submenu's sections plus the parent label. */
  let stack = $state<Array<{ label: string; sections: MenuSection[] }>>([]);
  let panel = $state<HTMLElement | null>(null);
  let pos = $state({ left: 0, top: 0, maxHeight: 0 });

  const current = $derived(stack.length ? stack[stack.length - 1]!.sections : sections);
  const heading = $derived(stack.length ? stack[stack.length - 1]!.label : title);

  function place(): void {
    if (!anchor || !panel || ui.isMobile) return;
    const r = anchor.getBoundingClientRect();
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = Math.min(r.left, vw - w - 8);
    let top = r.bottom + 4;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 4);
    pos = { left: Math.max(8, left), top, maxHeight: vh - 16 };
  }

  function focusFirst(): void {
    tick().then(() => {
      const first = panel?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])');
      first?.focus();
      place();
    });
  }

  function select(item: MenuItem): void {
    if (item.disabled) return;
    if (item.children) { stack = [...stack, { label: item.label, sections: item.children }]; focusFirst(); return; }
    item.onSelect?.();
    onClose();
  }

  function back(): void {
    if (!stack.length) { onClose(); return; }
    stack = stack.slice(0, -1);
    focusFirst();
  }

  function onKey(e: KeyboardEvent): void {
    const items = Array.from(panel?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); items[(i + 1) % items.length]?.focus(); break;
      case 'ArrowUp': e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); break;
      case 'Home': e.preventDefault(); items[0]?.focus(); break;
      case 'End': e.preventDefault(); items[items.length - 1]?.focus(); break;
      case 'ArrowLeft': e.preventDefault(); back(); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); back(); break;
      case 'Tab': onClose(); break;
      default: return;
    }
  }

  function onDocPointer(e: PointerEvent): void {
    const t = e.target as Node | null;
    if (panel && t && !panel.contains(t) && !(anchor && anchor.contains(t))) onClose();
  }

  $effect(() => {
    focusFirst();
    document.addEventListener('pointerdown', onDocPointer, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  });
</script>

{#if ui.isMobile}
  <div class="menu__backdrop" aria-hidden="true"></div>
{/if}
<div
  class="menu"
  class:menu--sheet={ui.isMobile}
  role="menu"
  aria-label={heading || 'Menu'}
  tabindex="-1"
  bind:this={panel}
  style={ui.isMobile ? '' : `left:${pos.left}px; top:${pos.top}px; max-height:${pos.maxHeight || 9999}px`}
  onkeydown={onKey}
>
  {#if stack.length || ui.isMobile}
    <div class="menu__head">
      {#if stack.length}
        <button type="button" class="menu__back" onclick={back} aria-label="Back">
          <Icon name="chevron-left" />
        </button>
      {/if}
      <span class="menu__title">{heading}</span>
      {#if ui.isMobile}
        <button type="button" class="menu__close" onclick={onClose} aria-label="Close menu"><Icon name="close" /></button>
      {/if}
    </div>
  {/if}
  <div class="menu__scroll">
    {#each current as section, si (si)}
      {#if si > 0}<div class="menu__sep" role="separator"></div>{/if}
      {#if section.title}<div class="menu__section eyebrow">{section.title}</div>{/if}
      {#each section.items as item (item.id)}
        <button
          type="button"
          class="menu__item"
          class:menu__item--danger={item.danger}
          role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
          aria-disabled={item.disabled ? 'true' : undefined}
          aria-haspopup={item.children ? 'menu' : undefined}
          aria-checked={item.checked === undefined ? undefined : item.checked}
          tabindex="-1"
          onclick={() => select(item)}
          onkeydown={(e) => { if (e.key === 'ArrowRight' && item.children) { e.preventDefault(); select(item); } }}
        >
          <span class="menu__tick" aria-hidden="true">{#if item.checked}<Icon name="check" />{/if}</span>
          {#if item.icon}<span class="menu__icon"><Icon name={item.icon} /></span>{/if}
          <span class="menu__label">{item.label}</span>
          {#if item.hint}<span class="menu__hint num">{item.hint}</span>{/if}
          {#if item.children}<span class="menu__more" aria-hidden="true"><Icon name="chevron-right" /></span>{/if}
        </button>
      {/each}
    {/each}
  </div>
</div>

<style>
  .menu {
    position: fixed;
    z-index: 40;
    min-width: 220px;
    max-width: min(320px, calc(100vw - 2 * var(--space-md)));
    display: flex;
    flex-direction: column;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--space-xs) 0;
    font-size: 0.82rem;
    color: var(--text-secondary);
    outline: none;
  }
  .menu__backdrop {
    position: fixed;
    inset: 0;
    z-index: 39;
    background: var(--navy-dark);
    opacity: 0.35;
  }
  .menu--sheet {
    inset: auto 0 0 0;
    max-width: none;
    max-height: 70dvh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .menu__scroll { overflow: auto; min-height: 0; }
  .menu__head {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    border-bottom: 1px solid var(--border-light);
    margin-bottom: var(--space-xs);
  }
  .menu__title { flex: 1; font-weight: 700; color: var(--text-primary); }
  .menu__back, .menu__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
  }
  .menu__back:hover, .menu__close:hover { background: var(--bg-page); }
  .menu__section { padding: var(--space-xs) var(--space-md) 2px; }
  .menu__sep { height: 1px; background: var(--border-light); margin: var(--space-xs) 0; }
  .menu__item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    min-height: 32px;
    padding: 4px var(--space-md) 4px var(--space-sm);
    text-align: left;
    color: inherit;
  }
  .menu__item:hover, .menu__item:focus-visible { background: var(--bg-page); outline: none; }
  .menu__item[aria-disabled='true'] { opacity: 0.45; cursor: default; }
  .menu__item--danger { color: var(--red-text); }
  .menu__tick { width: 1em; display: inline-flex; justify-content: center; color: var(--hydro-text); }
  .menu__icon { display: inline-flex; color: var(--text-muted); }
  .menu__label { flex: 1; }
  .menu__hint { font-size: 0.72rem; color: var(--text-muted); }
  .menu__more { display: inline-flex; color: var(--text-muted); }
  @media (max-width: 900px) {
    .menu__item { min-height: var(--touch-target); font-size: 0.9rem; }
    .menu__back, .menu__close { width: var(--touch-target); height: var(--touch-target); }
  }
</style>
