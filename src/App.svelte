<script lang="ts">
  /**
   * App shell (S0 skeleton). The integration shard (S6) replaces the stub
   * panes with FieldPanel, ShelfPanel, ChartCanvas and the dialogs host.
   * Layout classes live in app.css §4.
   */
  import { onMount } from 'svelte';
  import { ui } from '$stores/ui.svelte';
  import { spec } from '$stores/spec.svelte';
  import { APP_VERSION } from '$core/version';

  onMount(() => ui.observeViewport());

  const sheets = [
    { id: 'fields', label: 'Data' },
    { id: 'shelves', label: 'Shelves' },
    { id: 'marks', label: 'Marks' },
    { id: 'chart', label: 'Chart' },
  ] as const;
</script>

<div class="app">
  <header class="topnav">
    <div class="topnav__brand">
      <svg class="topnav__bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" fill="currentColor"/></svg>
      <span class="topnav__word">Data Viz Tool</span>
      <span class="topnav__ver num">v{APP_VERSION}</span>
    </div>
    <nav class="topnav__links" aria-label="Primary">
      <button class="topnav__link" type="button" disabled>Dataset</button>
      <button class="topnav__link" type="button" disabled>Views</button>
      <button class="topnav__link" type="button" disabled>Export</button>
    </nav>
  </header>

  <div class="app__body">
    <aside class="pane pane--fields card" aria-label="Data pane">
      <div class="eyebrow">Data</div>
      <p class="pane__placeholder">Field list arrives with shard S4.</p>
    </aside>
    <section class="pane pane--shelves card" aria-label="Shelves">
      <div class="eyebrow">Columns · Rows · Filters · Marks</div>
      <p class="pane__placeholder">Shelves arrive with shard S4. Chart type: <span class="num">{spec.value.chartType}</span></p>
    </section>
    <main class="pane pane--chart card" aria-label="Chart">
      <div class="eyebrow">Chart</div>
      <p class="pane__placeholder">Chart canvas arrives with shard S3. Skeleton deployed from the foundation shard.</p>
    </main>
  </div>

  <nav class="app__bottom-bar" aria-label="Panels">
    {#each sheets as s (s.id)}
      <button type="button" class:active={ui.sheet === s.id} onclick={() => ui.toggleSheet(s.id)}>{s.label}</button>
    {/each}
  </nav>
</div>

<style>
  .topnav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--nav-height);
    padding: 0 var(--space-md);
    background: var(--navy);
    color: var(--text-on-dark);
  }
  .topnav__brand { display: flex; align-items: center; gap: var(--space-sm); }
  .topnav__bolt { width: 20px; height: 20px; color: var(--hydro); }
  .topnav__word { font-family: var(--font-heading); font-weight: 700; font-size: 0.9rem; }
  .topnav__ver { font-size: 0.68rem; opacity: 0.6; }
  .topnav__links { display: flex; gap: var(--space-xs); }
  .topnav__link {
    color: rgba(255, 255, 255, 0.78);
    font-size: 0.82rem;
    font-weight: 500;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
  }
  .topnav__link:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); color: var(--text-on-dark); }
  .topnav__link:disabled { opacity: 0.45; cursor: default; }
  .pane__placeholder { color: var(--text-muted); font-size: 0.82rem; }
</style>
