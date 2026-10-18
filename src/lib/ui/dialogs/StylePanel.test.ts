// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultSpec, defaultMarks, defaultStyle } from '../../core/spec-defaults';
import { spec } from '../../stores/spec.svelte';
import { ui } from '../../stores/ui.svelte';
import StylePanel, { TRANSPARENT, backgroundSwatches, clampNumber, isDefaultChrome, isHex, setText } from './StylePanel.svelte';
import { byLabel, click, mountComponent, setChecked, setValue, type Mounted } from '../shared/svelte-mount.test';

describe('StylePanel helpers', () => {
  it('validates hex and clamps numbers to a step', () => {
    expect(isHex('#fff')).toBe(true);
    expect(isHex('#A1B2C3')).toBe(true);
    expect(isHex('fff')).toBe(false);
    expect(isHex('#ggg')).toBe(false);
    expect(clampNumber('7', 6, 72)).toBe(7);
    expect(clampNumber('200', 6, 72)).toBe(72);
    expect(clampNumber('x', 6, 72)).toBeNull();
    expect(clampNumber(1.23, 0.5, 2, 0.05)).toBe(1.25);
  });

  it('background swatches: transparent first, then the encoding hues without repeats', () => {
    expect(backgroundSwatches({ kind: 'none', color: '#0EA5E9' })).toEqual([TRANSPARENT, '#0EA5E9']);
    expect(backgroundSwatches({ kind: 'categorical', paletteId: 'p', domain: ['a', 'b', 'c'], map: { a: '#111111', b: '#222222', c: '#111111' } })).toEqual([TRANSPARENT, '#111111', '#222222']);
    expect(backgroundSwatches({ kind: 'continuous', paletteId: 'p', domain: [0, 1], stops: ['#000000', '#ffffff'] })).toEqual([TRANSPARENT, '#000000', '#ffffff']);
  });

  it('setText trims and removes the key when empty', () => {
    const t: { text?: string } = {};
    setText(t, '  Hello ');
    expect(t.text).toBe('Hello');
    setText(t, '   ');
    expect('text' in t).toBe(false);
  });

  it('isDefaultChrome compares style, legend, opacity and labels only', () => {
    const s = createDefaultSpec('d');
    const defaults = { style: defaultStyle(), legend: { show: true, position: 'right' as const }, marks: defaultMarks() };
    expect(isDefaultChrome(s, defaults)).toBe(true);
    s.marks.lineWidth = 4;
    expect(isDefaultChrome(s, defaults)).toBe(true);
    s.legend.position = 'top';
    expect(isDefaultChrome(s, defaults)).toBe(false);
  });
});

