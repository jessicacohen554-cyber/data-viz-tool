<script module lang="ts">
  /** Rows above which the table windows its body. */
  export const VIRTUAL_THRESHOLD = 200;
  /** Fixed body row height in px (matches `--pill-height`). */
  export const ROW_HEIGHT = 28;
</script>

<script lang="ts">
  /**
   * Text table (CHARTS.md #33): row header per D, column per M, numbers
   * right-aligned in mono. Rows are windowed above `VIRTUAL_THRESHOLD` so a
   * 50K-group result scrolls without laying out 50K `<tr>`s.
   */
  import type { TableModel } from '$charts/types/text-table';

  const OVERSCAN = 10;

  let { model }: { model: TableModel } = $props();

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

<div class="text-table" onscroll={onScroll} bind:clientHeight={viewport}>
  <table class="text-table__table">
    <thead>
      <tr>
        {#each model.columns as c (c.key)}
          <th class:text-table__num={c.align === 'right'} scope="col">{c.label}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if topPad > 0}<tr aria-hidden="true" style:height="{topPad}px"><td colspan={model.columns.length}></td></tr>{/if}
      {#each model.rows.slice(first, last) as row, i (first + i)}
        <tr>
          {#each row as cell, ci}
            {#if model.columns[ci]?.kind === 'dimension'}
              <th scope="row">{cell}</th>
            {:else}
              <td class="text-table__num num">{cell}</td>
            {/if}
          {/each}
        </tr>
      {/each}
      {#if bottomPad > 0}<tr aria-hidden="true" style:height="{bottomPad}px"><td colspan={model.columns.length}></td></tr>{/if}
    </tbody>
  </table>
  {#if model.truncated}
    <p class="text-table__note">Showing the first {model.total.toLocaleString()} rows; add a filter to see the rest.</p>
  {/if}
</div>

<style>
  .text-table { flex: 1 1 auto; min-height: 0; overflow: auto; }
  .text-table__table { width: 100%; border-collapse: collapse; font-size: var(--pill-font); }
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
  tbody th, tbody td {
    padding: 0 var(--space-sm);
    border-bottom: 1px solid var(--border-light);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: var(--sidebar-width);
  }
  tbody th { font-weight: 500; text-align: left; color: var(--text-secondary); }
  .text-table__num { text-align: right; }
  .text-table__note { padding: var(--space-sm); color: var(--text-muted); font-size: var(--pill-font); }
</style>
