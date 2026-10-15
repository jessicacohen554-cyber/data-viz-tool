<script lang="ts" module>
  import type { FormatSpec } from '$core/types';

  /** What the dialog edits: one pill's override, or the field default in `fieldFormats`. */
  export type FormatTarget = { kind: 'pill'; pillId: string } | { kind: 'field'; field: string };

  /** Tableau's standard date patterns offered as presets (docs/TABLEAU-SPEC.md §8.1). */
  export const DATE_PRESETS: readonly string[] = [
    'yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 'MMM d, yyyy', 'MMMM d, yyyy', 'ddd, MMM d, yyyy',
    'MMM yyyy', 'yyyy', 'Q yyyy', 'HH:mm', 'h:mm a', 'yyyy-MM-dd HH:mm', 'MMM d, yyyy h:mm a',
  ];

  /** Format kinds in dialog order for a numeric field, a date field and a boolean field. */
  export const NUMBER_KINDS: readonly FormatSpec['kind'][] = ['automatic', 'number', 'currency', 'percent', 'scientific', 'custom'];
  export const DATE_KINDS: readonly FormatSpec['kind'][] = ['automatic', 'date'];
  export const BOOLEAN_KINDS: readonly FormatSpec['kind'][] = ['automatic', 'boolean'];

  /** Decimals allowed by the contract (`FormatSpec.decimals` 0..10). */
  export const MAX_DECIMALS = 10;

  /** Drop undefined and empty-string options so a stored spec carries only what the user set. */
  export function compactFormat(spec: FormatSpec): FormatSpec {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(spec)) {
      if (v === undefined || v === '') continue;
      out[k] = v;
    }
    return out as unknown as FormatSpec;
  }
</script>

<script lang="ts">
  /**
   * Format dialog (shard S5): Tableau's number / date / boolean format dialog
   * (docs/TABLEAU-SPEC.md §7–8) with a live preview through `makeFormatter`.
   * Edits a draft; Apply writes `Pill.format` or `VizSpec.fieldFormats[field]`
   * through `spec.patch` (one undo step); Reset returns the target to Automatic.
   */
  import type { FieldMeta } from '$core/types';
  import { autoFormat, makeFormatter } from '$format/formatter';
  import { spec } from '$stores/spec.svelte';
  import { dataset } from '$stores/dataset.svelte';
  import Dialog from './Dialog.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
    target: FormatTarget | null;
  }

  let { open, onclose, target }: Props = $props();

  const field = $derived.by((): string | null => {
    if (!target) return null;
    if (target.kind === 'field') return target.field;
    return spec.findPill(target.pillId)?.pill.field ?? null;
  });
  const meta = $derived<FieldMeta | undefined>(field ? dataset.meta.find((m) => m.name === field) : undefined);
  const current = $derived.by((): FormatSpec | undefined => {
    if (!target || !field) return undefined;
    if (target.kind === 'pill') return spec.findPill(target.pillId)?.pill.format ?? spec.value.fieldFormats[field];
    return spec.value.fieldFormats[field];
  });
  const kinds = $derived.by((): readonly FormatSpec['kind'][] => {
    const t = meta?.type;
    if (t === 'date' || t === 'datetime') return DATE_KINDS;
    if (t === 'boolean') return BOOLEAN_KINDS;
    if (t === 'string') return ['automatic'];
    return NUMBER_KINDS;
  });

  let draft = $state<FormatSpec>({ kind: 'automatic' });

  // Re-seed the draft whenever the dialog opens on a (new) target.
  $effect(() => {
    if (!open) return;
    const base = current ?? (meta ? autoFormat(meta) : { kind: 'automatic' as const });
    draft = { ...base };
  });

  const samples = $derived.by((): Array<number | string | boolean | null> => {
    const t = meta?.type;
    if (t === 'date' || t === 'datetime') {
      const out: number[] = [];
      if (meta?.min !== null && meta?.min !== undefined) out.push(meta.min);
      if (meta?.max !== null && meta?.max !== undefined) out.push(meta.max);
      return out.length ? out : [Date.UTC(2024, 1, 5, 14, 7, 9)];
    }
    if (t === 'boolean') return [true, false, null];
    if (t === 'string') return (meta?.topValues ?? []).slice(0, 3).map(([l]) => l);
    const out: Array<number | null> = [1234567.891, -1234.5, 0.1234, 0, null];
    if (meta?.max !== null && meta?.max !== undefined) out.unshift(meta.max);
    return out;
  });

  const preview = $derived.by(() => {
    if (!meta) return [];
    try {
      const fmt = makeFormatter(meta, compactFormat(draft));
      return samples.map((v) => ({ raw: v, text: fmt(v) }));
    } catch (e) {
      return [{ raw: null, text: `⚠ ${e instanceof Error ? e.message : String(e)}` }];
    }
  });

  const showNumberOptions = $derived(draft.kind === 'number' || draft.kind === 'currency' || draft.kind === 'percent');

  function setKind(kind: FormatSpec['kind']): void {
    draft = { ...draft, kind };
    if (kind === 'currency' && !draft.currency) draft.currency = 'USD';
    if (kind === 'date' && !draft.datePattern) draft.datePattern = DATE_PRESETS[0];
    if (kind === 'boolean' && !draft.booleanLabels) draft.booleanLabels = ['True', 'False'];
  }

  function write(value: FormatSpec | undefined): void {
    if (!target || !field) return;
    const f = field;
    spec.patch((d) => {
      if (target.kind === 'pill') {
        for (const shelf of Object.values(d.shelves)) {
          const p = shelf.find((pp) => pp.id === target.pillId);
          if (p) { if (value) p.format = value; else delete p.format; return; }
        }
      } else if (value) {
        d.fieldFormats[f] = value;
      } else {
        delete d.fieldFormats[f];
      }
    });
  }

  function apply(): void {
    const compact = compactFormat(draft);
    const isDefault = compact.kind === 'automatic' && Object.keys(compact).length === 1;
    write(isDefault ? undefined : compact);
    onclose();
  }

  function reset(): void {
    write(undefined);
    onclose();
  }

  function clampDecimals(v: string): number | undefined {
    if (v === '') return undefined;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(MAX_DECIMALS, n)) : undefined;
  }

  function onboolLabel(i: 0 | 1, v: string): void {
    const cur: [string, string] = draft.booleanLabels ?? ['True', 'False'];
    const next: [string, string] = [cur[0], cur[1]];
    next[i] = v;
    draft.booleanLabels = next;
  }
