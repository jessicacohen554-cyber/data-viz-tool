/**
 * Drop rules: what happens to the VizSpec when a field or pill lands on a
 * shelf (docs/TABLEAU-SPEC.md §4–§6). Pure functions over the `SpecStore`
 * API so the rules are unit-tested without a DOM:
 *
 * - a field dropped on a shelf becomes `newPill(meta, shelf)` (a date
 *   defaults to discrete YEAR part; a measure to SUM, continuous);
 * - anything dropped on Filters also gets a default `FilterSpec`: a measure
 *   becomes an open `range`, a date an open `dateRange`, a string/boolean an
 *   include-all `categorical`; the dialog (S5) refines it;
 * - a pill dropped on a shelf moves (same object, stable id); re-dropping on
 *   its own shelf reorders; single-pill shelves replace (store rule).
 */
import type { FieldMeta, FilterSpec, Pill, ShelfId } from '../../core/types';
import { newPill } from '../../core/spec-defaults';
import type { SpecStore } from '../../stores/spec.svelte';
import type { DragPayload } from '../drag/drag-controller';

/** Outcome of a drop, for toasts and for opening the filter dialog. */
export interface DropOutcome {
  /** The pill that now sits on `shelf`. */
  pill: Pill;
  shelf: ShelfId;
  /** True when a filter entry was created (the caller may open the dialog). */
  filterCreated: boolean;
}

/** Default filter for a pill landing on the Filters shelf. */
export function defaultFilter(pill: Pill, meta: FieldMeta | undefined): FilterSpec {
  const base = { pillId: pill.id, field: pill.field };
  const type = meta?.type;
  if (type === 'date' || type === 'datetime' || pill.date) {
    return { ...base, kind: 'dateRange', from: null, to: null, level: pill.date?.level ?? 'day' };
  }
  if (pill.role === 'measure' || type === 'number' || type === 'integer') {
    return { ...base, kind: 'range', min: null, max: null, includeNull: false };
  }
  return { ...base, kind: 'categorical', mode: 'exclude', values: [], includeNull: true };
}

/** Look a field up in the meta list. */
export function findMeta(meta: readonly FieldMeta[], field: string): FieldMeta | undefined {
  return meta.find((m) => m.name === field);
}

/**
 * Apply a drop to the store. Returns null when the payload cannot be resolved
 * (unknown field, vanished pill). One store call per drop = one undo step
 * for the move; the filter entry is a second patch (also undoable).
 */
export function applyDrop(
  store: SpecStore,
  meta: readonly FieldMeta[],
  payload: DragPayload,
  shelf: ShelfId,
  index?: number,
): DropOutcome | null {
  if (payload.kind === 'field') {
    const m = findMeta(meta, payload.field);
    if (!m) return null;
    const pill = newPill(m, shelf);
    store.addPill(shelf, pill, index);
    let filterCreated = false;
    if (shelf === 'filters') {
      const filter = defaultFilter(pill, m);
      store.patch((d) => { d.filters = [...d.filters.filter((f) => f.field !== pill.field), filter]; });
      filterCreated = true;
    }
    return { pill, shelf, filterCreated };
  }

  const found = store.findPill(payload.pillId);
  if (!found) return null;
  // `index` counts slots with the dragged pill removed (the controller skips it), which is
  // exactly what movePill expects after it splices the pill out.
  if (found.shelf === shelf && index === found.index) return { pill: found.pill, shelf, filterCreated: false };
  store.movePill(payload.pillId, shelf, index);
  let filterCreated = false;
  if (shelf === 'filters' && found.shelf !== 'filters') {
    const filter = defaultFilter(found.pill, findMeta(meta, found.pill.field));
    store.patch((d) => { d.filters = [...d.filters.filter((f) => f.field !== found.pill.field), filter]; });
    filterCreated = true;
  }
  const after = store.findPill(payload.pillId);
  return after ? { pill: after.pill, shelf, filterCreated } : null;
}

/** Payload for a field-list item. */
export function fieldPayload(field: string): DragPayload {
  return { kind: 'field', field };
}

/** Payload for a pill on a shelf. */
export function pillPayload(pill: Pill, shelf: ShelfId): DragPayload {
  return { kind: 'pill', field: pill.field, pillId: pill.id, fromShelf: shelf };
}

/** Tap-selection token for the ui store: `field:<name>` or the pill id. */
export function selectionToken(payload: DragPayload): string {
  return payload.kind === 'field' ? `field:${payload.field}` : payload.pillId;
}

/** Inverse of `selectionToken`; needs the store to recover a pill's shelf. */
export function payloadFromToken(token: string, store: SpecStore): DragPayload | null {
  if (token.startsWith('field:')) return fieldPayload(token.slice('field:'.length));
  const found = store.findPill(token);
  return found ? pillPayload(found.pill, found.shelf) : null;
}
