<script lang="ts" module>
  import type { LegendSpec, MarkSettings, StyleSpec, VizSpec } from '$core/types';
  import type { ColorEncoding } from '$palette/pick';

  /** `StyleSpec.fontScale` slider bounds. */
  export const FONT_SCALE = { min: 0.5, max: 2, step: 0.05 } as const;
  /** Per-element font size bounds (px). */
  export const FONT_SIZE = { min: 6, max: 72 } as const;
  /** `StyleSpec.padding` bounds (px). */
  export const PADDING = { min: 0, max: 96 } as const;
  /** Title weights the contract allows. */
  export const TITLE_WEIGHTS: readonly StyleSpec['title']['weight'][] = [400, 500, 600, 700, 800];
  /** Legend positions in menu order. */
  export const LEGEND_POSITIONS: readonly LegendSpec['position'][] = ['right', 'bottom', 'top'];
  /** Mark label positions in menu order. */
  export const LABEL_POSITIONS: readonly MarkSettings['labels']['position'][] = ['auto', 'inside', 'outside', 'top'];
  /** The `background` value that lets the card show through. */
  export const TRANSPARENT = 'transparent';

  /** The per-element size fields of `StyleSpec`, with their labels. */
  export const SIZE_FIELDS: ReadonlyArray<{ id: string; label: string; get: (s: StyleSpec) => number; set: (s: StyleSpec, v: number) => void }> = [
    { id: 'title', label: 'Title', get: (s) => s.title.size, set: (s, v) => { s.title.size = v; } },
    { id: 'subtitle', label: 'Subtitle', get: (s) => s.subtitle.size, set: (s, v) => { s.subtitle.size = v; } },
    { id: 'caption', label: 'Caption', get: (s) => s.caption.size, set: (s, v) => { s.caption.size = v; } },
    { id: 'axis', label: 'Axis ticks', get: (s) => s.axis.size, set: (s, v) => { s.axis.size = v; } },
    { id: 'axis-title', label: 'Axis titles', get: (s) => s.axis.titleSize, set: (s, v) => { s.axis.titleSize = v; } },
    { id: 'labels', label: 'Mark labels', get: (s) => s.labels.size, set: (s, v) => { s.labels.size = v; } },
    { id: 'legend', label: 'Legend', get: (s) => s.legend.size, set: (s, v) => { s.legend.size = v; } },
  ];

  /** `#rgb` / `#rrggbb` (case-insensitive). */
  export function isHex(s: string): boolean {
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s);
  }

  /** Clamp a numeric input to `[min, max]`, rounding to `step`; null when not a number. */
  export function clampNumber(raw: string | number, min: number, max: number, step = 1): number | null {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    const snapped = Math.round(n / step) * step;
    return Math.max(min, Math.min(max, Number(snapped.toFixed(6))));
  }

  /**
   * Background swatches: `transparent` first, then the distinct colors of the
   * current color encoding (categorical map or continuous stops), then the
   * single mark color when nothing is on Color.
   */
  export function backgroundSwatches(encoding: ColorEncoding): string[] {
    const out: string[] = [TRANSPARENT];
    const push = (c: string) => { if (!out.includes(c)) out.push(c); };
    if (encoding.kind === 'categorical') Object.values(encoding.map).forEach(push);
    else if (encoding.kind === 'continuous') encoding.stops.forEach(push);
    else push(encoding.color);
    return out;
  }

  /** Write a text override: trimmed text, or removed when empty (so a stored spec carries only what the user set). */
  export function setText(target: { text?: string }, raw: string): void {
    const t = raw.trim();
    if (t) target.text = t; else delete target.text;
  }

  /** True when the style, legend and label settings equal the factory defaults. */
  export function isDefaultChrome(spec: VizSpec, defaults: { style: StyleSpec; legend: LegendSpec; marks: MarkSettings }): boolean {
    return JSON.stringify(spec.style) === JSON.stringify(defaults.style)
      && JSON.stringify(spec.legend) === JSON.stringify(defaults.legend)
      && spec.marks.opacity === defaults.marks.opacity
      && JSON.stringify(spec.marks.labels) === JSON.stringify(defaults.marks.labels);
  }
</script>

