> Status: ACTIVE — the docs index.

# docs — index

Entry point to the data-viz-tool documentation. Three layers: the rules
(`CLAUDE.md`), the living references (this directory), and dated records
(`records/`). Start at the top and descend only as far as your question needs.

```
L0  CLAUDE.md ..................... rules, stack, architecture tree (repo root)
    docs/README.md ................ this index
L1  src/lib/core/types.ts ......... THE contract (code); narrated in docs/VIZSPEC.md
L2  living references ............. the table below
L3  docs/records/<lane>/ .......... dated records: decision cards, findings, results, handoffs
    docs/shards/S<n>.md ........... the shard prompts (frozen when the shard launches)
```

## Status-header convention (standing rule for new docs)

Every doc gets a status banner as its first line, so its lifecycle is legible
without opening it:

```
> Status: ACTIVE | RECORD (frozen <date>) | SUPERSEDED-BY <path> | ARCHIVED
```

- **ACTIVE** — living reference or in-flight plan; keep current (`/sync-docs`).
- **RECORD (frozen `<date>`)** — a point-in-time record (decision card,
  finding, result, handoff). Frozen at the date; cited, not edited.
- **SUPERSEDED-BY `<path>`** — replaced; the pointer names the successor and
  must resolve on the tree. Kept for history; do not act on it.
- **ARCHIVED** — executed or retired; citable, drives nothing.

An un-bannered file under `records/` reads as `RECORD`. Only assert a status
you verified; a wrong banner is worse than none.

## L2 — living references

| Path | Status | Area |
|---|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | ACTIVE — skeleton until S6 | Module map, data flow, worker protocol, state, mobile layout, §9 performance budgets |
| [`VIZSPEC.md`](VIZSPEC.md) | ACTIVE | The contract narrated: every `VizSpec` field, one JSON example per chart type, `queryOf` and the URL codec |
| [`TABLEAU-SPEC.md`](TABLEAU-SPEC.md) | ACTIVE | Tableau semantics replicated: types and inference, roles, continuity, aggregations, date hierarchy, sort, filters, the number/date format dialog, Show Me; documented deviations |
| [`CHARTS.md`](CHARTS.md) | ACTIVE | The 39 chart types: ECharts series, minimum shelves, channels, transforms, edge cases; Show Me priority; dual axis, decorations, maps, icons |
| [`PALETTES.md`](PALETTES.md) | ACTIVE | The palette registry: every id, construction, validation status, Observatory name-matching, how the Color shelf resolves |
| [`DECISIONS.md`](DECISIONS.md) | ACTIVE | Owner rulings D-1…D-12 verbatim; out-of-scope ledger |
| [`records/README.md`](records/README.md) | ACTIVE | Record types and naming |
| [`../CHANGELOG.md`](../CHANGELOG.md) | ACTIVE | One entry per merged lane |
| [`../CONVENTIONS.md`](../CONVENTIONS.md) | ACTIVE | Naming, imports, git, dependencies |

## L3 — records and shards

| Class | Where | Naming |
|---|---|---|
| Decision cards, findings, pre-commits, results, handoffs | [`records/<lane>/`](records/) | `<TYPE>-<topic>-<date>.md`, see [`records/README.md`](records/README.md) |
| Shard prompts S1–S6 | [`shards/`](shards/) | `S<n>.md`; frozen at launch, the pinned SHA is inside |

## Newcomer path

1. [`../README.md`](../README.md) — what it is, how to run it.
2. [`../CLAUDE.md`](../CLAUDE.md) — the rules and the tree.
3. [`VIZSPEC.md`](VIZSPEC.md) — the contract.
4. [`TABLEAU-SPEC.md`](TABLEAU-SPEC.md), [`CHARTS.md`](CHARTS.md), [`PALETTES.md`](PALETTES.md) — what the app must do.
5. [`ARCHITECTURE.md`](ARCHITECTURE.md) — how it does it.
