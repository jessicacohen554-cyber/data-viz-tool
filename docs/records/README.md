> Status: ACTIVE — record types and naming (rule 16 `[R-RECORDS]`).

# docs/records — session records

Point-in-time records, one directory per lane. A record is frozen the day it
is written: cited, never rewritten (a correction is a new record that cites
the old one). Git history is the record for anything pruned.

## Path

```
docs/records/<lane>/<TYPE>-<topic>-<date>.md
```

- `<lane>` — the shard or lane id in lowercase: `s0` … `s6` for the build
  shards, then the branch's lane token (`claude/<lane>` → `<lane>`), or
  `governance` for cross-lane rulings.
- `<TYPE>` — one of the five below, uppercase.
- `<topic>` — kebab-case, ≤ 5 words, the thing decided or found.
- `<date>` — `YYYY-MM-DD` the record was frozen.

Every record opens with the status banner from `docs/README.md`
(`> Status: RECORD (frozen <date>)`), then **For / From** (who it is for,
which lane wrote it), then what was *not* done (no code change, no data
change …) so silence is never read as absence.

## Types

| TYPE | When | Must contain |
|---|---|---|
| `DECISION-CARD` | A choice the lane may not take itself (anything that changes the contract, a dataset, a workflow, a rule, or a Tableau semantic) | The question in one line; the options with their measured cost; the lane's recommendation; what a ruling would need to say. The owner's ruling, once given, is copied **verbatim** into `docs/DECISIONS.md` and cited by `D-n` |
| `FINDING` | Something measured or discovered that others will act on (a bug class, an ambiguity, a perf number, a data defect) | How it was measured (command, fixture, SHA); the numbers; what it does and does not imply |
| `PRECOMMIT` | Before a run or change whose outcome will be judged (a perf budget run, a palette re-validation, a data conversion) | The hypothesis and the pass/fail criteria, written **before** the result |
| `RESULT` | After it | The numbers against the PRECOMMIT criteria; the SHA; where the artifacts are |
| `HANDOFF` | A lane stops and another continues | HEAD SHA, owned files touched, test counts, open seams, forbidden actions carried forward |

A shard's required report (rule 14 `[R-SHARD]`) is a `HANDOFF` when it is
written to the tree; otherwise it lives in the session transcript and the
parent's `CHANGELOG.md` entry cites the branch SHA.
