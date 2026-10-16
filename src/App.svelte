<script lang="ts">
  /**
   * App shell (S6 integration): wires the shards into one worksheet.
   *
   * - TopNav slots → DatasetPicker / SavedViews / ExportMenu triggers.
   * - Desktop ≥ 900px: three panes (FieldPanel | ShelfPanel + Marks | chart);
   *   phone: chart-first with Data / Shelves / Marks / Chart bottom sheets (D-11).
   * - Boot: `ui.observeViewport()`, `query.start()`, `views.start()` once; a URL
   *   hash restores its spec by loading the dataset it names from the catalog,
   *   otherwise the dataset picker opens.
   * - Dialog state lives in `ui.dialog` (one home, S5 seam 2); every dialog is
   *   hosted here and opened through the callback props of the panes.
   * - With no pill driving a query, a `text-table` worksheet shows the raw first
   *   rows through `client.rows()` (S3 seam 6).
   * Layout classes live in app.css §4; everything else is tokens only (R-TOKENS).
   */
  import { onMount } from 'svelte';
  import type { DatasetEntry, DatasetManifest, FieldMeta, FormatSpec } from '$core/types';
  import { APP_VERSION } from '$core/version';
  import { makeFormatter } from '$format/formatter';
  import type { TableModel } from '$charts/types/text-table';
  import { chartDef } from '$charts/registry';
  import { suggest } from '$charts/show-me';
  import { ALL_SHELVES, DEFAULT_CHART } from '$core/constants';
  import { ui, type SheetId } from '$stores/ui.svelte';
  import { spec } from '$stores/spec.svelte';
  import { dataset } from '$stores/dataset.svelte';
  import { query } from '$stores/query.svelte';
  import { views } from '$stores/views.svelte';
  import TopNav from '$ui/shared/TopNav.svelte';
  import Toast from '$ui/shared/Toast.svelte';
  import BottomSheet from '$ui/shared/BottomSheet.svelte';
  import ProgressBar from '$ui/shared/ProgressBar.svelte';
  import Icon from '$ui/shared/Icon.svelte';
  import FieldPanel from '$ui/fields/FieldPanel.svelte';
  import ShelfPanel from '$ui/shelves/ShelfPanel.svelte';
  import ChartCanvas from '$ui/chart/ChartCanvas.svelte';
  import ChartPicker from '$ui/chart/ChartPicker.svelte';
  import DatasetPicker from '$ui/dialogs/DatasetPicker.svelte';
  import SavedViews from '$ui/dialogs/SavedViews.svelte';
  import ExportMenu from '$ui/dialogs/ExportMenu.svelte';
  import FormatDialog from '$ui/dialogs/FormatDialog.svelte';
  import FilterDialog from '$ui/dialogs/FilterDialog.svelte';
  import PaletteDialog from '$ui/dialogs/PaletteDialog.svelte';

  /** Raw rows shown for an empty text-table worksheet. */
  const RAW_ROWS = 200;
  /** Saved-view thumbnail width (px), per `SavedView.thumbnail`. */
  const THUMB_WIDTH = 160;

  const sheets: ReadonlyArray<{ id: SheetId; label: string }> = [
    { id: 'fields', label: 'Data' },
    { id: 'shelves', label: 'Shelves' },
    { id: 'marks', label: 'Marks' },
    { id: 'chart', label: 'Chart' },
  ];

  let canvas = $state<ChartCanvas | null>(null);
  let showMe = $state(false);
  let raw = $state<TableModel | null>(null);

  const manifestUrl = `${import.meta.env.BASE_URL}data/manifest.json`;
  const def = $derived(chartDef(spec.value.chartType));
  const hasColor = $derived(spec.value.shelves.color.length > 0);
  const wantsRaw = $derived(dataset.ready && query.key === null && spec.value.chartType === 'text-table');
  const phaseLabel: Record<string, string> = { download: 'Downloading', parse: 'Parsing', build: 'Building columns' };
  const num = new Intl.NumberFormat('en-US');

  /** Absolute URL of a catalog file (`base: './'` keeps it relative to the page, S5 seam 4). */
  function absoluteUrl(entry: DatasetEntry): string {
    return new URL(`${import.meta.env.BASE_URL}${entry.file}`, document.baseURI).href;
  }

  /** The catalog entry for a dataset id, or null when the manifest lacks it or cannot be read. */
  async function findEntry(datasetId: string): Promise<DatasetEntry | null> {
    try {
      const res = await fetch(manifestUrl, { cache: 'no-cache' });
      if (!res.ok) return null;
      const m = (await res.json()) as DatasetManifest;
      return m.datasets.find((d) => d.id === datasetId) ?? null;
    } catch {
      return null;
    }
  }

  /** Boot: restore the hash spec by loading its dataset (S5 seam 3), else open the picker. */
  async function boot(): Promise<void> {
    const restored = await views.restoreFromHash();
    if (restored) {
      const entry = await findEntry(restored.datasetId);
      if (entry) {
        await dataset.load({ ...entry, source: 'catalog' }, absoluteUrl(entry), restored);
        return;
      }
      ui.toast(`Dataset "${restored.datasetId}" is not in the catalog`, 'warn');
    }
    ui.openDialog({ kind: 'dataset' });
  }

  onMount(() => {
    const stops = [ui.observeViewport(), query.start(), views.start()];
    const flush = () => { void views.flush(); };
    window.addEventListener('pagehide', flush);
    void boot();
    return () => {
      for (const stop of stops) stop();
      window.removeEventListener('pagehide', flush);
    };
  });

  /** Build the raw-rows table model from a `rows()` reply, formatted per field default. */
  function rawModel(
    reply: { fields: string[]; columns: Array<string[] | Float64Array>; total: number },
    meta: FieldMeta[],
    fieldFormats: Record<string, FormatSpec>,
  ): TableModel {
    const cols = reply.fields.map((f, i) => {
      const m = meta.find((x) => x.name === f);
      const numeric = reply.columns[i] instanceof Float64Array;
      return {
        key: f,
        label: f,
        align: (numeric && m?.type !== 'date' && m?.type !== 'datetime' ? 'right' : 'left') as 'left' | 'right',
        kind: (m?.role === 'measure' ? 'measure' : 'dimension') as 'dimension' | 'measure',
        fmt: m ? makeFormatter(m, fieldFormats[f]) : (v: unknown) => (v === null || v === undefined ? '' : String(v)),
      };
    });
    const n = reply.columns[0]?.length ?? 0;
    const rows: string[][] = new Array<string[]>(n);
    for (let r = 0; r < n; r++) {
      rows[r] = cols.map((c, i) => {
        const col = reply.columns[i]!;
        const v = col[r];
        if (v === undefined) return '';
        if (col instanceof Float64Array) return Number.isNaN(v as number) ? '' : c.fmt(v as number);
        return c.fmt(v as string);
      });
    }
    return {
      renderer: 'dom',
      kind: 'table',
      columns: cols.map(({ key, label, align, kind }) => ({ key, label, align, kind })),
      rows,
      total: reply.total,
      truncated: reply.total > n,
    };
  }

  // Raw rows for an empty text-table worksheet, re-fetched when the filters or field formats change.
  $effect(() => {
    if (!wantsRaw) { raw = null; return; }
    const meta = dataset.meta;
    const filters = $state.snapshot(spec.value.filters);
    const fieldFormats = spec.value.fieldFormats;
    let live = true;
    dataset.client.rows(0, RAW_ROWS, meta.map((m) => m.name), filters)
      .then((r) => { if (live) raw = rawModel(r, meta, fieldFormats); })
      .catch(() => { if (live) raw = null; });
    return () => { live = false; };
  });

  /**
   * Tableau's "Automatic" mark: a field dropped on a fresh text-table worksheet
   * switches to the chart Show Me suggests (bar for zone × price). Only a drop
   * qualifies (one new pill id, every previous one kept, same dataset), so a
   * loaded view or an explicit text-table choice is never overridden.
   */
  let prevPills: { datasetId: string; ids: string[] } | null = null;
  $effect(() => {
    const s = spec.value;
    const ids = ALL_SHELVES.flatMap((sh) => s.shelves[sh].map((p) => p.id));
    const prev = prevPills;
    prevPills = { datasetId: s.datasetId, ids };
    if (!prev || prev.datasetId !== s.datasetId || s.chartType !== DEFAULT_CHART) return;
    const isDrop = ids.length === prev.ids.length + 1 && prev.ids.every((id) => ids.includes(id));
    if (!isDrop) return;
    const next = suggest(s, dataset.meta);
    if (next !== DEFAULT_CHART) spec.patch((d) => { d.chartType = next; });
  });

  // Surface load / query failures and worker warnings as toasts (the picker also shows load errors inline).
  $effect(() => { if (dataset.error) ui.toast(dataset.error, 'error'); });
  $effect(() => { if (query.error) ui.toast(query.error, 'error'); });
  $effect(() => { for (const w of dataset.warnings) ui.toast(w, 'warn'); });

  /** PNG of the chart for the export menu (null for DOM renderers or before the first paint). */
  function toPng(): string | null {
    return canvas?.toPng() ?? null;
  }

  /** A `THUMB_WIDTH`-px PNG data URL of the chart for a saved view's card. */
  async function thumbnail(): Promise<string | undefined> {
    const full = canvas?.toPng(1);
    if (!full) return undefined;
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('thumbnail decode failed')); img.src = full; });
    const scale = THUMB_WIDTH / Math.max(1, img.width);
    const c = document.createElement('canvas');
    c.width = THUMB_WIDTH;
    c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  function setTitle(e: Event): void {
    const title = (e.currentTarget as HTMLInputElement).value;
    if (title !== spec.value.title) spec.patch((d) => { d.title = title; });
  }

  const openFormatForField = (field: string) => ui.openDialog({ kind: 'format', target: { kind: 'field', field } });
  const openFormatForPill = (pillId: string) => ui.openDialog({ kind: 'format', target: { kind: 'pill', pillId } });
  const openFilter = (pillId: string) => ui.openDialog({ kind: 'filter', pillId });
  const changeType = (field: string, type: Parameters<typeof dataset.setType>[1], dateFormat?: string) => { void dataset.setType(field, type, dateFormat); };
  const closeDialog = () => ui.closeDialog();
