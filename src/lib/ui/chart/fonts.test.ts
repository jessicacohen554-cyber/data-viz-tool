import { beforeEach, describe, expect, it } from 'vitest';
import { ensureFont, fontUrl, resetFonts } from './fonts';

/** The slice of `Document` `ensureFont` touches. */
function fakeDocument(): { doc: Document; links: Array<{ rel: string; href: string; dataset: Record<string, string> }> } {
  const links: Array<{ rel: string; href: string; dataset: Record<string, string> }> = [];
  const head = {
    querySelector: (sel: string) => { const id = /data-font-id="([^"]+)"/.exec(sel)?.[1]; return links.find((l) => l.dataset.fontId === id) ?? null; },
    appendChild: (el: unknown) => { links.push(el as (typeof links)[number]); return el; },
  };
  const doc = { head, createElement: () => ({ rel: '', href: '', dataset: {} as Record<string, string> }) } as unknown as Document;
  return { doc, links };
}

describe('ensureFont', () => {
  beforeEach(resetFonts);

  it('injects one Google Fonts link per family, once, and never for system stacks or unknown ids', () => {
    const { doc, links } = fakeDocument();
    expect(ensureFont('inter', doc)).toBe(true);
    expect(ensureFont('inter', doc)).toBe(false);
    expect(links).toHaveLength(1);
    expect(links[0]!.rel).toBe('stylesheet');
    expect(links[0]!.href).toBe(fontUrl('Inter:wght@400;500;600;700'));
    expect(links[0]!.dataset.fontId).toBe('inter');
    expect(ensureFont('inherit', doc)).toBe(false);
    expect(ensureFont('system', doc)).toBe(false);
    expect(ensureFont('georgia', doc)).toBe(false);
    expect(ensureFont('not-a-font', doc)).toBe(false);
    expect(ensureFont(undefined, doc)).toBe(false);
    expect(links).toHaveLength(1);
  });

  it('is a no-op without a document (node, SSR)', () => {
    expect(ensureFont('lato', undefined)).toBe(false);
  });
});
