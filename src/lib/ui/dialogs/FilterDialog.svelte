<script lang="ts" module>
  import type { DataType, FilterSpec } from '$core/types';

  /** Filter kinds the dialog offers for a field type (docs/TABLEAU-SPEC.md §6.2). */
  export function kindsFor(type: DataType): FilterSpec['kind'][] {
    if (type === 'number' || type === 'integer') return ['range', 'topN'];
    if (type === 'date' || type === 'datetime') return ['dateRange', 'topN'];
    return ['categorical', 'wildcard', 'topN'];
  }

  /** A filter that keeps every row, used when a pill lands on Filters before the user chooses. */
  export function passthroughFilter(pillId: string, field: string, type: DataType): FilterSpec {
    if (type === 'number' || type === 'integer') return { pillId, field, kind: 'range', min: null, max: null, includeNull: true };
    if (type === 'date' || type === 'datetime') return { pillId, field, kind: 'dateRange', from: null, to: null };
    return { pillId, field, kind: 'categorical', mode: 'exclude', values: [], includeNull: true };
  }

  /** Epoch ms (UTC midnight) of a `yyyy-MM-dd` / `yyyy-MM-ddTHH:mm` input value; null when empty or malformed. */
  export function inputToEpoch(value: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
    if (!m) return null;
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
    return Number.isFinite(ms) ? ms : null;
  }

  /** Inverse of `inputToEpoch` for the two input types. */
  export function epochToInput(ms: number | null, withTime: boolean): string {
    if (ms === null || !Number.isFinite(ms)) return '';
    const iso = new Date(ms).toISOString();
    return withTime ? iso.slice(0, 16) : iso.slice(0, 10);
  }

  /** How many profile values the list asks the worker for. */
  export const PROFILE_LIMIT = 500;
  /** Search box debounce. */
  export const SEARCH_DEBOUNCE_MS = 150;
</script>