<script lang="ts">
  /**
   * Style panel (T4, D-16): Tableau's Format pane. A right-side panel on
   * desktop (non-modal, the chart stays live) and a bottom sheet on phones
   * (through `Dialog`, D-11). Font family (FontPicker), font scale, per-element
   * sizes, title / subtitle / caption text, background, border, padding,
   * legend, mark labels and opacity. Every control writes the spec through
   * `spec.patch` at once (R-SPEC; one undo step per committed change — text
   * and sliders commit on change, not per keystroke). Tokens only (R-TOKENS).
   * `open` + `onclose` like the S5 dialogs; App.svelte hosts it (T6).
   */
  import { defaultMarks, defaultStyle } from '$core/spec-defaults';
  import { pickPalette } from '$palette/pick';
  import { spec } from '$stores/spec.svelte';
  import { dataset } from '$stores/dataset.svelte';
  import { query } from '$stores/query.svelte';
  import { ui } from '$stores/ui.svelte';
  import Dialog from './Dialog.svelte';
  import FontPicker, { fontFamily } from './FontPicker.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  const style = $derived(spec.value.style);
  const legend = $derived(spec.value.legend);
  const marks = $derived(spec.value.marks);
  const colorPill = $derived(spec.value.shelves.color[0]);
  const colorMeta = $derived(colorPill ? dataset.meta.find((m) => m.name === colorPill.field) : undefined);
  const swatches = $derived(backgroundSwatches(pickPalette(colorPill, colorMeta, spec.value.palette, query.result, spec.value.chartType)));
  const defaults = { style: defaultStyle(), legend: { show: true, position: 'right' as const }, marks: defaultMarks() };
  const pristine = $derived(isDefaultChrome(spec.value, defaults));

  /** Slider values shown while dragging (committed on change). */
  let scalePreview = $state<number | null>(null);
  let opacityPreview = $state<number | null>(null);
  let fontsOpen = $state(false);

  function patchStyle(fn: (s: StyleSpec) => void): void {
    spec.patch((d) => fn(d.style));
  }

  function setSize(field: (typeof SIZE_FIELDS)[number], raw: string): void {
    const v = clampNumber(raw, FONT_SIZE.min, FONT_SIZE.max);
    if (v !== null && v !== field.get(style)) patchStyle((s) => field.set(s, v));
  }

  function setScale(raw: string): void {
    scalePreview = null;
    const v = clampNumber(raw, FONT_SCALE.min, FONT_SCALE.max, FONT_SCALE.step);
    if (v !== null && v !== style.fontScale) patchStyle((s) => { s.fontScale = v; });
  }

  function setOpacity(raw: string): void {
    opacityPreview = null;
    const v = clampNumber(raw, 0, 1, 0.05);
    if (v !== null && v !== marks.opacity) spec.patch((d) => { d.marks.opacity = v; });
  }

  function setBackground(value: string): void {
    const v = value.trim().toLowerCase();
    if (v !== TRANSPARENT && !isHex(v)) return;
    if (v !== style.background) patchStyle((s) => { s.background = v; });
  }

  function setPadding(raw: string): void {
    const v = clampNumber(raw, PADDING.min, PADDING.max);
    if (v !== null && v !== style.padding) patchStyle((s) => { s.padding = v; });
  }

  function reset(): void {
    spec.patch((d) => {
      d.style = defaultStyle();
      d.legend = { show: true, position: 'right' };
      d.marks.opacity = defaults.marks.opacity;
      d.marks.labels = { ...defaults.marks.labels };
    });
  }
</script>

