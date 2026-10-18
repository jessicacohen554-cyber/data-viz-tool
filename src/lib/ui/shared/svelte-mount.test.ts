/**
 * The one Svelte mount helper for component tests under jsdom (T4 and T5 each
 * shipped a copy; T6 kept this one). Vitest resolves the bare `svelte` import
 * to its server build (no `browser` resolve condition in vite.config.ts),
 * where `mount()` throws; the components themselves compile for the DOM under
 * the jsdom environment, so the client runtime is imported by file path
 * instead. The suite at the bottom checks the helper so the file is a valid
 * Vitest module (the `fake-client.test.ts` pattern).
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
// @ts-expect-error the client runtime by path: `svelte` resolves to the server build under Vitest (T5 seam 2).
import { mount as clientMount, unmount as clientUnmount, flushSync as clientFlush } from '../../../../node_modules/svelte/src/index-client.js';
import Icon from './Icon.svelte';

/** A mounted component with its root element and a teardown. */
export interface Mounted {
  root: HTMLElement;
  unmount: () => void;
}

/** Run pending effects and DOM updates. */
export const flush: () => void = clientFlush;

/** Mount `component` with `props` into a fresh element under `document.body`. */
export function mountComponent<P extends Record<string, unknown>>(component: Component<P>, props: P): Mounted {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const instance = clientMount(component, { target: root, props });
  clientFlush();
  return {
    root,
    unmount() { clientUnmount(instance); root.remove(); },
  };
}

/** Click an element and flush. */
export function click(el: Element | null | undefined): void {
  if (!el) throw new Error('click: no element');
  (el as HTMLElement).click();
  clientFlush();
}

/** Set a `<select>` / `<input>` value and fire the event Svelte listens to, then flush. */
export function setValue(el: Element | null | undefined, value: string, event: 'change' | 'input' = 'change'): void {
  if (!el) throw new Error('setValue: no element');
  (el as HTMLInputElement).value = value;
  el.dispatchEvent(new Event(event, { bubbles: true }));
  clientFlush();
}

/** Toggle a checkbox to `checked` and fire `change`, then flush. */
export function setChecked(el: Element | null | undefined, checked: boolean): void {
  if (!el) throw new Error('setChecked: no element');
  (el as HTMLInputElement).checked = checked;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  clientFlush();
}

/** The element whose trimmed text equals `text`, among `selector` matches under `root`. */
export function byText(root: ParentNode, selector: string, text: string): HTMLElement | undefined {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).find((el) => el.textContent?.trim() === text);
}

/** The form control labelled `label` (an `aria-label` or a wrapping `<label>` text) under `root`. */
export function byLabel(root: ParentNode, label: string): HTMLElement | undefined {
  const direct = root.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (direct) return direct;
  const wrapper = Array.from(root.querySelectorAll<HTMLLabelElement>('label')).find((l) => l.querySelector('span')?.textContent?.trim() === label || l.textContent?.trim() === label);
  return wrapper?.querySelector<HTMLElement>('input, select, textarea') ?? undefined;
}

/** Let pending promise callbacks run, then flush. */
export async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  clientFlush();
}

describe('svelte mount helper', () => {
  it('mounts a component for the DOM under jsdom', () => {
    const m = mountComponent(Icon, { name: 'check', label: 'Done' });
    expect(m.root.querySelector('svg[aria-label="Done"]')).not.toBeNull();
    m.unmount();
    expect(document.body.contains(m.root)).toBe(false);
  });
});