</script>

{#snippet datasetSlot()}
  <button type="button" class="topnav__link topnav__dataset" onclick={() => ui.openDialog({ kind: 'dataset' })} title={dataset.entry?.name ?? 'Open a dataset'}>
    {dataset.entry && !ui.isMobile ? dataset.entry.name : 'Dataset'}
  </button>
{/snippet}
{#snippet viewsSlot()}
  <button type="button" class="topnav__link" onclick={() => ui.openDialog({ kind: 'views' })} disabled={!dataset.ready}>Views</button>
{/snippet}
{#snippet exportSlot()}
  <ExportMenu {toPng} />
{/snippet}

<div class="app">
  <TopNav version={APP_VERSION} title={spec.value.title} dataset={datasetSlot} views={viewsSlot} {exportSlot} />

  <div class="app__body">
    <aside class="pane pane--fields card" aria-label="Data pane">
      <div class="pane__head">
        <span class="eyebrow">Data</span>
        {#if dataset.ready}<span class="pane__stat num">{num.format(dataset.rowCount)} rows</span>{/if}
      </div>
      <FieldPanel meta={dataset.meta} onFormat={openFormatForField} onChangeType={changeType} />
    </aside>

    <section class="pane pane--shelves card" aria-label="Shelves">
      <div class="pane__head"><span class="eyebrow">Columns · Rows · Filters · Marks</span></div>
      <ShelfPanel meta={dataset.meta} onFormat={openFormatForPill} onFilter={openFilter} />
    </section>

    <main class="pane pane--chart card" aria-label="Chart">
      <div class="chart-head">
        <input
          class="chart-head__title"
          type="text"
          placeholder="Untitled worksheet"
          aria-label="Worksheet title"
          value={spec.value.title}
          onchange={setTitle}
          disabled={!dataset.ready}
        />
        <span class="chart-head__type" title="Chart type">{def.label}</span>
        {#if !ui.isMobile}
          <button type="button" class="btn" class:active={showMe} aria-pressed={showMe} onclick={() => { showMe = !showMe; }} disabled={!dataset.ready}>
            Show Me
          </button>
        {/if}
        <button type="button" class="btn" onclick={() => ui.openDialog({ kind: 'palette' })} disabled={!dataset.ready || !hasColor} title={hasColor ? 'Color palette' : 'Drop a field on Color first'}>
          <Icon name="color" /> Palette
        </button>
      </div>

      <div class="chart-body">
        <div class="chart-surface">
          {#if dataset.loading}
            <div class="chart-loading">
              <ProgressBar
                value={dataset.progress?.loaded ?? 0}
                max={dataset.progress?.total ?? null}
                label={`${phaseLabel[dataset.progress?.phase ?? 'download']} ${dataset.entry?.name ?? ''}${dataset.progress?.rows ? ` · ${num.format(dataset.progress.rows)} rows` : ''}`}
              />
            </div>
          {:else if !dataset.ready}
            <p class="chart-empty">
              <button type="button" class="btn btn--primary" onclick={() => ui.openDialog({ kind: 'dataset' })}>Open a dataset</button>
            </p>
          {:else}
            <ChartCanvas
              bind:this={canvas}
              spec={spec.value}
              result={query.result}
              meta={dataset.meta}
              isMobile={ui.isMobile}
              busy={query.pending}
              {raw}
            />
          {/if}
        </div>
        {#if showMe && !ui.isMobile}
          <aside class="chart-showme" aria-label="Show Me">
            <ChartPicker meta={dataset.meta} />
          </aside>
        {/if}
      </div>

      {#if query.result}
        <div class="chart-foot num" aria-live="polite">
          {num.format(query.result.groups)} {query.result.groups === 1 ? 'group' : 'groups'}
          · {num.format(query.result.filteredRows)} of {num.format(query.result.scannedRows)} rows
          · {Math.round(query.result.elapsedMs)} ms{query.result.truncated ? ' · truncated' : ''}
        </div>
      {/if}
    </main>
  </div>

  <nav class="app__bottom-bar" aria-label="Panels">
    {#each sheets as s (s.id)}
      <button type="button" class:active={ui.sheet === s.id} aria-pressed={ui.sheet === s.id} onclick={() => ui.toggleSheet(s.id)}>{s.label}</button>
    {/each}
  </nav>

  {#if ui.isMobile}
    <BottomSheet open={ui.sheet === 'fields'} title="Data" onClose={() => { ui.sheet = 'none'; }}>
      <FieldPanel meta={dataset.meta} onFormat={openFormatForField} onChangeType={changeType} />
    </BottomSheet>
    <BottomSheet open={ui.sheet === 'shelves'} title="Shelves" onClose={() => { ui.sheet = 'none'; }}>
      <ShelfPanel meta={dataset.meta} showMarks={false} onFormat={openFormatForPill} onFilter={openFilter} />
    </BottomSheet>
    <BottomSheet open={ui.sheet === 'marks'} title="Marks" onClose={() => { ui.sheet = 'none'; }}>
      <ShelfPanel meta={dataset.meta} showMain={false} onFormat={openFormatForPill} onFilter={openFilter} />
      <button type="button" class="btn sheet-action" onclick={() => ui.openDialog({ kind: 'palette' })} disabled={!hasColor}>
        <Icon name="color" /> Color palette…
      </button>
    </BottomSheet>
    <BottomSheet open={ui.sheet === 'chart'} title="Chart type" onClose={() => { ui.sheet = 'none'; }}>
      <ChartPicker meta={dataset.meta} />
    </BottomSheet>
  {/if}

  <DatasetPicker open={ui.dialog?.kind === 'dataset'} onclose={closeDialog} />
  <SavedViews open={ui.dialog?.kind === 'views'} onclose={closeDialog} {thumbnail} />
  <FormatDialog open={ui.dialog?.kind === 'format'} target={ui.dialog?.kind === 'format' ? ui.dialog.target : null} onclose={closeDialog} />
  <FilterDialog open={ui.dialog?.kind === 'filter'} pillId={ui.dialog?.kind === 'filter' ? ui.dialog.pillId : null} onclose={closeDialog} />
  <PaletteDialog open={ui.dialog?.kind === 'palette'} onclose={closeDialog} />
  <Toast />
</div>

<style>
  .pane__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }
  .pane__stat { font-size: 0.68rem; color: var(--text-muted); }

  .topnav__dataset { max-width: 16rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .chart-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex: none;
    min-height: var(--space-xl);
  }
  .chart-head__title {
    flex: 1 1 auto;
    min-width: 0;
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--text-primary);
  }
  .chart-head__title:hover:not(:disabled), .chart-head__title:focus { border-color: var(--border); background: var(--bg-card); outline: none; }
  .chart-head__title:focus { border-color: var(--hydro); }
  .chart-head__type { flex: none; font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; }
  .chart-head .btn:disabled { opacity: 0.45; cursor: default; }

  .chart-body { display: flex; flex: 1 1 auto; min-height: 0; gap: var(--space-md); }
  .chart-surface { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; }
  .chart-showme {
    flex: none;
    width: var(--sidebar-width);
    overflow: auto;
    padding-left: var(--space-md);
    border-left: 1px solid var(--border-light);
  }
  .chart-loading { margin: auto; width: min(100%, 24rem); }
  .chart-empty { margin: auto; text-align: center; }
  .chart-foot {
    flex: none;
    padding-top: var(--space-xs);
    font-size: 0.68rem;
    color: var(--text-muted);
    text-align: right;
  }

  .sheet-action { margin-top: var(--space-md); width: 100%; justify-content: center; min-height: var(--touch-target); }

  @media (max-width: 900px) {
    .chart-head { gap: var(--space-xs); }
    .chart-head__title { font-size: 0.85rem; }
    .chart-head__type { display: none; }
    .chart-head .btn { min-height: var(--touch-target); }
    .chart-foot { text-align: left; }
  }
</style>
