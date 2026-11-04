# ADR-2026-11-02: ADRs carry no Status field

| Field      | Value       |
| ---------- | ----------- |
| **Date**   | 2026-11-02  |
| **Author** | @Foulks-Plb |
| **Scope**  | Repo-wide   |

_Frozen after merge; only superseded-by entries in References change._

## Context

Every ADR carried a Status row. An ADR is accepted by merging the PR that adds it, so a merged
record's Status could only truthfully read `accepted`, and a value that disagreed with the merge
(a record that landed still reading `proposed`) needed a follow-up PR that changed nothing but
that row. Status also held partial supersession, so one table cell accumulated a growing list of
other records' scope.

## Decision

An ADR has no Status field: a record present on the default branch is accepted, and its PR's merge
is the acceptance.

- The header has three fields: **Date**, **Author**, **Scope**.
- When a later ADR replaces all or part of a decision, the superseded record gains a References
  bullet naming the successor, for example `- <part> superseded by <ADR stem>.` or
  `- Superseded by <ADR stem>.` These bullets, a filename change and a repointed link path are the
  only edits allowed to a merged record.
- Existing records lose their Status row; any supersession it recorded moves into their References
  unchanged, and their italic notice is reworded to
  `_Frozen after merge; only superseded-by entries in References change._` (migrated records: `only
  superseded-by entries in References are maintained`).

This supersedes the Status header, the Status-only edit rule and the Status-row invariant of
ADR-2026-09-23-adr-structure. Its other rules stand.

## Invariants

- No record has a Status row → this check, run from the repository root, prints nothing:

  ```sh
  git grep -l '^| \*\*Status\*\* |' -- 'docs/adrs/*.md' docs/templates/ADR.md
  ```

- A merged record changes only by a superseded-by References bullet, its filename, or a renamed
  link path → PR review of any diff touching an existing `docs/adrs/ADR-*.md`.

## References

- ADR-2026-09-23-adr-structure — the ADR structure this amends.
