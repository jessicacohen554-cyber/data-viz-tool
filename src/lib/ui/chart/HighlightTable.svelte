<script lang="ts">
  /**
   * Highlight table (CHARTS.md #19): cells tinted by the measure through the
   * continuous ramp, text color by the WCAG contrast rule (computed in the
   * builder), a `--border-light` border on every cell so the light end of the
   * ramp stays visible. Windowed above 200 rows like `TextTable`.
   */
  import type { HighlightModel } from '$charts/types/highlight-table';
  import { ROW_HEIGHT, VIRTUAL_THRESHOLD } from './TextTable.svelte';

  const OVERSCAN = 10;

  let { model }: { model: HighlightModel } = $props();

  let scrollTop = $state(0);
  let viewport = $state(0);
  const virtual = $derived(model.rows.length > VIRTUAL_THRESHOLD);
  const first = $derived(virtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0);
  const last = $derived(virtual ? Math.min(model.rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN) : model.rows.length);
  const topPad = $derived(first * ROW_HEIGHT);
  const bottomPad = $derived((model.rows.length - last) * ROW_HEIGHT);

  function onScroll(e: Event): void {
    scrollTop = (e.currentTarget as HTMLElement).scrollTop;
  }
</script>

<div class="hl-table" onscroll={onScroll} bind:clientHeight={viewport}>
  <table class="hl-table__table">
    <thead>
      <tr>
        <th scope="col">{model.rowHeader}</th>
        {#each model.columns as c, i (i)}
          <th scope="col" class="hl-table__num">{c}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if topPad > 0}<tr aria-hidden="true" style:height="{topPad}px"><td colspan={model.columns.length + 1}></td></tr>{/if}
      {#each model.rows.slice(first, last) as row, i (first + i)}
        <tr>
          <th scope="row">{row.label}</th>
          {#each row.cells as cell, ci (ci)}
            <td class="hl-table__num num" style:background={cell.bg ?? undefined} style:color={cell.bg ? cell.fg : undefined}>{cell.text}</td>
          {/each}
        </tr>
      {/each}
      {#if bottomPad > 0}<tr aria-hidden="true" style:height="{bottomPad}px"><td colspan={model.columns.length + 1}></td></tr>{/if}
    </tbody>
  </table>
</div>

<style>
  .hl-table { flex: 1 1 auto; min-height: 0; overflow: auto; }
  .hl-table__table { border-collapse: separate; border-spacing: 0; font-size: var(--pill-font); min-width: 100%; }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg-page);
    color: var(--text-muted);
    font-weight: 600;
    text-align: left;
    padding: var(--space-xs) var(--space-sm);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  tbody tr { height: var(--pill-height); }
  tbody th {
    position: sticky;
    left: 0;
    background: var(--bg-card);
    font-weight: 500;
    text-align: left;
    padding: 0 var(--space-sm);
    border-bottom: 1px solid var(--border-light);
    white-space: nowrap;
    max-width: var(--sidebar-width);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  tbody td {
    padding: 0 var(--space-sm);
    border: 1px solid var(--border-light);
    border-top: none;
    border-left: none;
    white-space: nowrap;
  }
  .hl-table__num { text-align: right; }
</style>
