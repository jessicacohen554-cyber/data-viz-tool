<script lang="ts" module>
  import type { Annotation } from '$core/types';
  import { newId } from '$core/spec-defaults';
  import type { AnnotationAnchor } from '$stores/ui.svelte';

  /** Default text-box offset from the anchor (px): above and to the right of the mark. */
  export const DEFAULT_OFFSET: [number, number] = [12, -24];

  /** Offset bounds (px) for the dx / dy inputs. */
  export const OFFSET = { min: -400, max: 400 } as const;

  /** A new annotation at `anchor` with `text` (trimmed). */
  export function newAnnotation(anchor: AnnotationAnchor, text: string): Annotation {
    const a: Annotation = { id: newId(), text: text.trim(), x: anchor.x, offset: [...DEFAULT_OFFSET] };
    if (anchor.y !== undefined) a.y = anchor.y;
    if (anchor.seriesKey !== undefined) a.seriesKey = anchor.seriesKey;
    return a;
  }

  /** Where an annotation sits, for the list: `zone West · 42 · Series A`. */
  export function describeAnchor(a: Pick<Annotation, 'x' | 'y' | 'seriesKey'>): string {
    const parts = [typeof a.x === 'number' ? String(a.x) : a.x];
    if (a.y !== undefined) parts.push(String(a.y));
    if (a.seriesKey) parts.push(a.seriesKey);
    return parts.join(' · ');
  }
</script>

<script lang="ts">
  /**
   * Annotation editor (T4, D-16): a text note pinned to a mark. Opened from
   * `ChartCanvas`'s mark click with a `pending` anchor (T2 ships the event;
   * stub-safe: with `pending === null` and no `editId` the dialog is the list
   * panel), or on an existing annotation by `editId`. Add / edit text, nudge
   * the offset, delete; the list lets every annotation be reopened. Each
   * write is one `spec.patch` on `VizSpec.annotations` (R-SPEC). Tokens only
   * (R-TOKENS). The chart layer draws them (T2).
   */
  import { spec } from '$stores/spec.svelte';
  import Dialog from './Dialog.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
    /** A clicked mark awaiting text; null when none. */
    pending: AnnotationAnchor | null;
    /** An existing annotation to edit; null when none. */
    editId?: string | null;
  }

  let { open, onclose, pending, editId = null }: Props = $props();

  const annotations = $derived(spec.value.annotations);
  let selectedId = $state<string | null>(null);
  const editing = $derived(annotations.find((a) => a.id === selectedId) ?? null);
  let draft = $state('');

  // Seed the editor whenever it opens on a (new) target.
  $effect(() => {
    if (!open) return;
    selectedId = editId;
    draft = editId ? (spec.value.annotations.find((a) => a.id === editId)?.text ?? '') : '';
  });

  function add(): void {
    if (!pending || !draft.trim()) return;
    const a = newAnnotation(pending, draft);
    spec.patch((d) => { d.annotations.push(a); });
    draft = '';
    onclose();
  }

  function saveText(): void {
    const id = selectedId;
    const text = draft.trim();
    if (!id || !text) return;
    spec.patch((d) => { const a = d.annotations.find((x) => x.id === id); if (a) a.text = text; });
  }

  function remove(id: string): void {
    spec.patch((d) => { d.annotations = d.annotations.filter((x) => x.id !== id); });
    if (selectedId === id) { selectedId = null; draft = ''; }
  }

  function select(id: string): void {
    selectedId = id;
    draft = annotations.find((a) => a.id === id)?.text ?? '';
  }

  function setOffset(i: 0 | 1, raw: string): void {
    const id = selectedId;
    const n = Math.round(Number(raw));
    if (!id || !Number.isFinite(n)) return;
    const v = Math.max(OFFSET.min, Math.min(OFFSET.max, n));
    spec.patch((d) => { const a = d.annotations.find((x) => x.id === id); if (a) a.offset[i] = v; });
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (pending && !editing) add(); else saveText(); }
  }
</script>