<script lang="ts">
  /**
   * Filter dialog (shard S5): edits the `FilterSpec` of one pill on the
   * Filters shelf. Categorical list with search / All / None from
   * `client.profile`, numeric range with sliders, date range, Top N by a
   * measure, wildcard. Apply replaces the pill's entry in `spec.filters`
   * through `spec.patch`; Remove takes the pill off the shelf.
   */
  import { untrack } from 'svelte';
  import type { Aggregation, FieldMeta, FieldProfile } from '$core/types';
  import { AGGREGATIONS, AGGREGATION_LABEL, DATE_LEVELS } from '$core/constants';
  import { spec } from '$stores/spec.svelte';
  import { dataset } from '$stores/dataset.svelte';
  import Dialog from './Dialog.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
    pillId: string | null;
  }

  let { open, onclose, pillId }: Props = $props();

  const found = $derived(pillId ? spec.findPill(pillId) : null);
  const pill = $derived(found?.pill ?? null);
  const meta = $derived<FieldMeta | undefined>(pill ? dataset.meta.find((m) => m.name === pill.field) : undefined);
  const existing = $derived<FilterSpec | undefined>(pillId ? spec.value.filters.find((f) => f.pillId === pillId) : undefined);
  const kinds = $derived(meta ? kindsFor(meta.type) : []);
  const measureFields = $derived(dataset.meta.filter((m) => m.type === 'number' || m.type === 'integer'));
  const isDatetime = $derived(meta?.type === 'datetime');

  let draft = $state<FilterSpec | null>(null);
  let profile = $state<FieldProfile | null>(null);
  let profileError = $state<string | null>(null);
  let search = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (!open || !pill || !meta) return;
    draft = existing ? structuredClone(existing) : passthroughFilter(pill.id, pill.field, meta.type);
    search = '';
    profile = null;
  });

  async function loadProfile(field: string, q: string): Promise<void> {
    profileError = null;
    try {
      const p = await dataset.client.profile(field, PROFILE_LIMIT, q || undefined);
      if (draft?.field === field) profile = p;
    } catch (e) {
      profileError = e instanceof Error ? e.message : String(e);
    }
  }

  // Tracks only `open`, the draft kind/field and the search text; `profile` is read untracked so
  // the reply it writes does not re-run this effect.
  $effect(() => {
    if (!open || draft?.kind !== 'categorical') return;
    const field = draft.field;
    const q = search;
    const delay = untrack(() => (profile ? SEARCH_DEBOUNCE_MS : 0));
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { void loadProfile(field, q); }, delay);
    return () => { if (searchTimer) clearTimeout(searchTimer); };
  });

  function switchKind(kind: FilterSpec['kind']): void {
    if (!pill || !meta) return;
    if (existing?.kind === kind) { draft = structuredClone(existing); return; }
    const base = { pillId: pill.id, field: pill.field };
    const by = measureFields[0];
    switch (kind) {
      case 'categorical': draft = { ...base, kind, mode: 'exclude', values: [], includeNull: true }; break;
      case 'range': draft = { ...base, kind, min: null, max: null, includeNull: true }; break;
      case 'dateRange': draft = { ...base, kind, from: null, to: null }; break;
      case 'topN': draft = { ...base, kind, n: 10, dir: 'top', by: { field: by?.name ?? pill.field, aggregation: by ? 'sum' : 'count' } }; break;
      case 'wildcard': draft = { ...base, kind, pattern: '', mode: 'contains' }; break;
    }
  }

  const selected = $derived(draft?.kind === 'categorical' ? new Set(draft.values) : new Set<string>());

  function toggleValue(label: string, on: boolean): void {
    if (draft?.kind !== 'categorical') return;
    const next = new Set(draft.values);
    if (on) next.add(label); else next.delete(label);
    draft.values = [...next];
  }

  function selectAll(): void {
    if (draft?.kind !== 'categorical' || !profile) return;
    draft.values = [...new Set([...draft.values, ...profile.labels])];
  }

  function selectNone(): void {
    if (draft?.kind !== 'categorical') return;
    draft.values = [];
  }

  function num(v: string): number | null {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  const topNAggregations = $derived(AGGREGATIONS.filter((a): a is Exclude<Aggregation, 'none'> => a !== 'none'));

  function apply(): void {
    if (!draft || !pillId) return;
    const value = draft;
    spec.patch((d) => {
      const i = d.filters.findIndex((f) => f.pillId === pillId);
      if (i >= 0) d.filters[i] = value; else d.filters.push(value);
    });
    onclose();
  }

  function removePill(): void {
    if (pillId) spec.removePill(pillId);
    onclose();
  }

  const title = $derived(pill ? `Filter · ${pill.field}` : 'Filter');
  const countFmt = new Intl.NumberFormat(undefined);
</script>

<Dialog {open} {onclose} {title} width="md">
  {#snippet footer()}
    <button type="button" class="btn btn--danger" onclick={removePill}>Remove filter</button>
    <span class="spacer"></span>
    <button type="button" class="btn" onclick={onclose}>Cancel</button>
    <button type="button" class="btn btn--primary" onclick={apply} disabled={!draft}>Apply</button>
  {/snippet}

  {#if !pill}
    <p class="muted">This pill is no longer on the Filters shelf.</p>
  {:else if !meta || !draft}
    <p class="muted">The field <strong>{pill.field}</strong> is not in the loaded dataset.</p>
  {:else}
    <div class="seg-ctrl kinds" role="tablist" aria-label="Filter kind">
      {#each kinds as k (k)}
        <button type="button" role="tab" aria-selected={draft.kind === k} class:active={draft.kind === k} onclick={() => switchKind(k)}>
          {k === 'categorical' ? 'List' : k === 'range' ? 'Range' : k === 'dateRange' ? 'Dates' : k === 'topN' ? 'Top N' : 'Wildcard'}
        </button>
      {/each}
    </div>

    {#if draft.kind === 'categorical'}
      <div class="toolbar">
        <input type="search" placeholder="Search values" bind:value={search} aria-label="Search values" />
        <button type="button" class="btn" onclick={selectAll} disabled={!profile}>All</button>
        <button type="button" class="btn" onclick={selectNone}>None</button>
      </div>
      <div class="toolbar">
        <label class="check"><input type="radio" name="mode" checked={draft.mode === 'include'} onchange={() => { if (draft?.kind === 'categorical') draft.mode = 'include'; }} /> Keep selected</label>
        <label class="check"><input type="radio" name="mode" checked={draft.mode === 'exclude'} onchange={() => { if (draft?.kind === 'categorical') draft.mode = 'exclude'; }} /> Exclude selected</label>
        <label class="check"><input type="checkbox" checked={draft.includeNull} onchange={(e) => { if (draft?.kind === 'categorical') draft.includeNull = e.currentTarget.checked; }} /> Include nulls</label>
      </div>
      {#if profileError}
        <p class="muted error">Could not load values: {profileError}</p>
      {:else if !profile}
        <p class="muted">Loading values…</p>
      {:else}
        <ul class="values" aria-label="Values">
          {#each profile.labels as label, i (label)}
            <li>
              <label class="value">
                <input type="checkbox" checked={selected.has(label)} onchange={(e) => toggleValue(label, e.currentTarget.checked)} />
                <span class="value__label">{label === '' ? '(empty)' : label}</span>
                <span class="value__count num">{countFmt.format(profile.counts[i] ?? 0)}</span>
              </label>
            </li>
          {/each}
        </ul>
        <p class="muted">
          {profile.labels.length} values{profile.truncated ? ' shown (more exist; search to narrow)' : ''}
          · {draft.values.length} selected{profile.nullCount ? ` · ${countFmt.format(profile.nullCount)} null` : ''}
        </p>
      {/if}

    {:else if draft.kind === 'range'}
      {@const lo = meta.min ?? 0}
      {@const hi = meta.max ?? 100}
      {@const step = (hi - lo) / 200 || 1}
      <div class="grid">
        <label class="row"><span>Minimum</span>
          <input type="number" value={draft.min ?? ''} placeholder={String(lo)} oninput={(e) => { if (draft?.kind === 'range') draft.min = num(e.currentTarget.value); }} />
          <input type="range" min={lo} max={hi} step={step} value={draft.min ?? lo} aria-label="Minimum slider" disabled={meta.min === null} oninput={(e) => { if (draft?.kind === 'range') draft.min = Number(e.currentTarget.value); }} />
        </label>
        <label class="row"><span>Maximum</span>
          <input type="number" value={draft.max ?? ''} placeholder={String(hi)} oninput={(e) => { if (draft?.kind === 'range') draft.max = num(e.currentTarget.value); }} />
          <input type="range" min={lo} max={hi} step={step} value={draft.max ?? hi} aria-label="Maximum slider" disabled={meta.max === null} oninput={(e) => { if (draft?.kind === 'range') draft.max = Number(e.currentTarget.value); }} />
        </label>
      </div>
      <label class="check"><input type="checkbox" checked={draft.includeNull} onchange={(e) => { if (draft?.kind === 'range') draft.includeNull = e.currentTarget.checked; }} /> Include nulls</label>
      <p class="muted">Inclusive on both ends. Leave a bound empty to keep it open. Data spans <span class="num">{meta.min ?? '—'}</span> to <span class="num">{meta.max ?? '—'}</span>.</p>

    {:else if draft.kind === 'dateRange'}
      <div class="grid">
        <label class="row"><span>From</span>
          <input type={isDatetime ? 'datetime-local' : 'date'} value={epochToInput(draft.from, isDatetime)} oninput={(e) => { if (draft?.kind === 'dateRange') draft.from = inputToEpoch(e.currentTarget.value); }} />
        </label>
        <label class="row"><span>To</span>
          <input type={isDatetime ? 'datetime-local' : 'date'} value={epochToInput(draft.to, isDatetime)} oninput={(e) => { if (draft?.kind === 'dateRange') draft.to = inputToEpoch(e.currentTarget.value); }} />
        </label>
        <label class="row"><span>Period of "To"</span>
          <select value={draft.level ?? ''} onchange={(e) => { if (draft?.kind === 'dateRange') { const v = e.currentTarget.value; if (v) draft.level = v as typeof DATE_LEVELS[number]; else delete draft.level; } }}>
            <option value="">Exact</option>
            {#each DATE_LEVELS as l (l)}<option value={l}>{l}</option>{/each}
          </select>
        </label>
      </div>
      <p class="muted">Dates are read as UTC, like the data. "To" includes the whole period at the chosen level.</p>

    {:else if draft.kind === 'topN'}
      <div class="grid">
        <label class="row"><span>Show</span>
          <select value={draft.dir} onchange={(e) => { if (draft?.kind === 'topN') draft.dir = e.currentTarget.value as 'top' | 'bottom'; }}>
            <option value="top">Top</option><option value="bottom">Bottom</option>
          </select>
        </label>
        <label class="row"><span>N</span>
          <input type="number" min="1" step="1" value={draft.n} oninput={(e) => { if (draft?.kind === 'topN') draft.n = Math.max(1, Math.round(Number(e.currentTarget.value) || 1)); }} />
        </label>
        <label class="row"><span>By field</span>
          <select value={draft.by.field} onchange={(e) => { if (draft?.kind === 'topN') draft.by.field = e.currentTarget.value; }}>
            {#each dataset.meta as m (m.name)}<option value={m.name}>{m.name}</option>{/each}
          </select>
        </label>
        <label class="row"><span>Aggregation</span>
          <select value={draft.by.aggregation} onchange={(e) => { if (draft?.kind === 'topN') draft.by.aggregation = e.currentTarget.value as Aggregation; }}>
            {#each topNAggregations as a (a)}<option value={a}>{AGGREGATION_LABEL[a]}</option>{/each}
          </select>
        </label>
      </div>
      <p class="muted">Ranks the values of <strong>{pill.field}</strong> by the measure over rows that pass every other filter.</p>

    {:else if draft.kind === 'wildcard'}
      <div class="grid">
        <label class="row"><span>Match</span>
          <select value={draft.mode} onchange={(e) => { if (draft?.kind === 'wildcard') draft.mode = e.currentTarget.value as 'contains' | 'starts' | 'ends' | 'exact'; }}>
            <option value="contains">Contains</option><option value="starts">Starts with</option><option value="ends">Ends with</option><option value="exact">Exactly</option>
          </select>
        </label>
        <label class="row"><span>Text</span>
          <input type="text" value={draft.pattern} oninput={(e) => { if (draft?.kind === 'wildcard') draft.pattern = e.currentTarget.value; }} />
        </label>
      </div>
      <p class="muted">Case-insensitive; no regular expressions.</p>
    {/if}
  {/if}
</Dialog>

<style>
  .muted { color: var(--text-muted); font-size: 0.82rem; }
  .error { color: var(--red-text); }
  .kinds { margin-bottom: var(--space-md); }
  .kinds button { min-height: var(--space-xl); }
  .toolbar { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; margin-bottom: var(--space-sm); }
  .toolbar input[type='search'] { flex: 1; min-width: 10rem; }
  .check { display: inline-flex; align-items: center; gap: var(--space-xs); font-size: 0.82rem; min-height: var(--space-xl); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: var(--space-sm) var(--space-md); margin-bottom: var(--space-sm); }
  .row { display: flex; flex-direction: column; gap: var(--space-xs); font-size: 0.82rem; }
  .row > span { color: var(--text-muted); font-weight: 600; }
  input[type='text'], input[type='number'], input[type='search'], input[type='date'], input[type='datetime-local'], select {
    min-height: var(--touch-target);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
  }
  input[type='range'] { accent-color: var(--hydro); }
  input[type='checkbox'], input[type='radio'] { width: var(--space-md); height: var(--space-md); accent-color: var(--hydro); }
  .values { list-style: none; margin: 0; padding: 0; max-height: 40dvh; overflow: auto; border: 1px solid var(--border-light); border-radius: var(--radius-sm); }
  .value { display: flex; align-items: center; gap: var(--space-sm); padding: 0 var(--space-sm); min-height: var(--touch-target); font-size: 0.82rem; }
  .value:hover { background: var(--bg-page); }
  .value__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .value__count { color: var(--text-muted); font-size: 0.72rem; }
  .spacer { flex: 1; }
  .btn--danger { color: var(--red-text); }
</style>
