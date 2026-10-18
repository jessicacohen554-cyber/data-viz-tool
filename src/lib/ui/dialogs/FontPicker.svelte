<script lang="ts" module>
  import { FONT_FAMILIES, type FontFamily } from '$core/constants';

  /** Group order and headings for the picker. */
  export const FONT_KINDS: ReadonlyArray<{ kind: FontFamily['kind']; label: string }> = [
    { kind: 'sans', label: 'Sans-serif' },
    { kind: 'serif', label: 'Serif' },
    { kind: 'mono', label: 'Monospace' },
  ];

  /** Google Fonts CSS endpoint (owner ruling D-14: curated list, loaded on demand). */
  export const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2';

  /** `data-` attribute on the injected `<link>` so repeated opens never add a second one. */
  export const FONT_LINK_ATTR = 'data-viz-fonts';

  /** The family with this id, else the app default (`inherit`). */
  export function fontFamily(id: string | undefined): FontFamily {
    return FONT_FAMILIES.find((f) => f.id === id) ?? FONT_FAMILIES[0]!;
  }

  /** CSS `font-family` stack for a family id (system fallback included, so offline renders). */
  export function fontCss(id: string | undefined): string {
    return fontFamily(id).css;
  }

  /** Families of one kind, in `FONT_FAMILIES` order. */
  export function familiesOf(kind: FontFamily['kind']): FontFamily[] {
    return FONT_FAMILIES.filter((f) => f.kind === kind);
  }

  /** The Google Fonts stylesheet URL covering every family that has a `google` spec, or null when none does. */
  export function googleFontsUrl(families: readonly FontFamily[] = FONT_FAMILIES): string | null {
    const specs = families.flatMap((f) => (f.google ? [f.google] : []));
    if (!specs.length) return null;
    return `${GOOGLE_FONTS_CSS}?${specs.map((s) => `family=${s}`).join('&')}&display=swap`;
  }

  /**
   * Inject the Google Fonts `<link>` once (T4 seam: T2's `fonts.ts` loader is
   * absent at this SHA, so the picker loads the faces itself; a shared loader
   * replaces this call). Returns true when a link was added.
   */
  export function ensureFontsLoaded(doc: Document = document): boolean {
    if (doc.head.querySelector(`link[${FONT_LINK_ATTR}]`)) return false;
    const href = googleFontsUrl();
    if (!href) return false;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(FONT_LINK_ATTR, '');
    doc.head.appendChild(link);
    return true;
  }
</script>

<script lang="ts">
  /**
   * Font family picker (T4, D-14): the `FONT_FAMILIES` list grouped
   * sans / serif / mono as a listbox, each option rendered in its own face
   * once the Google Fonts stylesheet has loaded (system fallback until then
   * and offline). Controlled: `value` is the family id, `onchange` receives
   * the new id; the caller writes it to the spec (R-SPEC). Tokens only
   * (R-TOKENS); the per-option `font-family` is the feature, from constants.
   */
  interface Props {
    value: string;
    onchange: (id: string) => void;
    /** Accessible name of the listbox. */
    label?: string;
  }

  let { value, onchange, label = 'Font family' }: Props = $props();

  const groups = $derived(FONT_KINDS.map((g) => ({ ...g, families: familiesOf(g.kind) })).filter((g) => g.families.length));

  $effect(() => { ensureFontsLoaded(); });

  function onkeydown(e: KeyboardEvent): void {
    const options = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="option"]'));
    const i = options.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % options.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else return;
    e.preventDefault();
    options[next]?.focus();
  }
</script>

<div class="fonts" role="listbox" aria-label={label} tabindex="-1" onkeydown={onkeydown}>
  {#each groups as g (g.kind)}
    <div class="fonts__group">
      <div class="eyebrow fonts__head">{g.label}</div>
      {#each g.families as f (f.id)}
        {@const active = f.id === value}
        <button
          type="button"
          role="option"
          class="fonts__option"
          class:fonts__option--active={active}
          aria-selected={active}
          data-font={f.id}
          tabindex={active ? 0 : -1}
          style:font-family={f.css}
          onclick={() => { if (!active) onchange(f.id); }}
        >
          <span class="fonts__name">{f.label}</span>
          <span class="fonts__sample" aria-hidden="true">Aa 0123</span>
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .fonts { display: flex; flex-direction: column; gap: var(--space-sm); outline: none; }
  .fonts__group { display: flex; flex-direction: column; gap: 2px; }
  .fonts__head { padding: var(--space-xs) 0; }
  .fonts__option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    width: 100%;
    min-height: var(--touch-target);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-secondary);
    text-align: left;
    font-size: 0.9rem;
  }
  .fonts__option:hover { background: var(--bg-page); }
  .fonts__option--active { border-color: var(--hydro); box-shadow: 0 0 0 1px var(--hydro); color: var(--text-primary); }
  .fonts__sample { color: var(--text-muted); font-size: 0.82rem; }
</style>
