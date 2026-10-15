/**
 * Transient UI state (never persisted, never part of VizSpec): viewport mode,
 * which bottom sheet is open on phones, the tap-to-place selection, toasts.
 */
import { MOBILE_BREAKPOINT } from '../core/constants';

export type SheetId = 'none' | 'fields' | 'shelves' | 'marks' | 'chart';
export type ToastKind = 'info' | 'warn' | 'error' | 'success';
export interface Toast { id: number; kind: ToastKind; message: string }

/** Toast lifetime. */
export const TOAST_MS = 4000;

let nextToast = 1;

function createUiStore() {
  let isMobile = $state(false);
  let sheet = $state<SheetId>('none');
  /** Pill id (or `field:<name>` for a field-list item) selected by tap, awaiting a shelf tap. */
  let tapSelection = $state<string | null>(null);
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
    get toasts() { return toasts; },
    toggleSheet(id: SheetId) { sheet = sheet === id ? 'none' : id; },
    toast(message: string, kind: ToastKind = 'info') {
      const id = nextToast++;
      toasts = [...toasts, { id, kind, message }];
      setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); }, TOAST_MS);
    },
    dismissToast(id: number) { toasts = toasts.filter((t) => t.id !== id); },
    observeViewport,
  };
}

export const ui = createUiStore();
