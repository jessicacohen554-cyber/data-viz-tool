/**
 * The query effect pipeline (shard S5): `spec.value` → `queryOf()` → canonical
 * `queryKey` → `client.query(plan)` → `result`. The effect is keyed on the key
 * string, so a change that only touches render settings (chart type, marks,
 * axes, formats, palette, title) never reaches the worker (plan §9). A result
 * that arrives after a newer query was issued is dropped.
 *
 * The decision logic lives in `submit()`, a plain function the `$effect`
 * calls, so it is unit-testable with a counting fake client under Vitest's
 * server-side Svelte runtime (where effects do not run). Svelte runes store;
 * pure modules never import this file.
 */
import { untrack } from 'svelte';
import type { DatasetEntry, QueryPlan, QueryResult, VizSpec } from '../core/types';
import { QUERY_LIMIT_DESKTOP, QUERY_LIMIT_MOBILE } from '../core/constants';
import { queryKey, queryOf, type ChartNeeds } from '../core/query-of';
import { needsFor } from '../charts/registry';
import type { DataClient } from '../data/data-client';
import { spec as specSingleton, type SpecStore } from './spec.svelte';
import { dataset as datasetSingleton } from './dataset.svelte';
import { ui } from './ui.svelte';

/** Dependencies, injectable for tests. */
export interface QueryStoreDeps {
  client: DataClient;
  spec: SpecStore;
  /** Load state: a query runs only when the dataset the spec names is loaded. */
  dataset: { readonly ready: boolean; readonly entry: DatasetEntry | null };
  /** Plan features the spec's chart type needs (boxstats, disaggregation); defaults to the registry's `needsFor`. */
  needsOf?: (spec: VizSpec) => ChartNeeds;
  /** Result cap; defaults to the desktop/phone constants by viewport. */
  limit?: () => number;
}

/** A plan with its canonical key, or null when nothing should run. */
export interface PlannedQuery {
  plan: QueryPlan;
  key: string;
}

/** Store API consumed by the chart canvas, the export menu and the dialogs. */
export interface QueryStore {
  /** Latest result for the current key; null before the first result or when nothing runs. */
  readonly result: QueryResult | null;
  /** True while the worker is computing the current key. */
  readonly pending: boolean;
  /** Message of the last failed query; null when the last one succeeded. */
  readonly error: string | null;
  /** The plan behind `result` / the query in flight. */
  readonly plan: QueryPlan | null;
  /** `queryKey(plan)` of the query in flight or last completed. */
  readonly key: string | null;
  /**
   * Derive the plan for `spec` and run it unless its key equals the current
   * one. Returns the key that is now current (null = nothing to run). The
   * reactive pipeline calls this; tests call it directly.
   */
  submit(spec: VizSpec, ready: boolean, datasetId: string | null): string | null;
  /** Start the reactive pipeline; returns a stop function. */
  start(): () => void;
}

function isStale(e: unknown): boolean {
  return Boolean(e && typeof e === 'object' && (e as { stale?: unknown }).stale === true);
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/**
 * Plan features for the spec's chart type, refined by its pills (S3 seam 3:
 * scatter/bubble/parallel disaggregate only without a grouping dimension).
 */
export function registryNeeds(spec: VizSpec): ChartNeeds {
  return needsFor(spec);
}

/**
 * The plan for `spec`, or null when the dataset is not loaded, names another
 * dataset, or no pill contributes to a query (an empty worksheet has nothing
 * to aggregate; the text table then shows raw rows through `client.rows`).
 */
export function planFor(
  spec: VizSpec,
  ready: boolean,
  datasetId: string | null,
  needsOf: (spec: VizSpec) => ChartNeeds,
  limit: number,
): PlannedQuery | null {
  if (!ready || !datasetId || spec.datasetId !== datasetId) return null;
  const plan = queryOf(spec, needsOf(spec), limit);
  if (plan.dims.length === 0 && plan.measures.length === 0) return null;
  return { plan, key: queryKey(plan) };
}

/** Create a store. Exported for tests; the app uses the singleton `query`. */
export function createQueryStore(deps: QueryStoreDeps): QueryStore {
  const needsOf = deps.needsOf ?? registryNeeds;
  const limit = deps.limit ?? (() => (ui.isMobile ? QUERY_LIMIT_MOBILE : QUERY_LIMIT_DESKTOP));

  let result = $state<QueryResult | null>(null);
  let pending = $state(false);
  let error = $state<string | null>(null);
  let plan = $state<QueryPlan | null>(null);
  let key = $state<string | null>(null);
  /** Monotonic id of the latest query issued; replies from older ids are dropped. */
  let seq = 0;

  function run(planned: PlannedQuery | null): string | null {
    if (!planned) {
      if (key !== null || result !== null) { key = null; plan = null; result = null; pending = false; error = null; }
      seq++;
      return null;
    }
    if (planned.key === key) return key;
    key = planned.key;
    plan = planned.plan;
    pending = true;
    error = null;
    const mine = ++seq;
    // The plan shares `filters` / `date` / `bin` with the `$state` spec; `postMessage` cannot clone a proxy.
    deps.client.query($state.snapshot(planned.plan) as QueryPlan).then(
      (r) => {
        if (mine !== seq) return;
        result = r;
        pending = false;
      },
      (e: unknown) => {
        if (mine !== seq || isStale(e)) return;
        error = messageOf(e);
        pending = false;
      },
    );
    return key;
  }

  function submit(spec: VizSpec, ready: boolean, datasetId: string | null): string | null {
    return run(planFor(spec, ready, datasetId, needsOf, limit()));
  }

  function start(): () => void {
    return $effect.root(() => {
      // A string derived: the effect below re-runs only when the canonical key changes.
      const planned = $derived.by(() =>
        planFor(deps.spec.value, deps.dataset.ready, deps.dataset.entry?.id ?? null, needsOf, limit()));
      const currentKey = $derived(planned?.key ?? null);
      $effect(() => {
        currentKey;
        untrack(() => run(planned));
      });
    });
  }

  return {
    get result() { return result; },
    get pending() { return pending; },
    get error() { return error; },
    get plan() { return plan; },
    get key() { return key; },
    submit,
    start,
  };
}

/** App-wide singleton; `App.svelte` calls `query.start()` once on mount. */
export const query: QueryStore = createQueryStore({
  client: datasetSingleton.client,
  spec: specSingleton,
  dataset: datasetSingleton,
});