describe('StylePanel component', () => {
  let m: Mounted | null = null;
  let closed = 0;

  beforeEach(() => {
    spec.replace(createDefaultSpec('ds'), { history: false });
    closed = 0;
    m = mountComponent(StylePanel, { open: true, onclose: () => { closed += 1; } });
    return () => { m?.unmount(); m = null; };
  });

  it('is a right-side panel on desktop with a close button', () => {
    expect(ui.isMobile).toBe(false);
    expect(m!.root.querySelector('aside.style-panel')).not.toBeNull();
    expect(m!.root.querySelector('[role="dialog"]')).toBeNull();
    click(m!.root.querySelector('.style-panel__close'));
    expect(closed).toBe(1);
  });

  it('font scale and per-element sizes round-trip to style', () => {
    setValue(byLabel(m!.root, 'Font scale'), '1.5');
    expect(spec.value.style.fontScale).toBe(1.5);
    setValue(m!.root.querySelector('[data-size="title"]'), '24');
    setValue(m!.root.querySelector('[data-size="axis-title"]'), '9');
    setValue(m!.root.querySelector('[data-size="legend"]'), '999');
    expect(spec.value.style.title.size).toBe(24);
    expect(spec.value.style.axis.titleSize).toBe(9);
    expect(spec.value.style.legend.size).toBe(72);
    expect(m!.root.querySelector<HTMLInputElement>('[data-size="title"]')!.value).toBe('24');
  });

  it('font family is chosen through the picker and shown on the toggle', () => {
    const toggle = m!.root.querySelector<HTMLElement>('.style__font')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    click(toggle);
    click(m!.root.querySelector('[data-font="lora"]'));
    expect(spec.value.style.fontFamily).toBe('lora');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('Lora');
  });

  it('title text, weight, align, subtitle and caption write style.* and clear when emptied', () => {
    setValue(byLabel(m!.root, 'Chart title'), '  Price by zone ');
    expect(spec.value.style.title.text).toBe('Price by zone');
    setValue(byLabel(m!.root, 'Title weight'), '500');
    expect(spec.value.style.title.weight).toBe(500);
    click(m!.root.querySelector('[data-align="center"]'));
    expect(spec.value.style.title.align).toBe('center');
    expect(m!.root.querySelector('[data-align="center"]')!.getAttribute('aria-checked')).toBe('true');
    setValue(byLabel(m!.root, 'Chart subtitle'), 'ERCOT 2024');
    setValue(byLabel(m!.root, 'Chart caption'), 'Source: ERCOT');
    expect(spec.value.style.subtitle.text).toBe('ERCOT 2024');
    expect(spec.value.style.caption.text).toBe('Source: ERCOT');
    setValue(byLabel(m!.root, 'Chart title'), '');
    expect('text' in spec.value.style.title).toBe(false);
  });

  it('background: swatch, hex field and transparent; invalid hex is ignored', () => {
    const swatches = m!.root.querySelectorAll<HTMLElement>('[data-swatch]');
    expect(swatches[0]!.dataset.swatch).toBe(TRANSPARENT);
    expect(swatches.length).toBeGreaterThan(1);
    click(swatches[1]);
    expect(spec.value.style.background).toBe(swatches[1]!.dataset.swatch!.toLowerCase());
    setValue(byLabel(m!.root, 'Background hex'), '#ABCDEF');
    expect(spec.value.style.background).toBe('#abcdef');
    setValue(byLabel(m!.root, 'Background hex'), 'blue');
    expect(spec.value.style.background).toBe('#abcdef');
    click(swatches[0]);
    expect(spec.value.style.background).toBe(TRANSPARENT);
    expect(swatches[0]!.getAttribute('aria-checked')).toBe('true');
  });

  it('border, padding, legend, mark labels and opacity round-trip', () => {
    setChecked(byLabel(m!.root, 'Border'), true);
    expect(spec.value.style.border).toBe(true);
    setValue(byLabel(m!.root, 'Padding'), '32');
    expect(spec.value.style.padding).toBe(32);
    click(m!.root.querySelector('[data-legend="bottom"]'));
    expect(spec.value.legend.position).toBe('bottom');
    setChecked(byLabel(m!.root, 'Show legend'), false);
    expect(spec.value.legend.show).toBe(false);
    expect(m!.root.querySelector<HTMLButtonElement>('[data-legend="top"]')!.disabled).toBe(true);
    setChecked(byLabel(m!.root, 'Show mark labels'), true);
    expect(spec.value.marks.labels.show).toBe(true);
    setValue(byLabel(m!.root, 'Label position'), 'outside');
    expect(spec.value.marks.labels.position).toBe('outside');
    setValue(byLabel(m!.root, 'Mark opacity'), '0.6');
    expect(spec.value.marks.opacity).toBe(0.6);
  });

  it('reset restores the defaults and is disabled while pristine; each change is one undo step', () => {
    const reset = Array.from(m!.root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === 'Reset to defaults')!;
    expect(reset.disabled).toBe(true);
    setValue(byLabel(m!.root, 'Padding'), '4');
    setChecked(byLabel(m!.root, 'Border'), true);
    expect(reset.disabled).toBe(false);
    click(reset);
    expect(spec.value.style).toEqual(defaultStyle());
    expect(spec.value.legend).toEqual({ show: true, position: 'right' });
    spec.undo();
    expect(spec.value.style.border).toBe(true);
    expect(spec.value.style.padding).toBe(4);
    spec.undo();
    expect(spec.value.style.border).toBe(false);
  });
});

describe('StylePanel on a phone', () => {
  it('renders as a bottom sheet dialog', () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    const stop = ui.observeViewport();
    try {
      expect(ui.isMobile).toBe(true);
      spec.replace(createDefaultSpec('ds'), { history: false });
      const m = mountComponent(StylePanel, { open: true, onclose: () => {} });
      expect(m.root.querySelector('aside.style-panel')).toBeNull();
      expect(m.root.querySelector('.dialog--sheet')).not.toBeNull();
      expect(byLabel(m.root, 'Font scale')).not.toBeUndefined();
      m.unmount();
    } finally {
      stop();
      window.matchMedia = original;
    }
  });
});
