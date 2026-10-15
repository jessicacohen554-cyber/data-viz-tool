/**
 * Svelte action: `use:dropzone={{ id: 'columns', orientation: 'horizontal' }}`
 * registers an element as a drop zone on the app-wide controller. Drops are
 * delivered through `dragController().on('drop', …)`, not per zone, so one
 * subscriber (ShelfPanel) applies the drop rules for every shelf.
 */
import type { Action } from 'svelte/action';
import { dragController, type ZoneSpec } from './drag-controller';

/** Register the element as a drop zone; re-registers when the spec changes. */
export const dropzone: Action<HTMLElement, ZoneSpec> = (node, spec) => {
  let off = dragController().registerZone(node, spec);
  return {
    update(next) { off(); off = dragController().registerZone(node, next); },
    destroy() { off(); },
  };
};
