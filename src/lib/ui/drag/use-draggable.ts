/**
 * Svelte action: `use:draggable={() => payload}` makes an element a drag
 * source on the app-wide controller. The payload getter is read at drag
 * start, so a pill whose shelf changes stays correct without re-mounting.
 */
import type { Action } from 'svelte/action';
import { dragController, type DragPayload } from './drag-controller';

/** Action parameter: a getter so the payload is always current. */
export type DraggableParam = () => DragPayload;

/** Register the element as a drag source for its lifetime. */
export const draggable: Action<HTMLElement, DraggableParam> = (node, getPayload) => {
  let current = getPayload;
  const off = dragController().registerSource(node, () => current());
  return {
    update(next) { current = next; },
    destroy() { off(); },
  };
};
