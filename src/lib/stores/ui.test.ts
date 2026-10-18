import { afterEach, describe, expect, it } from 'vitest';
import { ui, type DialogState } from './ui.svelte';

describe('ui store dialog kinds (T4)', () => {
  afterEach(() => { ui.closeDialog(); });

  it('opens each v2 formatting dialog kind and closes back to null', () => {
    const kinds: DialogState[] = [
      { kind: 'style' },
      { kind: 'axis', which: 'x' },
      { kind: 'axis', which: 'y2' },
      { kind: 'reference' },
      { kind: 'trend' },
      { kind: 'annotation', target: null },
      { kind: 'annotation', target: { kind: 'edit', id: 'a1' } },
      { kind: 'annotation', target: { kind: 'pending', anchor: { x: 'West', y: 42, seriesKey: 'gas' } } },
    ];
    for (const k of kinds) {
      ui.openDialog(k);
      expect(ui.dialog).toEqual(k);
    }
    ui.closeDialog();
    expect(ui.dialog).toBeNull();
  });

  it('opening a dialog replaces the open one (one home for dialog state)', () => {
    ui.openDialog({ kind: 'style' });
    ui.openDialog({ kind: 'axis', which: 'y' });
    expect(ui.dialog).toEqual({ kind: 'axis', which: 'y' });
    ui.dialog = null;
    expect(ui.dialog).toBeNull();
  });
});
