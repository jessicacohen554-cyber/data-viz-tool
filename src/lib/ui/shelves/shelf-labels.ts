/**
 * Display names and Marks-card icons per shelf (docs/TABLEAU-SPEC.md §5).
 * Shared by Shelf, MarksCard, PillMenu ("Move to") and the field menu ("Add to").
 */
import type { ShelfId } from '../../core/types';
import type { IconName } from '../shared/Icon.svelte';

/** Tableau's shelf names. */
export const SHELF_LABEL: Record<ShelfId, string> = {
  columns: 'Columns', rows: 'Rows', filters: 'Filters',
  color: 'Color', size: 'Size', label: 'Label', detail: 'Detail', tooltip: 'Tooltip', shape: 'Shape',
};

/** Icon per Marks-card channel (main shelves have none). */
export const SHELF_ICON: Partial<Record<ShelfId, IconName>> = {
  filters: 'filter', color: 'color', size: 'size', label: 'label', detail: 'detail', tooltip: 'tooltip', shape: 'shape',
};
