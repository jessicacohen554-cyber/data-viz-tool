<script lang="ts" module>
  /**
   * Inline SVG icon set for the worksheet UI (no icon font, no library).
   * Field-type glyphs follow docs/TABLEAU-SPEC.md §1.1: Abc, #, calendar,
   * calendar-clock, T|F. Colour comes from `currentColor`; size from the
   * `--icon-size` token (defaults to 1em so it scales with the text).
   */
  import type { DataType } from '../../core/types';

  export type IconName =
    | 'abc' | 'hash' | 'calendar' | 'calendar-clock' | 'bool'
    | 'chevron-down' | 'chevron-right' | 'chevron-left' | 'close' | 'search' | 'plus' | 'minus'
    | 'grip' | 'check' | 'sort' | 'filter' | 'bolt' | 'undo' | 'redo' | 'color' | 'size' | 'label'
    | 'detail' | 'tooltip' | 'shape' | 'info' | 'warn' | 'error' | 'success';

  /** Icon for a data type (docs/TABLEAU-SPEC.md §1.1). */
  export function typeIcon(type: DataType): IconName {
    switch (type) {
      case 'number': case 'integer': return 'hash';
      case 'date': return 'calendar';
      case 'datetime': return 'calendar-clock';
      case 'boolean': return 'bool';
      default: return 'abc';
    }
  }

  /** SVG path data per icon, on a 24×24 grid; `text` icons render a glyph instead. */
  const PATHS: Record<IconName, { d?: string; text?: string; stroke?: boolean }> = {
    abc: { text: 'Abc' },
    hash: { text: '#' },
    bool: { text: 'T|F' },
    calendar: { d: 'M7 2v2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3V2h-2v2H9V2H7zm13 8v10H4V10h16z' },
    'calendar-clock': { d: 'M7 2v2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7v-2H4V10h16v1h2V6a2 2 0 0 0-2-2h-3V2h-2v2H9V2H7zm10 10a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-.5 2h1v2.6l1.8 1.1-.5.9-2.3-1.4V14z' },
    'chevron-down': { d: 'M6 9l6 6 6-6', stroke: true },
    'chevron-right': { d: 'M9 6l6 6-6 6', stroke: true },
    'chevron-left': { d: 'M15 6l-6 6 6 6', stroke: true },
    close: { d: 'M6 6l12 12M18 6L6 18', stroke: true },
    search: { d: 'M10.5 3a7.5 7.5 0 1 0 4.6 13.4l4.8 4.8 1.4-1.4-4.8-4.8A7.5 7.5 0 0 0 10.5 3zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z' },
    plus: { d: 'M12 5v14M5 12h14', stroke: true },
    minus: { d: 'M5 12h14', stroke: true },
    grip: { d: 'M9 5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM9 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM9 19a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z' },
    check: { d: 'M5 12l5 5L20 7', stroke: true },
    sort: { d: 'M3 6h18M6 12h12M9 18h6', stroke: true },
    filter: { d: 'M3 5h18l-7 8v6l-4-2v-4L3 5z' },
    bolt: { d: 'M13 2 3 14h7l-1 8 10-12h-7l1-8z' },
    undo: { d: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3', stroke: true },
    redo: { d: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3', stroke: true },
    color: { d: 'M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 22 10c0-3.9-4.5-7-10-7zm-5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z' },
    size: { d: 'M4 20a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm9-2a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z' },
    label: { d: 'M4 6h16M4 12h10M4 18h7', stroke: true },
    detail: { d: 'M4 5h16v3H4zM4 10.5h16v3H4zM4 16h16v3H4z' },
    tooltip: { d: 'M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-4 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z' },
    shape: { d: 'M12 3l9 16H3L12 3z' },
    info: { d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 7h2v8h-2V9zm0-3h2v2h-2V6z' },
    warn: { d: 'M12 2 1 21h22L12 2zm-1 7h2v6h-2V9zm0 7h2v2h-2v-2z' },
    error: { d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.5 5L17 8.5 13.5 12 17 15.5 15.5 17 12 13.5 8.5 17 7 15.5 10.5 12 7 8.5 8.5 7 12 10.5 15.5 7z' },
    success: { d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 14-4-4 1.4-1.4L10 13.2l6.6-6.6L18 8l-8 8z' },
  };
</script>

<script lang="ts">
  /** Props: the icon name and an optional accessible label (decorative when omitted). */
  let { name, label = '' }: { name: IconName; label?: string } = $props();
  const spec = $derived(PATHS[name]);
</script>

{#if spec.text}
  <span class="icon icon--text" role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}>{spec.text}</span>
{:else}
  <svg class="icon" viewBox="0 0 24 24" role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}>
    {#if spec.stroke}
      <path d={spec.d} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    {:else}
      <path d={spec.d} fill="currentColor" />
    {/if}
  </svg>
{/if}

<style>
  .icon {
    display: inline-block;
    width: var(--icon-size, 1em);
    height: var(--icon-size, 1em);
    flex: none;
    vertical-align: -0.15em;
  }
  .icon--text {
    width: auto;
    min-width: var(--icon-size, 1em);
    height: auto;
    font-family: var(--font-mono);
    font-size: 0.68em;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
    vertical-align: 0;
  }
</style>
