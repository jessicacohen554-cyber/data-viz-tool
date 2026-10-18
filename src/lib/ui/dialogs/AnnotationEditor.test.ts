// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultSpec } from '../../core/spec-defaults';
import { spec } from '../../stores/spec.svelte';
import AnnotationEditor, { DEFAULT_OFFSET, OFFSET, describeAnchor, newAnnotation } from './AnnotationEditor.svelte';
import { byLabel, click, mountComponent, setValue, type Mounted } from './mount.test';

describe('AnnotationEditor helpers', () => {
  it('builds an annotation from an anchor with the default offset and only the anchor fields given', () => {
    const a = newAnnotation({ x: 'West', y: 42, seriesKey: 'gas' }, '  Peak ');
    expect(a).toMatchObject({ text: 'Peak', x: 'West', y: 42, seriesKey: 'gas', offset: DEFAULT_OFFSET });
    expect(a.offset).not.toBe(DEFAULT_OFFSET);
    const b = newAnnotation({ x: 1700000000000 }, 'Outage');
    expect('y' in b).toBe(false);
    expect('seriesKey' in b).toBe(false);
    expect(a.id).not.toBe(b.id);
  });

  it('describes an anchor', () => {
    expect(describeAnchor({ x: 'West', y: 42, seriesKey: 'gas' })).toBe('West · 42 · gas');
    expect(describeAnchor({ x: 3 })).toBe('3');
  });
});

describe('AnnotationEditor component', () => {
  let m: Mounted | null = null;
  let closed = 0;

  beforeEach(() => {
    spec.replace(createDefaultSpec('ds'), { history: false });
    closed = 0;
    return () => { m?.unmount(); m = null; };
  });

  const addButton = () => Array.from(m!.root.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Add') as HTMLButtonElement;

  it('with a pending anchor: Add is disabled until text exists, then writes the annotation and closes', () => {
    m = mountComponent(AnnotationEditor, { open: true, onclose: () => { closed += 1; }, pending: { x: 'West', y: 42 } });
    expect(m.root.querySelector('.dialog__title')!.textContent).toBe('Add annotation');
    expect(m.root.textContent).toContain('West · 42');
    expect(addButton().disabled).toBe(true);
    setValue(byLabel(m.root, 'Annotation text'), 'Record peak', 'input');
    expect(addButton().disabled).toBe(false);
    click(addButton());
    expect(spec.value.annotations).toHaveLength(1);
    expect(spec.value.annotations[0]).toMatchObject({ text: 'Record peak', x: 'West', y: 42, offset: DEFAULT_OFFSET });
    expect(closed).toBe(1);
  });

  it('stub-safe: no pending and no edit id is the list panel', () => {
    m = mountComponent(AnnotationEditor, { open: true, onclose: () => {}, pending: null });
    expect(m.root.querySelector('.dialog__title')!.textContent).toBe('Annotations');
    expect(m.root.textContent).toContain('Click a mark');
    expect(byLabel(m.root, 'Annotation text')).toBeUndefined();
  });

  it('editing: text saves on change, offsets clamp, delete removes; the list reopens another', () => {
    const a = newAnnotation({ x: 'West' }, 'One');
    const b = newAnnotation({ x: 'East' }, 'Two');
    spec.patch((d) => { d.annotations = [a, b]; });
    m = mountComponent(AnnotationEditor, { open: true, onclose: () => {}, pending: null, editId: a.id });
    expect(m.root.querySelector('.dialog__title')!.textContent).toBe('Edit annotation');
    expect((byLabel(m.root, 'Annotation text') as HTMLTextAreaElement).value).toBe('One');
    setValue(byLabel(m.root, 'Annotation text'), 'One!', 'input');
    setValue(byLabel(m.root, 'Annotation text'), 'One!', 'change');
    expect(spec.value.annotations[0]!.text).toBe('One!');
    setValue(byLabel(m.root, 'Offset x'), '900');
    setValue(byLabel(m.root, 'Offset y'), '-30');
    expect(spec.value.annotations[0]!.offset).toEqual([OFFSET.max, -30]);
    expect(m.root.querySelectorAll('[data-annotation]').length).toBe(2);
    click(m.root.querySelector(`[data-annotation="${b.id}"]`));
    expect((byLabel(m.root, 'Annotation text') as HTMLTextAreaElement).value).toBe('Two');
    click(Array.from(m.root.querySelectorAll('button')).find((x) => x.textContent?.trim() === 'Delete'));
    expect(spec.value.annotations.map((x) => x.id)).toEqual([a.id]);
    expect(m.root.querySelector('.dialog__title')!.textContent).toBe('Annotations');
  });

  it('a pending anchor plus an edit id edits (the click landed on an annotated mark)', () => {
    const a = newAnnotation({ x: 'West' }, 'One');
    spec.patch((d) => { d.annotations = [a]; });
    m = mountComponent(AnnotationEditor, { open: true, onclose: () => {}, pending: { x: 'West' }, editId: a.id });
    expect(m.root.querySelector('.dialog__title')!.textContent).toBe('Edit annotation');
  });
});