<Dialog {open} {onclose} title={pending && !editing ? 'Add annotation' : editing ? 'Edit annotation' : 'Annotations'} width="md">
  {#snippet footer()}
    {#if pending && !editing}
      <button type="button" class="btn btn--primary" onclick={add} disabled={!draft.trim()}>Add</button>
    {:else if editing}
      <button type="button" class="btn" onclick={() => remove(editing.id)}>Delete</button>
      <button type="button" class="btn btn--primary" onclick={() => { saveText(); onclose(); }} disabled={!draft.trim()}>Save</button>
    {:else}
      <button type="button" class="btn btn--primary" onclick={onclose}>Done</button>
    {/if}
  {/snippet}

  {#if pending && !editing}
    <p class="muted">Pinned to <span class="num">{describeAnchor(pending)}</span>.</p>
    <textarea class="text" aria-label="Annotation text" rows="3" placeholder="Note…" bind:value={draft} onkeydown={onkeydown}></textarea>
  {:else if editing}
    <p class="muted">Pinned to <span class="num">{describeAnchor(editing)}</span>.</p>
    <textarea class="text" aria-label="Annotation text" rows="3" bind:value={draft} onkeydown={onkeydown} onchange={saveText}></textarea>
    <div class="inline">
      <label class="row"><span>Offset x</span><input type="number" class="num" min={OFFSET.min} max={OFFSET.max} step="1" aria-label="Offset x" value={editing.offset[0]} onchange={(e) => setOffset(0, e.currentTarget.value)} /></label>
      <label class="row"><span>Offset y</span><input type="number" class="num" min={OFFSET.min} max={OFFSET.max} step="1" aria-label="Offset y" value={editing.offset[1]} onchange={(e) => setOffset(1, e.currentTarget.value)} /></label>
    </div>
  {:else if !pending}
    <p class="muted">Click a mark on the chart to pin a note to it.</p>
  {/if}

  {#if annotations.length}
    <section class="list" aria-label="Annotations">
      <h3 class="eyebrow">All annotations</h3>
      <ul class="list__items">
        {#each annotations as a (a.id)}
          <li class="list__item" class:list__item--active={a.id === selectedId}>
            <button type="button" class="list__select" data-annotation={a.id} onclick={() => select(a.id)}>
              <span class="list__text">{a.text}</span>
              <span class="list__where num">{describeAnchor(a)}</span>
            </button>
            <button type="button" class="list__remove" aria-label="Delete annotation {a.text}" onclick={() => remove(a.id)}>✕</button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</Dialog>

<style>
  .muted { color: var(--text-muted); font-size: 0.82rem; margin: 0 0 var(--space-sm); }
  .text {
    width: 100%;
    min-height: calc(2 * var(--touch-target));
    padding: var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    resize: vertical;
  }
  .inline { display: flex; flex-wrap: wrap; gap: var(--space-sm) var(--space-md); margin-top: var(--space-sm); font-size: 0.82rem; }
  .row { display: flex; flex-direction: column; gap: var(--space-xs); }
  .row > span { color: var(--text-muted); font-weight: 600; }
  input[type='number'] { width: 6rem; min-height: var(--touch-target); padding: var(--space-xs) var(--space-sm); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); }
  .list { margin-top: var(--space-md); font-size: 0.82rem; }
  .list__items { list-style: none; margin: var(--space-sm) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-xs); }
  .list__item { display: flex; align-items: stretch; gap: var(--space-xs); border: 1px solid var(--border-light); border-radius: var(--radius-sm); background: var(--bg-card); }
  .list__item--active { border-color: var(--hydro); box-shadow: 0 0 0 1px var(--hydro); }
  .list__select { flex: 1; display: flex; flex-direction: column; gap: 2px; min-height: var(--touch-target); padding: var(--space-xs) var(--space-sm); text-align: left; color: var(--text-secondary); min-width: 0; }
  .list__select:hover { background: var(--bg-page); }
  .list__text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .list__where { font-size: 0.72rem; color: var(--text-muted); }
  .list__remove { width: var(--touch-target); min-height: var(--touch-target); color: var(--text-muted); border-radius: var(--radius-sm); }
  .list__remove:hover { background: var(--bg-page); color: var(--red-text); }
  .btn:disabled { opacity: 0.45; cursor: default; }
</style>
