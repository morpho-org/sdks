# Changed-lines build — edge cases

Reference for Step 3 of `SKILL.md`. The deterministic build is in `scripts/build-changed-lines.ts`; this file documents the rules the script implements so reviewers can adjust them.

## Standard hunk

For each `@@ -OLD,OLD_COUNT +NEW,NEW_COUNT @@` header that follows a `+++ b/<file>` line, add `{NEW, NEW+1, ..., NEW+NEW_COUNT-1}` to that file's set. When `NEW_COUNT` is omitted, treat it as `1`.

## Deletion-only hunks

A hunk header of the shape `@@ -OLD,N +NEW,0 @@` describes a pure deletion: `N` lines removed at `OLD`, zero lines added at `NEW`. The script adds line `NEW` to the file's set anyway — one line, the new-file line just above the deletion.

**Why.** The deletion itself is what made the surrounding code worse. The line just above is the right anchor for any adjacent-code finding ("this function now misbehaves because the early-return was removed two lines below"). Without this anchor, the line-level filter would drop every finding on a deletion-only diff as out-of-window.

## Pure renames

If git emits a `--- a/<file>` and `+++ b/<file>` pair with **no hunks at all** between them (typical for `R100` renames with no content change), the file's set stays empty.

Step 6's line-level filter short-circuits when the set is empty (see Step 6 sub-step 1 in `SKILL.md`) so adjacent-code findings still survive on a rename-only changed file via the file-level filter alone.

## Combined diffs (committed + uncommitted)

When `DIFF_SOURCE=local`, the script unions two diffs:

1. `git diff --unified=0 $MERGE_BASE..${HEAD_REF}` — committed lines.
2. `git diff --unified=0 HEAD` — staged + unstaged on top.

For files touched by both, the per-file set is the union. Don't try to track which lines came from which diff — agents reviewing the work-in-progress don't care, and the audit trail records the file-level provenance ("Including N uncommitted file(s) in the review.") already.

## Output shape

The script emits compact JSON to stdout:

```json
{
  "src/components/Foo.tsx": [12, 13, 14, 27],
  "src/utils/bar.ts": [45]
}
```

Pipe to `/tmp/changed-lines.json` (or any path the dispatcher chooses) and pass the path to `scripts/validate-findings.ts` via `--changed-lines`.

## Known limitations

- **Merge commits** with multiple parents produce combined-format hunks (`@@@` instead of `@@`). The current parser skips combined hunks silently. If your reviews regularly hit merge commits, extend the script to handle the combined-format syntax.
- **Renames with content changes** (`R<99` similarity) emit hunks against the new path only. The build follows the new path; agents that point at the old path will be dropped by the file-level filter.
