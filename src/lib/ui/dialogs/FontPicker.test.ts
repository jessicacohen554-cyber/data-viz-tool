// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { FONT_FAMILIES } from '../../core/constants';
import FontPicker, { FONT_KINDS, FONT_LINK_ATTR, ensureFontsLoaded, familiesOf, fontCss, fontFamily, googleFontsUrl } from './FontPicker.svelte';
import { click, mountComponent, type Mounted } from './mount.test';

describe('FontPicker helpers', () => {
  it('resolves a family id, falling back to the app default', () => {
    expect(fontFamily('inter').label).toBe('Inter');
    expect(fontFamily('nope').id).toBe('inherit');
    expect(fontFamily(undefined).id).toBe('inherit');
    expect(fontCss('jetbrains-mono')).toContain('JetBrains Mono');
  });

  it('groups every family into exactly one kind, in constants order', () => {
    const all = FONT_KINDS.flatMap((k) => familiesOf(k.kind).map((f) => f.id));
    expect(all.sort()).toEqual(FONT_FAMILIES.map((f) => f.id).sort());
    expect(familiesOf('mono').map((f) => f.id)).toEqual(['jetbrains-mono', 'ibm-plex-mono']);
  });

  it('builds one Google Fonts URL covering every family with a google spec', () => {
    const url = googleFontsUrl();
    expect(url).not.toBeNull();
    expect(url).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=/);
    for (const f of FONT_FAMILIES) if (f.google) expect(url).toContain(`family=${f.google}`);
    expect(url).toContain('display=swap');
    expect(googleFontsUrl([fontFamily('system')])).toBeNull();
  });

  it('injects the stylesheet link once', () => {
    document.head.innerHTML = '';
    expect(ensureFontsLoaded()).toBe(true);
    expect(ensureFontsLoaded()).toBe(false);
    const links = document.head.querySelectorAll(`link[${FONT_LINK_ATTR}]`);
    expect(links.length).toBe(1);
    expect(links[0]!.getAttribute('rel')).toBe('stylesheet');
  });
});

describe('FontPicker component', () => {
  let m: Mounted | null = null;
  beforeEach(() => { document.head.innerHTML = ''; return () => { m?.unmount(); m = null; }; });

  it('renders every family as an option in its own face, marks the value selected, and reports a choice', () => {
    let chosen: string | null = null;
    m = mountComponent(FontPicker, { value: 'lato', onchange: (id: string) => { chosen = id; } });
    const options = m.root.querySelectorAll<HTMLElement>('[role="option"]');
    expect(options.length).toBe(FONT_FAMILIES.length);
    const lato = m.root.querySelector<HTMLElement>('[data-font="lato"]')!;
    expect(lato.getAttribute('aria-selected')).toBe('true');
    expect(lato.style.fontFamily).toContain('Lato');
    expect(m.root.querySelector('[data-font="inter"]')!.getAttribute('aria-selected')).toBe('false');
    click(m.root.querySelector('[data-font="merriweather"]'));
    expect(chosen).toBe('merriweather');
    click(lato);
    expect(chosen).toBe('merriweather');
    expect(document.head.querySelector(`link[${FONT_LINK_ATTR}]`)).not.toBeNull();
  });
});
