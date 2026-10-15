/**
 * The VizSpec store (rule R-SPEC): the only mutable viz state in the app.
 * Svelte 5 runes; every change goes through `patch()` or `replace()`, which
 * record undo history. Pure modules never import this file.
 */
import type { Pill, ShelfId, VizSpec } from '../core/types';
import { UNDO_DEPTH, SINGLE_PILL_SHELVES } from '../core/constants';
import { cloneSpec, createDefaultSpec } from '../core/spec-defaults';

/** Store API consumed by UI components and the query pipeline. */
export interface SpecStore {
  /** Current spec (reactive). */
  readonly value: VizSpec;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Replace wholesale (dataset switch, saved-view load, hash restore). */
  replace(spec: VizSpec, opts?: { history?: boolean }): void;
  /** Mutate a draft copy; the draft becomes the new value. */
  patch(fn: (draft: VizSpec) => void): void;
  undo(): void;
  redo(): void;
  /** Shelf helpers used by drag/drop and the field list. */
  addPill(shelf: ShelfId, pill: Pill, index?: number): void;
  movePill(pillId: string, to: ShelfId, index?: number): void;
  removePill(pillId: string): void;
  updatePill(pillId: string, fn: (pill: Pill) => void): void;
  findPill(pillId: string): { shelf: ShelfId; index: number; pill: Pill } | null;
}

/** Create a store. Exported for tests; the app uses the singleton `spec`. */
export function createSpecStore(initial: VizSpec = createDefaultSpec('')): SpecStore {
  let value = $state<VizSpec>(initial);
  let past = $state<VizSpec[]>([]);
  let future = $state<VizSpec[]>([]);

  function commit(next: VizSpec, history: boolean): void {
    if (history) {
      past = [...past.slice(-(UNDO_DEPTH - 1)), value];
      future = [];
    }
    value = next;
  }

  function findPill(pillId: string): { shelf: ShelfId; index: number; pill: Pill } | null {
    for (const shelf of Object.keys(value.shelves) as ShelfId[]) {
      const idx = value.shelves[shelf].findIndex((p) => p.id === pillId);
      if (idx >= 0) return { shelf, index: idx, pill: value.shelves[shelf][idx]! };
    }
    return null;
  }

  const store: SpecStore = {
    get value() { return value; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    replace(spec, opts) { commit(cloneSpec(spec), opts?.history ?? true); },
    patch(fn) {
      const draft = cloneSpec(value);
      fn(draft);
      commit(draft, true);
    },
    undo() {
      const prev = past[past.length - 1];
      if (!prev) return;
      past = past.slice(0, -1);
      future = [value, ...future];
      value = prev;
    },
    redo() {
      const next = future[0];
      if (!next) return;
      future = future.slice(1);
      past = [...past, value];
      value = next;
    },
    addPill(shelf, pill, index) {
      store.patch((d) => {
        if (SINGLE_PILL_SHELVES.has(shelf)) {
          // Single-pill shelves replace; the displaced pill is dropped and its filter (if any) removed.
          d.shelves[shelf] = [pill];
        } else {
          const arr = d.shelves[shelf];
          arr.splice(index ?? arr.length, 0, pill);
        }
      });
    },
    movePill(pillId, to, index) {
      store.patch((d) => {
        let moved: Pill | undefined;
        for (const shelf of Object.keys(d.shelves) as ShelfId[]) {
          const i = d.shelves[shelf].findIndex((p) => p.id === pillId);
          if (i >= 0) { moved = d.shelves[shelf].splice(i, 1)[0]; if (shelf === 'filters') d.filters = d.filters.filter((f) => f.pillId !== pillId); break; }
        }
        if (!moved) return;
        if (SINGLE_PILL_SHELVES.has(to)) d.shelves[to] = [moved];
        else d.shelves[to].splice(index ?? d.shelves[to].length, 0, moved);
      });
    },
    removePill(pillId) {
      store.patch((d) => {
        for (const shelf of Object.keys(d.shelves) as ShelfId[]) {
          d.shelves[shelf] = d.shelves[shelf].filter((p) => p.id !== pillId);
        }
        d.filters = d.filters.filter((f) => f.pillId !== pillId);
      });
    },
    updatePill(pillId, fn) {
      store.patch((d) => {
        for (const shelf of Object.keys(d.shelves) as ShelfId[]) {
          const p = d.shelves[shelf].find((pp) => pp.id === pillId);
          if (p) { fn(p); return; }
        }
      });
    },
    findPill,
  };
  return store;
}

/** App-wide singleton. */
export const spec: SpecStore = createSpecStore();
