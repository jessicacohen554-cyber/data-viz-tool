/**
 * Pointer-Events drag controller for pills and field items (plan §10, D-11).
 *
 * Pure DOM, no Svelte: `use-draggable.ts` / `use-dropzone.ts` wrap it as
 * actions, and `drag-controller.test.ts` drives it with synthetic
 * `PointerEvent`s under jsdom. Owns: the drag gesture (8 px move for mouse/pen,
 * 180 ms long-press for touch, `setPointerCapture`), the ghost element, the
 * drop-zone hit test, the drop index inside a zone, and the tap fallback
 * (a press that never became a drag is reported as `tap` so the UI can do
 * tap-pill-then-tap-shelf on phones). Must not import stores or components.
 */
import type { ShelfId } from '../../core/types';

/** What is being dragged: a field from the data pane or a pill already on a shelf. */
export type DragPayload =
  | { kind: 'field'; field: string }
  | { kind: 'pill'; field: string; pillId: string; fromShelf: ShelfId };

/** A registered drop zone. `id` is the shelf; `orientation` decides the index axis. */
export interface ZoneSpec {
  id: ShelfId;
  /** Pills flow horizontally (Columns/Rows) or vertically (Filters, Marks). */
  orientation?: 'horizontal' | 'vertical';
  /** Veto a payload (the zone shows no indicator and `drop` never fires). */
  accepts?: (payload: DragPayload) => boolean;
}

/** Fired when a drag ends over a zone that accepts the payload. */
export interface DropEvent { payload: DragPayload; zone: ShelfId; index: number }
/** Fired while dragging, whenever the hovered zone or index changes (null = no zone). */
export interface HoverEvent { payload: DragPayload; zone: ShelfId | null; index: number }
/** Fired when a press ends without becoming a drag (tap-to-place fallback). */
export interface TapEvent { payload: DragPayload; element: HTMLElement }
/** Fired when a zone is tapped while no drag is in progress. */
export interface ZoneTapEvent { zone: ShelfId }

/** Event map for `on()`. */
export interface DragEvents {
  start: DragPayload;
  hover: HoverEvent;
  drop: DropEvent;
  end: DragPayload;
  tap: TapEvent;
  zonetap: ZoneTapEvent;
}

/** Tunables (defaults from plan §10). */
export interface DragControllerOptions {
  /** Movement before a mouse/pen drag starts. */
  thresholdPx?: number;
  /** Hold before a touch drag starts (a shorter touch is a tap). */
  longPressMs?: number;
  /** Class applied to the ghost element (styled in app.css / the component). */
  ghostClass?: string;
  /** Class applied to the source element while it is being dragged. */
  draggingClass?: string;
  /** Class applied to the hovered zone. */
  overClass?: string;
}

/** Attribute a zone's children carry so the controller can compute the drop index. */
export const DROP_ITEM_ATTR = 'data-drop-item';

/** The controller API. */
export interface DragController {
  /** Payload currently being dragged, or null. */
  readonly active: DragPayload | null;
  /** Make `el` a drag source; returns the unregister function. */
  registerSource(el: HTMLElement, getPayload: () => DragPayload): () => void;
  /** Make `el` a drop zone; returns the unregister function. */
  registerZone(el: HTMLElement, spec: ZoneSpec): () => void;
  /** Subscribe; returns the unsubscribe function. */
  on<K extends keyof DragEvents>(event: K, handler: (e: DragEvents[K]) => void): () => void;
  /** Cancel an in-progress drag (Escape, blur). */
  cancel(): void;
  /** Remove every listener and the ghost. */
  destroy(): void;
}

interface Source { el: HTMLElement; getPayload: () => DragPayload; off: () => void }
interface Zone { el: HTMLElement; spec: ZoneSpec; off: () => void }

interface Press {
  source: Source;
  pointerId: number;
  startX: number;
  startY: number;
  pointerType: string;
  timer: ReturnType<typeof setTimeout> | null;
  dragging: boolean;
  payload: DragPayload | null;
  ghost: HTMLElement | null;
  hoverZone: Zone | null;
  hoverIndex: number;
}

const DEFAULTS: Required<DragControllerOptions> = {
  thresholdPx: 8,
  longPressMs: 180,
  ghostClass: 'drag-ghost',
  draggingClass: 'is-dragging',
  overClass: 'is-drop-over',
};