{#snippet body()}
  <div class="style">
    <section class="style__section" aria-label="Font">
      <h3 class="eyebrow">Font</h3>
      <button type="button" class="style__font btn" aria-expanded={fontsOpen} aria-controls="style-fonts" onclick={() => { fontsOpen = !fontsOpen; }}>
        <span>Family</span>
        <strong style:font-family={fontFamily(style.fontFamily).css}>{fontFamily(style.fontFamily).label}</strong>
      </button>
      {#if fontsOpen}
        <div id="style-fonts" class="style__fonts">
          <FontPicker value={style.fontFamily} onchange={(id) => { patchStyle((s) => { s.fontFamily = id; }); fontsOpen = false; }} />
        </div>
      {/if}
      <label class="style__row style__row--slider">
        <span>Scale <span class="num">{(scalePreview ?? style.fontScale).toFixed(2)}×</span></span>
        <input type="range" min={FONT_SCALE.min} max={FONT_SCALE.max} step={FONT_SCALE.step} value={style.fontScale}
          aria-label="Font scale"
          oninput={(e) => { scalePreview = Number(e.currentTarget.value); }}
          onchange={(e) => setScale(e.currentTarget.value)} />
      </label>
      <div class="style__grid">
        {#each SIZE_FIELDS as f (f.id)}
          <label class="style__row">
            <span>{f.label}</span>
            <input type="number" class="num" min={FONT_SIZE.min} max={FONT_SIZE.max} step="1" value={f.get(style)} data-size={f.id}
              onchange={(e) => setSize(f, e.currentTarget.value)} />
          </label>
        {/each}
      </div>
    </section>

    <section class="style__section" aria-label="Text">
      <h3 class="eyebrow">Text</h3>
      <label class="style__row">
        <span>Title</span>
        <input type="text" value={style.title.text ?? ''} placeholder={spec.value.title || 'Worksheet title'} aria-label="Chart title"
          onchange={(e) => patchStyle((s) => setText(s.title, e.currentTarget.value))} />
      </label>
      <div class="style__inline">
        <label class="style__row">
          <span>Weight</span>
          <select value={String(style.title.weight)} aria-label="Title weight" onchange={(e) => patchStyle((s) => { s.title.weight = Number(e.currentTarget.value) as StyleSpec['title']['weight']; })}>
            {#each TITLE_WEIGHTS as w (w)}<option value={String(w)}>{w}</option>{/each}
          </select>
        </label>
        <div class="style__row">
          <span>Align</span>
          <div class="seg-ctrl" role="radiogroup" aria-label="Title alignment">
            {#each ['left', 'center'] as const as a (a)}
              <button type="button" role="radio" class:active={style.title.align === a} aria-checked={style.title.align === a} data-align={a}
                onclick={() => { if (style.title.align !== a) patchStyle((s) => { s.title.align = a; }); }}>{a}</button>
            {/each}
          </div>
        </div>
      </div>
      <label class="style__row">
        <span>Subtitle</span>
        <input type="text" value={style.subtitle.text ?? ''} placeholder={spec.value.subtitle ?? ''} aria-label="Chart subtitle"
          onchange={(e) => patchStyle((s) => setText(s.subtitle, e.currentTarget.value))} />
      </label>
      <label class="style__row">
        <span>Caption</span>
        <input type="text" value={style.caption.text ?? ''} placeholder="Source, note…" aria-label="Chart caption"
          onchange={(e) => patchStyle((s) => setText(s.caption, e.currentTarget.value))} />
      </label>
    </section>

    <section class="style__section" aria-label="Background and frame">
      <h3 class="eyebrow">Background</h3>
      <div class="style__swatches" role="radiogroup" aria-label="Background color">
        {#each swatches as c (c)}
          {@const active = style.background === c}
          <button type="button" role="radio" class="style__swatch" class:style__swatch--active={active} class:style__swatch--none={c === TRANSPARENT}
            aria-checked={active} aria-label={c === TRANSPARENT ? 'Transparent' : c} data-swatch={c}
            style:background={c === TRANSPARENT ? undefined : c} onclick={() => setBackground(c)}></button>
        {/each}
      </div>
      <div class="style__inline">
        <label class="style__row">
          <span>Custom</span>
          <input type="color" aria-label="Custom background" value={isHex(style.background) ? style.background : '#ffffff'} onchange={(e) => setBackground(e.currentTarget.value)} />
        </label>
        <label class="style__row style__row--grow">
          <span>Hex</span>
          <input type="text" class="mono" aria-label="Background hex" value={style.background} placeholder="#ffffff or transparent"
            onchange={(e) => setBackground(e.currentTarget.value)} />
        </label>
      </div>
      <div class="style__inline">
        <label class="style__row style__row--check">
          <input type="checkbox" checked={style.border} aria-label="Border" onchange={(e) => patchStyle((s) => { s.border = e.currentTarget.checked; })} />
          <span>Border</span>
        </label>
        <label class="style__row">
          <span>Padding</span>
          <input type="number" class="num" min={PADDING.min} max={PADDING.max} step="1" value={style.padding} aria-label="Padding"
            onchange={(e) => setPadding(e.currentTarget.value)} />
        </label>
      </div>
    </section>

    <section class="style__section" aria-label="Legend">
      <h3 class="eyebrow">Legend</h3>
      <div class="style__inline">
        <label class="style__row style__row--check">
          <input type="checkbox" checked={legend.show} aria-label="Show legend" onchange={(e) => spec.patch((d) => { d.legend.show = e.currentTarget.checked; })} />
          <span>Show</span>
        </label>
        <div class="style__row">
          <span>Position</span>
          <div class="seg-ctrl" role="radiogroup" aria-label="Legend position">
            {#each LEGEND_POSITIONS as p (p)}
              <button type="button" role="radio" class:active={legend.position === p} aria-checked={legend.position === p} data-legend={p}
                disabled={!legend.show} onclick={() => { if (legend.position !== p) spec.patch((d) => { d.legend.position = p; }); }}>{p}</button>
            {/each}
          </div>
        </div>
      </div>
    </section>

    <section class="style__section" aria-label="Marks">
      <h3 class="eyebrow">Marks</h3>
      <div class="style__inline">
        <label class="style__row style__row--check">
          <input type="checkbox" checked={marks.labels.show} aria-label="Show mark labels" onchange={(e) => spec.patch((d) => { d.marks.labels.show = e.currentTarget.checked; })} />
          <span>Labels</span>
        </label>
        <label class="style__row">
          <span>Position</span>
          <select value={marks.labels.position} aria-label="Label position" disabled={!marks.labels.show}
            onchange={(e) => spec.patch((d) => { d.marks.labels.position = e.currentTarget.value as MarkSettings['labels']['position']; })}>
            {#each LABEL_POSITIONS as p (p)}<option value={p}>{p}</option>{/each}
          </select>
        </label>
      </div>
      <label class="style__row style__row--slider">
        <span>Opacity <span class="num">{Math.round((opacityPreview ?? marks.opacity) * 100)}%</span></span>
        <input type="range" min="0" max="1" step="0.05" value={marks.opacity} aria-label="Mark opacity"
          oninput={(e) => { opacityPreview = Number(e.currentTarget.value); }}
          onchange={(e) => setOpacity(e.currentTarget.value)} />
      </label>
    </section>

    <div class="style__foot">
      <button type="button" class="btn" onclick={reset} disabled={pristine}>Reset to defaults</button>
    </div>
  </div>
{/snippet}

{#if ui.isMobile}
  <Dialog {open} {onclose} title="Format" width="md">
    {@render body()}
  </Dialog>
{:else if open}
  <aside class="style-panel card" aria-label="Format">
    <header class="style-panel__head">
      <h2 class="style-panel__title">Format</h2>
      <button type="button" class="style-panel__close" aria-label="Close" onclick={onclose}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
      </button>
    </header>
    <div class="style-panel__body">
      {@render body()}
    </div>
  </aside>
{/if}

<style>
  .style-panel {
    position: fixed;
    top: calc(var(--nav-height) + var(--space-md));
    right: var(--space-md);
    bottom: var(--space-md);
    z-index: 30;
    display: flex;
    flex-direction: column;
    width: var(--sidebar-width);
    box-shadow: var(--shadow-lg);
  }
  .style-panel__head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-md) var(--space-sm);
    border-bottom: 1px solid var(--border-light);
  }
  .style-panel__title { flex: 1; font-size: 1rem; }
  .style-panel__close {
    display: grid;
    place-items: center;
    width: var(--touch-target);
    height: var(--touch-target);
    margin: calc(-1 * var(--space-sm));
    border-radius: var(--radius-sm);
    color: var(--text-muted);
  }
  .style-panel__close:hover { background: var(--bg-page); color: var(--text-primary); }
  .style-panel__body { flex: 1; min-height: 0; overflow: auto; padding: var(--space-md); }

  .style { display: flex; flex-direction: column; gap: var(--space-md); font-size: 0.82rem; }
  .style__section { display: flex; flex-direction: column; gap: var(--space-sm); }
  .style__font { width: 100%; justify-content: space-between; min-height: var(--touch-target); }
  .style__fonts { max-height: 40dvh; overflow: auto; padding: var(--space-xs); border: 1px solid var(--border-light); border-radius: var(--radius-md); }
  .style__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr)); gap: var(--space-xs) var(--space-sm); }
  .style__inline { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-sm) var(--space-md); }
  .style__row { display: flex; flex-direction: column; gap: var(--space-xs); min-width: 0; }
  .style__row > span { color: var(--text-muted); font-weight: 600; }
  .style__row--grow { flex: 1; }
  .style__row--slider > span { display: flex; justify-content: space-between; }
  .style__row--check { flex-direction: row; align-items: center; gap: var(--space-sm); min-height: var(--touch-target); }
  .style__row--check > span { color: var(--text-secondary); font-weight: 500; }
  input[type='text'], input[type='number'], select {
    min-height: var(--touch-target);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    width: 100%;
  }
  input[type='number'] { width: 5.5rem; }
  input[type='range'] { width: 100%; min-height: var(--touch-target); accent-color: var(--hydro); }
  input[type='checkbox'] { width: var(--space-md); height: var(--space-md); accent-color: var(--hydro); }
  input[type='color'] { width: var(--touch-target); height: var(--touch-target); padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: none; }
  .seg-ctrl button { min-height: var(--space-xl); text-transform: capitalize; }
  .seg-ctrl button:disabled { opacity: 0.45; cursor: default; }
  .style__swatches { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
  .style__swatch {
    width: var(--space-xl);
    height: var(--space-xl);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .style__swatch--none {
    background: linear-gradient(135deg, transparent calc(50% - 1px), var(--red-text) calc(50% - 1px), var(--red-text) calc(50% + 1px), transparent calc(50% + 1px));
  }
  .style__swatch--active { box-shadow: 0 0 0 2px var(--bg-card), 0 0 0 4px var(--hydro); }
  .style__foot { display: flex; justify-content: flex-end; }
  .btn:disabled { opacity: 0.45; cursor: default; }
  @media (max-width: 900px) {
    .style__swatch { width: var(--touch-target); height: var(--touch-target); }
    .seg-ctrl button { min-height: var(--touch-target); }
  }
</style>
