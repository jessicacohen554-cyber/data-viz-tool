/**
 * Event payloads `ChartCanvas` emits for the notes/annotation shard (T4):
 * a click on a mark (`onMarkClick`) and a dragged annotation (`onAnnotationDrag`).
 */

/** A click on a data mark. `x` is the category label, epoch ms or numeric x; `y` the value when the mark has one. */
export interface MarkClickEvent {
  x: string | number;
  y: number | null;
  /** Series name as the legend shows it (the color label, or the measure label). */
  seriesKey: string;
  /** Canvas pixel position of the pointer. */
  pixel: [number, number];
}

/** Props the canvas accepts for those events. */
export interface ChartEvents {
  onMarkClick?: (e: MarkClickEvent) => void;
  /** The annotation `id` and its new pixel offset from the anchor, after a drag ends. */
  onAnnotationDrag?: (id: string, offset: [number, number]) => void;
}