</script>

<Dialog {open} {onclose} title={target?.kind === 'pill' ? `Format pill · ${field ?? ''}` : `Default format · ${field ?? ''}`} width="md">
  {#snippet footer()}
    <button type="button" class="btn" onclick={reset}>Reset to automatic</button>
    <button type="button" class="btn btn--primary" onclick={apply} disabled={!meta}>Apply</button>
  {/snippet}

  {#if !meta}
    <p class="muted">This field is not in the loaded dataset.</p>
  {:else}
    <p class="scope muted">
      {#if target?.kind === 'pill'}Applies to this pill only; the field default stays.{:else}Applies to every pill of <strong>{field}</strong> without its own format.{/if}
    </p>

    <div class="grid">
      <label class="row">
        <span>Kind</span>
        <select value={draft.kind} onchange={(e) => setKind(e.currentTarget.value as FormatSpec['kind'])}>
          {#each kinds as k (k)}<option value={k}>{k === 'automatic' ? 'Automatic' : k.charAt(0).toUpperCase() + k.slice(1)}</option>{/each}
        </select>
      </label>

      {#if showNumberOptions || draft.kind === 'scientific'}
        <label class="row">
          <span>Decimals</span>
          <input type="number" min="0" max={MAX_DECIMALS} step="1" value={draft.decimals ?? ''} placeholder="auto"
            oninput={(e) => { draft.decimals = clampDecimals(e.currentTarget.value); }} />
        </label>
      {/if}

      {#if showNumberOptions}
        <label class="row row--check">
          <input type="checkbox" checked={draft.thousands ?? true} onchange={(e) => { draft.thousands = e.currentTarget.checked; }} />
          <span>Thousands separator</span>
        </label>
        {#if draft.kind !== 'percent'}
          <label class="row">
            <span>Units</span>
            <select value={draft.units ?? 'none'} onchange={(e) => { draft.units = e.currentTarget.value as FormatSpec['units']; }}>
              <option value="none">None</option><option value="K">Thousands (K)</option><option value="M">Millions (M)</option><option value="B">Billions (B)</option><option value="auto">Auto (per axis)</option>
            </select>
          </label>
          <label class="row">
            <span>Negative</span>
            <select value={draft.negative ?? '-'} onchange={(e) => { draft.negative = e.currentTarget.value as FormatSpec['negative']; }}>
              <option value="-">-1234</option><option value="()">(1234)</option><option value="red">1234 in red</option><option value="-red">-1234 in red</option>
            </select>
          </label>
        {/if}
      {/if}

      {#if draft.kind === 'number'}
        <label class="row"><span>Prefix</span><input type="text" value={draft.prefix ?? ''} oninput={(e) => { draft.prefix = e.currentTarget.value; }} /></label>
        <label class="row"><span>Suffix</span><input type="text" value={draft.suffix ?? ''} oninput={(e) => { draft.suffix = e.currentTarget.value; }} /></label>
      {/if}

      {#if draft.kind === 'currency'}
        <label class="row"><span>Currency</span><input type="text" maxlength="3" class="mono" value={draft.currency ?? 'USD'} oninput={(e) => { draft.currency = e.currentTarget.value.toUpperCase(); }} /></label>
      {/if}

      {#if draft.kind === 'custom'}
        <label class="row row--wide">
          <span>Format string</span>
          <input type="text" class="mono" placeholder="#,##0.00;(#,##0.00)" value={draft.custom ?? ''} oninput={(e) => { draft.custom = e.currentTarget.value; }} />
        </label>
      {/if}

      {#if draft.kind === 'date'}
        <label class="row">
          <span>Preset</span>
          <select value={DATE_PRESETS.includes(draft.datePattern ?? '') ? draft.datePattern : ''} onchange={(e) => { if (e.currentTarget.value) draft.datePattern = e.currentTarget.value; }}>
            <option value="">Custom…</option>
            {#each DATE_PRESETS as p (p)}<option value={p}>{p}</option>{/each}
          </select>
        </label>
        <label class="row row--wide">
          <span>Pattern</span>
          <input type="text" class="mono" value={draft.datePattern ?? ''} oninput={(e) => { draft.datePattern = e.currentTarget.value; }} />
        </label>
      {/if}

      {#if draft.kind === 'boolean'}
        <label class="row"><span>True label</span><input type="text" value={draft.booleanLabels?.[0] ?? 'True'} oninput={(e) => onboolLabel(0, e.currentTarget.value)} /></label>
        <label class="row"><span>False label</span><input type="text" value={draft.booleanLabels?.[1] ?? 'False'} oninput={(e) => onboolLabel(1, e.currentTarget.value)} /></label>
      {/if}

      {#if draft.kind !== 'automatic' && draft.kind !== 'boolean' && draft.kind !== 'date'}
        <label class="row"><span>Locale</span><input type="text" placeholder="en-US" value={draft.locale ?? ''} oninput={(e) => { draft.locale = e.currentTarget.value; }} /></label>
      {/if}
    </div>

    <section class="preview" aria-live="polite">
      <div class="eyebrow">Preview</div>
      <table class="preview__table">
        <tbody>
          {#each preview as row, i (i)}
            <tr>
              <td class="muted num">{row.raw === null ? 'null' : String(row.raw)}</td>
              <td class="num preview__out">{row.text}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</Dialog>

<style>
  .muted { color: var(--text-muted); font-size: 0.82rem; }
  .scope { margin: 0 0 var(--space-md); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--space-sm) var(--space-md); }
  .row { display: flex; flex-direction: column; gap: var(--space-xs); font-size: 0.82rem; }
  .row > span { color: var(--text-muted); font-weight: 600; }
  .row--check { flex-direction: row; align-items: center; gap: var(--space-sm); align-self: end; min-height: var(--touch-target); }
  .row--check > span { color: var(--text-secondary); font-weight: 500; }
  .row--wide { grid-column: 1 / -1; }
  input[type='text'], input[type='number'], select {
    min-height: var(--touch-target);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
  }
  input[type='checkbox'] { width: var(--space-md); height: var(--space-md); accent-color: var(--hydro); }
  .preview { margin-top: var(--space-md); padding: var(--space-sm) var(--space-md); border-radius: var(--radius-md); background: var(--bg-page); }
  .preview__table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  .preview__table td { padding: 2px 0; }
  .preview__out { text-align: right; color: var(--text-primary); }
</style>