/**
 * Create a controller. The app uses the singleton `dragController`; tests
 * create their own so every test starts clean.
 */
export function createDragController(options: DragControllerOptions = {}): DragController {
  const opts = { ...DEFAULTS, ...options };
  const sources = new Set<Source>();
  const zones = new Set<Zone>();
  const handlers: { [K in keyof DragEvents]: Set<(e: DragEvents[K]) => void> } = {
    start: new Set(), hover: new Set(), drop: new Set(), end: new Set(), tap: new Set(), zonetap: new Set(),
  };
  let press: Press | null = null;

  function emit<K extends keyof DragEvents>(event: K, e: DragEvents[K]): void {
    for (const h of handlers[event]) h(e);
  }

  function pointInRect(x: number, y: number, r: DOMRect): boolean {
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /** Innermost registered zone under the pointer that accepts the payload. */
  function zoneAt(x: number, y: number, payload: DragPayload): Zone | null {
    let best: Zone | null = null;
    for (const z of zones) {
      if (!z.el.isConnected) continue;
      if (!pointInRect(x, y, z.el.getBoundingClientRect())) continue;
      if (z.spec.accepts && !z.spec.accepts(payload)) continue;
      if (!best || best.el.contains(z.el)) best = z;
    }
    return best;
  }

  /** Index among the zone's `[data-drop-item]` children, by midpoint on the flow axis. */
  function indexAt(zone: Zone, x: number, y: number, payload: DragPayload): number {
    const horizontal = (zone.spec.orientation ?? 'horizontal') === 'horizontal';
    const items = Array.from(zone.el.querySelectorAll<HTMLElement>(`[${DROP_ITEM_ATTR}]`));
    let index = 0;
    for (const item of items) {
      // The dragged pill itself does not count as a slot.
      if (payload.kind === 'pill' && item.getAttribute(DROP_ITEM_ATTR) === payload.pillId) continue;
      const r = item.getBoundingClientRect();
      const mid = horizontal ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2;
      if ((horizontal ? x : y) > mid) index++;
    }
    return index;
  }

  function makeGhost(sourceEl: HTMLElement, x: number, y: number): HTMLElement {
    const ghost = sourceEl.cloneNode(true) as HTMLElement;
    ghost.className = `${sourceEl.className} ${opts.ghostClass}`.trim();
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '1000';
    ghost.style.margin = '0';
    const r = sourceEl.getBoundingClientRect();
    ghost.style.width = r.width ? `${r.width}px` : '';
    positionGhost(ghost, x, y);
    document.body.appendChild(ghost);
    return ghost;
  }

  function positionGhost(ghost: HTMLElement, x: number, y: number): void {
    ghost.style.transform = `translate(${Math.round(x + 12)}px, ${Math.round(y + 12)}px)`;
  }

  function setHover(zone: Zone | null, index: number): void {
    if (!press || !press.payload) return;
    if (zone === press.hoverZone && index === press.hoverIndex) return;
    press.hoverZone?.el.classList.remove(opts.overClass);
    zone?.el.classList.add(opts.overClass);
    press.hoverZone = zone;
    press.hoverIndex = index;
    emit('hover', { payload: press.payload, zone: zone?.spec.id ?? null, index });
  }

  function startDrag(x: number, y: number): void {
    if (!press || press.dragging) return;
    clearTimer();
    press.dragging = true;
    press.payload = press.source.getPayload();
    press.ghost = makeGhost(press.source.el, x, y);
    press.source.el.classList.add(opts.draggingClass);
    document.body.classList.add(opts.draggingClass);
    emit('start', press.payload);
    track(x, y);
  }

  function track(x: number, y: number): void {
    if (!press || !press.dragging || !press.payload) return;
    if (press.ghost) positionGhost(press.ghost, x, y);
    const zone = zoneAt(x, y, press.payload);
    setHover(zone, zone ? indexAt(zone, x, y, press.payload) : 0);
  }

  function clearTimer(): void {
    if (press?.timer) { clearTimeout(press.timer); press.timer = null; }
  }

  function finish(dropped: boolean): void {
    if (!press) return;
    clearTimer();
    const p = press;
    press = null;
    try { p.source.el.releasePointerCapture(p.pointerId); } catch { /* already released */ }
    if (!p.dragging) return;
    p.hoverZone?.el.classList.remove(opts.overClass);
    p.source.el.classList.remove(opts.draggingClass);
    document.body.classList.remove(opts.draggingClass);
    p.ghost?.remove();
    if (!p.payload) return;
    if (dropped && p.hoverZone) emit('drop', { payload: p.payload, zone: p.hoverZone.spec.id, index: p.hoverIndex });
    emit('end', p.payload);
  }

  function onPointerDown(source: Source, e: PointerEvent): void {
    if (press) return;
    // Primary button only; a right-click opens the menu.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Buttons inside a pill (menu caret) are not drag handles.
    const t = e.target as HTMLElement | null;
    if (t && t !== source.el && t.closest('button, input, select, textarea, a') && !t.closest('[data-drag-handle]')) return;
    press = {
      source, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, pointerType: e.pointerType,
      timer: null, dragging: false, payload: null, ghost: null, hoverZone: null, hoverIndex: -1,
    };
    try { source.el.setPointerCapture(e.pointerId); } catch { /* jsdom without capture support */ }
    if (e.pointerType === 'touch') {
      press.timer = setTimeout(() => startDrag(press?.startX ?? 0, press?.startY ?? 0), opts.longPressMs);
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (!press || e.pointerId !== press.pointerId) return;
    if (!press.dragging) {
      const dx = e.clientX - press.startX;
      const dy = e.clientY - press.startY;
      const moved = Math.hypot(dx, dy) >= opts.thresholdPx;
      if (press.pointerType === 'touch') {
        // A finger that moves before the long-press fires is scrolling, not dragging.
        if (moved) finish(false);
        return;
      }
      if (!moved) return;
      startDrag(e.clientX, e.clientY);
      return;
    }
    e.preventDefault();
    track(e.clientX, e.clientY);
  }

  function onPointerUp(e: PointerEvent): void {
    if (!press || e.pointerId !== press.pointerId) return;
    if (!press.dragging) {
      const src = press.source;
      finish(false);
      emit('tap', { payload: src.getPayload(), element: src.el });
      return;
    }
    finish(true);
  }

  function onPointerCancel(e: PointerEvent): void {
    if (!press || e.pointerId !== press.pointerId) return;
    finish(false);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && press?.dragging) { e.preventDefault(); finish(false); }
  }

  const controller: DragController = {
    get active() { return press?.dragging ? press.payload : null; },
    registerSource(el, getPayload) {
      const source: Source = { el, getPayload, off: () => {} };
      const down = (e: PointerEvent) => onPointerDown(source, e);
      const move = (e: PointerEvent) => onPointerMove(e);
      const up = (e: PointerEvent) => onPointerUp(e);
      const cancel = (e: PointerEvent) => onPointerCancel(e);
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', cancel);
      el.addEventListener('lostpointercapture', cancel);
      // touch-action:none on sources only (plan §10): the page keeps scrolling elsewhere.
      el.style.touchAction = 'none';
      source.off = () => {
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', cancel);
        el.removeEventListener('lostpointercapture', cancel);
        if (press?.source === source) finish(false);
        sources.delete(source);
      };
      sources.add(source);
      return source.off;
    },
    registerZone(el, spec) {
      const click = () => { if (!press) emit('zonetap', { zone: spec.id }); };
      el.addEventListener('click', click);
      const zone: Zone = { el, spec, off: () => {} };
      zone.off = () => {
        el.removeEventListener('click', click);
        el.classList.remove(opts.overClass);
        zones.delete(zone);
      };
      zones.add(zone);
      return zone.off;
    },
    on(event, handler) {
      const set = handlers[event] as Set<(e: DragEvents[typeof event]) => void>;
      set.add(handler);
      return () => { set.delete(handler); };
    },
    cancel() { finish(false); },
    destroy() {
      finish(false);
      for (const s of Array.from(sources)) s.off();
      for (const z of Array.from(zones)) z.off();
      for (const k of Object.keys(handlers) as (keyof DragEvents)[]) handlers[k].clear();
      if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeyDown);
    },
  };

  if (typeof document !== 'undefined') document.addEventListener('keydown', onKeyDown);
  return controller;
}

let singleton: DragController | null = null;

/** App-wide controller, created on first use (never at import time: tests run in node). */
export function dragController(): DragController {
  if (!singleton) singleton = createDragController();
  return singleton;
}
