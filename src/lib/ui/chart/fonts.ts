/**
 * On-demand web fonts for the style panel (D-14): `ensureFont(id)` appends
 * one Google Fonts `<link>` per `FONT_FAMILIES` entry the first time it is
 * asked for, and is a no-op for ids without a `google` spec (system stacks,
 * `inherit`) or unknown ids. Lives under `lib/ui` because it touches the
 * document (rule R-PURE keeps `lib/charts` DOM-free).
 */
import { FONT_FAMILIES } from '$core/constants';

const requested = new Set<string>();

/** Google Fonts CSS URL for a family spec such as `Inter:wght@400;500`. */
export function fontUrl(google: string): string {
  return `https://fonts.googleapis.com/css2?family=${google}&display=swap`;
}

/** Inject the stylesheet link for a family id once; returns true when a link was added. */
export function ensureFont(id: string | undefined, doc: Document | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  if (!id || !doc) return false;
  const family = FONT_FAMILIES.find((f) => f.id === id);
  if (!family?.google || requested.has(id)) return false;
  requested.add(id);
  if (doc.head.querySelector(`link[data-font-id="${id}"]`)) return false;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = fontUrl(family.google);
  link.dataset.fontId = id;
  doc.head.appendChild(link);
  return true;
}

/** Forget which fonts were requested (tests). */
export function resetFonts(): void {
  requested.clear();
}
