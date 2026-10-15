// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDragController, DROP_ITEM_ATTR, type DragController, type DragPayload, type DropEvent, type HoverEvent,
} from './drag-controller';

/** jsdom has no layout: give elements explicit rects. */
function rect(el: HTMLElement, left: number, top: number, width: number, height: number): void {
  el.getBoundingClientRect = () => ({
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return {}; },
  } as DOMRect);
}

/** jsdom lacks PointerEvent; a MouseEvent with the pointer fields is enough for the controller. */
function pointer(type: string, init: { x: number; y: number; id?: number; pointerType?: string; button?: number }): Event {
  const e = new MouseEvent(type, { bubbles: true, clientX: init.x, clientY: init.y, button: init.button ?? 0 });
  Object.defineProperty(e, 'pointerId', { value: init.id ?? 1 });
  Object.defineProperty(e, 'pointerType', { value: init.pointerType ?? 'mouse' });
  return e;
}

describe('drag controller', () => {
  let ctl: DragController;
  let pill: HTMLElement;
  let columns: HTMLElement;
  let rows: HTMLElement;
  const payload: DragPayload = { kind: 'field', field: 'zone' };

  beforeEach(() => {
    document.body.innerHTML = '';
    pill = document.createElement('div');
    pill.className = 'pill';
    columns = document.createElement('div');
    rows = document.createElement('div');
    document.body.append(pill, columns, rows);
    rect(pill, 0, 0, 80, 28);
    rect(columns, 100, 0, 300, 40);
    rect(rows, 100, 50, 300, 40);
    (pill as HTMLElement & { setPointerCapture: (id: number) => void }).setPointerCapture = vi.fn();
    (pill as HTMLElement & { releasePointerCapture: (id: number) => void }).releasePointerCapture = vi.fn();
    ctl = createDragController();
    ctl.registerSource(pill, () => payload);
    ctl.registerZone(columns, { id: 'columns' });
    ctl.registerZone(rows, { id: 'rows', orientation: 'vertical' });
  });

  afterEach(() => { ctl.destroy(); vi.useRealTimers(); });

  it('mouse: a move under 8px is not a drag, a release without drag is a tap', () => {
    const tap = vi.fn();
    const start = vi.fn();
    ctl.on('tap', tap);
    ctl.on('start', start);
    pill.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    pill.dispatchEvent(pointer('pointermove', { x: 14, y: 13 }));
    expect(start).not.toHaveBeenCalled();
    expect(ctl.active).toBeNull();
    pill.dispatchEvent(pointer('pointerup', { x: 14, y: 13 }));
    expect(tap).toHaveBeenCalledWith({ payload, element: pill });
    expect(start).not.toHaveBeenCalled();
  });

  it('mouse: 8px of movement starts the drag, captures the pointer and shows a ghost', () => {
    const start = vi.fn();
    ctl.on('start', start);
    pill.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    expect((pill as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture).toHaveBeenCalledWith(1);
    pill.dispatchEvent(pointer('pointermove', { x: 18, y: 10 }));
    expect(start).toHaveBeenCalledWith(payload);
    expect(ctl.active).toEqual(payload);
    expect(document.querySelector('.drag-ghost')).not.toBeNull();
    expect(pill.classList.contains('is-dragging')).toBe(true);
    expect(pill.style.touchAction).toBe('none');
    pill.dispatchEvent(pointer('pointerup', { x: 18, y: 10 }));
    expect(document.querySelector('.drag-ghost')).toBeNull();
    expect(pill.classList.contains('is-dragging')).toBe(false);
  });

  it('drops on the zone under the pointer with the index from item midpoints', () => {
    const a = document.createElement('span'); a.setAttribute(DROP_ITEM_ATTR, 'a'); rect(a, 110, 5, 80, 28);
    const b = document.createElement('span'); b.setAttribute(DROP_ITEM_ATTR, 'b'); rect(b, 200, 5, 80, 28);
    columns.append(a, b);
    const drops: DropEvent[] = [];
    const hovers: HoverEvent[] = [];
    ctl.on('drop', (e) => drops.push(e));
    ctl.on('hover', (e) => hovers.push(e));
    pill.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    pill.dispatchEvent(pointer('pointermove', { x: 30, y: 10 }));
    expect(hovers.at(-1)?.zone).toBeNull();
    pill.dispatchEvent(pointer('pointermove', { x: 120, y: 20 }));
    expect(hovers.at(-1)).toEqual({ payload, zone: 'columns', index: 0 });
    expect(columns.classList.contains('is-drop-over')).toBe(true);
    pill.dispatchEvent(pointer('pointermove', { x: 160, y: 20 }));
    expect(hovers.at(-1)?.index).toBe(1);
    pill.dispatchEvent(pointer('pointermove', { x: 300, y: 20 }));
    expect(hovers.at(-1)?.index).toBe(2);
    pill.dispatchEvent(pointer('pointerup', { x: 300, y: 20 }));
    expect(drops).toEqual([{ payload, zone: 'columns', index: 2 }]);
    expect(columns.classList.contains('is-drop-over')).toBe(false);
  });

  it('a release outside every zone drops nothing but still ends the drag', () => {
    const drop = vi.fn();
    const end = vi.fn();
    ctl.on('drop', drop);
    ctl.on('end', end);
    pill.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    pill.dispatchEvent(pointer('pointermove', { x: 120, y: 20 }));
    pill.dispatchEvent(pointer('pointermove', { x: 600, y: 600 }));
    pill.dispatchEvent(pointer('pointerup', { x: 600, y: 600 }));
    expect(drop).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledWith(payload);
    expect(ctl.active).toBeNull();
  });

  it('a zone that refuses the payload is skipped; vertical zones index by y', () => {
    ctl.registerZone(columns, { id: 'columns', accepts: () => false });
    const item = document.createElement('span'); item.setAttribute(DROP_ITEM_ATTR, 'x'); rect(item, 110, 55, 200, 20);
    rows.append(item);
    const drops: DropEvent[] = [];
    ctl.on('drop', (e) => drops.push(e));
    pill.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    pill.dispatchEvent(pointer('pointermove', { x: 120, y: 20 }));
    // columns is registered twice (once accepting, once refusing): the accepting one still wins.
    pill.dispatchEvent(pointer('pointermove', { x: 120, y: 80 }));
    pill.dispatchEvent(pointer('pointerup', { x: 120, y: 80 }));
    expect(drops).toEqual([{ payload, zone: 'rows', index: 1 }]);
  });

  it('the dragged pill is not counted as a slot in its own shelf', () => {
    const self = document.createElement('span'); self.setAttribute(DROP_ITEM_ATTR, 'p1'); rect(self, 110, 5, 80, 28);
    const other = document.createElement('span'); other.setAttribute(DROP_ITEM_ATTR, 'p2'); rect(other, 200, 5, 80, 28);
    columns.append(self, other);
    const pillPayload: DragPayload = { kind: 'pill', field: 'zone', pillId: 'p1', fromShelf: 'columns' };
    ctl.registerSource(self, () => pillPayload);
    (self as unknown as { setPointerCapture: unknown }).setPointerCapture = vi.fn();
    const drops: DropEvent[] = [];
    ctl.on('drop', (e) => drops.push(e));
    self.dispatchEvent(pointer('pointerdown', { x: 120, y: 10, id: 7 }));
    self.dispatchEvent(pointer('pointermove', { x: 300, y: 10, id: 7 }));
    self.dispatchEvent(pointer('pointerup', { x: 300, y: 10, id: 7 }));
    expect(drops).toEqual([{ payload: pillPayload, zone: 'columns', index: 1 }]);
  });

  it('touch: a 180ms hold starts the drag; an earlier move is a scroll; a quick lift is a tap', () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const tap = vi.fn();
    ctl.on('start', start);
    ctl.on('tap', tap);
    // Hold long enough.
    pill.dispatchEvent(pointer('pointerdown', { x: 10, y: 10, pointerType: 'touch' }));
    vi.advanceTimersByTime(179);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledTimes(1);
    pill.dispatchEvent(pointer('pointerup', { x: 10, y: 10, pointerType: 'touch' }));
    // Move before the hold completes: scrolling, no drag, no tap.
    pill.dispatchEvent(pointer('pointerdown', { x: 10, y: 10, pointerType: 'touch' }));
    vi.advanceTimersByTime(50);
    pill.dispatchEvent(pointer('pointermove', { x: 10, y: 40, pointerType: 'touch' }));
    vi.advanceTimersByTime(200);
    expect(start).toHaveBeenCalledTimes(1);
    pill.dispatchEvent(pointer('pointerup', { x: 10, y: 40, pointerType: 'touch' }));
    expect(tap).not.toHaveBeenCalled();
    // Quick lift: tap.
    pill.dispatchEvent(pointer('pointerdown', { x: 10, y: 10, pointerType: 'touch' }));
    vi.advanceTimersByTime(80);
    pill.dispatchEvent(pointer('pointerup', { x: 10, y: 10, pointerType: 'touch' }));
    expect(tap).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('Escape cancels an active drag without a drop', () => {
    const drop = vi.fn();
    const end = vi.fn();
    ctl.on('drop', drop);
    ctl.on('end', end);
    pill.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    pill.dispatchEvent(pointer('pointermove', { x: 120, y: 20 }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctl.active).toBeNull();
    expect(end).toHaveBeenCalledTimes(1);
    pill.dispatchEvent(pointer('pointerup', { x: 120, y: 20 }));
    expect(drop).not.toHaveBeenCalled();
  });

  it('a click on a zone with no drag in progress is a zone tap (tap-to-place)', () => {
    const zonetap = vi.fn();
    ctl.on('zonetap', zonetap);
    columns.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(zonetap).toHaveBeenCalledWith({ zone: 'columns' });
  });

  it('a press on a button inside the source does not start a drag', () => {
    const btn = document.createElement('button');
    pill.append(btn);
    const start = vi.fn();
    ctl.on('start', start);
    btn.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    pill.dispatchEvent(pointer('pointermove', { x: 120, y: 20 }));
    expect(start).not.toHaveBeenCalled();
  });

  it('unregistering a source mid-drag ends it cleanly', () => {
    const c2 = createDragController();
    const el = document.createElement('div');
    document.body.append(el);
    rect(el, 0, 100, 80, 28);
    const off = c2.registerSource(el, () => payload);
    el.dispatchEvent(pointer('pointerdown', { x: 10, y: 110 }));
    el.dispatchEvent(pointer('pointermove', { x: 120, y: 120 }));
    expect(c2.active).toEqual(payload);
    off();
    expect(c2.active).toBeNull();
    expect(document.querySelector('.drag-ghost')).toBeNull();
    c2.destroy();
  });
});
