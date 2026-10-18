/**
 * Transient UI state (never persisted, never part of VizSpec): viewport mode,
 * which bottom sheet is open on phones, the tap-to-place selection, which
 * dialog is open (S6: the one home for dialog state, see
 * `docs/records/s6/HANDOFF-s6-integration-2026-10-16.md` S5 seam 2), toasts.
 */
import { untrack } from 'svelte';
import { MOBILE_BREAKPOINT } from '../core/constants';

export type SheetId = 'none' | 'fields' | 'shelves' | 'marks' | 'chart';
export type ToastKind = 'info' | 'warn' | 'error' | 'success';
export interface Toast { id: number; kind: ToastKind; message: string }

/** What the Format dialog edits (structurally `FormatTarget` in `FormatDialog.svelte`; stores never import components). */
export type FormatDialogTarget = { kind: 'pill'; pillId: string } | { kind: 'field'; field: string };

/** Which axis an Axis dialog edits (`VizSpec.axes.x` / `.y` / `.y2`). */
export type AxisId = 'x' | 'y' | 'y2';

/**
 * A mark the user clicked, awaiting annotation text (T4). `x` is the category
 * label or numeric/epoch x of the mark; `y` and `seriesKey` when known.
 * Structurally `Annotation` minus `id`, `text` and `offset`.
 */
export interface AnnotationAnchor { x: string | number; y?: number; seriesKey?: string }

/**
 * What the Annotation editor opens on: an existing annotation by id, or a
 * pending anchor from `ChartCanvas`'s mark click; `null` opens the list only.
 */
export type AnnotationDialogTarget = { kind: 'edit'; id: string } | { kind: 'pending'; anchor: AnnotationAnchor } | null;

/** The open dialog, hosted by `App.svelte`; `null` when none is open. */
export type DialogState =
  | { kind: 'dataset' }
  | { kind: 'views' }
  | { kind: 'palette' }
  | { kind: 'format'; target: FormatDialogTarget }
  | { kind: 'filter'; pillId: string }
  // v2 formatting UI (T4): the style panel, per-axis options, reference and trend lines, annotations.
  | { kind: 'style' }
  | { kind: 'axis'; which: AxisId }
  | { kind: 'reference' }
  | { kind: 'trend' }
  | { kind: 'annotation'; target: AnnotationDialogTarget };

/** Toast lifetime. */
export const TOAST_MS = 4000;

let nextToast = 1;

function createUiStore() {
  let isMobile = $state(false);
  let sheet = $state<SheetId>('none');
  /** Pill id (or `field:<name>` for a field-list item) selected by tap, awaiting a shelf tap. */
  let tapSelection = $state<string | null>(null);
  let dialog = $state<DialogState | null>(null);
  let toasts = $state<Toast[]>([]);

  function observeViewport(): () => void {
    if (typeof window === 'undefined') return () => {};
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const apply = () => { isMobile = mq.matches; if (!mq.matches) sheet = 'none'; };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }

  return {
    get isMobile() { return isMobile; },
    get sheet() { return sheet; },
    set sheet(v: SheetId) { sheet = v; },
    get tapSelection() { return tapSelection; },
    set tapSelection(v: string | null) { tapSelection = v; },
    get dialog() { return dialog; },
    /** Open a dialog (replacing any open one); `null` closes. */
    set dialog(v: DialogState | null) { dialog = v; },
    get toasts() { return toasts; },
    toggleSheet(id: SheetId) { sheet = sheet === id ? 'none' : id; },
    openDialog(v: DialogState) { dialog = v; },
    closeDialog() { dialog = null; },
    /** Show a toast. Safe to call from an `$effect`: the current list is read untracked, so the caller never depends on it. */
    toast(message: string, kind: ToastKind = 'info') {
      const id = nextToast++;
      toasts = [...untrack(() => toasts), { id, kind, message }];
      setTimeout(() => { toasts = untrack(() => toasts).filter((t) => t.id !== id); }, TOAST_MS);
    },
    dismissToast(id: number) { toasts = untrack(() => toasts).filter((t) => t.id !== id); },
    observeViewport,
  };
}

export const ui = createUiStore();
