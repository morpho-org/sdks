# `CHANGED_LINES` build — edge cases

Engine ref: [`.agents/lib/scripts/build-changed-lines.ts`](../lib/scripts/build-changed-lines.ts). Consumed by [`.agents/lib/pr-review-base.md`](../lib/pr-review-base.md) Step 3 and the line-level filter in Step 6.

`CHANGED_LINES` is a JSON map `{ "<path>": [<line>, ...] }` where each line is a number that the diff added on the `+` side at unified=0. The presence/absence semantics are load-bearing — every line below is a finding-filtering decision.

## Hunk parsing

The parser walks `git diff --unified=0 <base>..<head>` and recognises:

- `diff --git a/<old> b/<new>` — start of a per-file section.
- `+++ b/<path>` — new (post-image) path. The script keys the map by this path.
- `+++ /dev/null` — the file is being deleted in the post-image; do not enter it in the map.
- `rename to <path>` — pure rename without content change (no `+++` follows); enter the new path with an empty array.
- `@@ -A,B +C,D @@` — hunk header. `C` is the starting line on the `+` side; `D` defaults to `1` when omitted.

For each hunk, the script appends the range `[C, C+D)` to the file's line list, then deduplicates and sorts at the end.

## Deletion-only hunks (`+0`)

A hunk shaped `@@ -A,B +C,0 @@` removes lines without adding any. The script emits **no entries** for that hunk — there is no `+` line for a finding to land on. If a file's diff is entirely deletion-only hunks, the file still appears in the map but with an empty `[]` array, the same as a pure rename.

Implication for the line-level filter: the empty-set short-circuit kicks in, and findings on the file are scoped only by `file_out_of_scope`. This is intentional — agents may legitimately flag a finding when a deletion creates a downstream problem in adjacent code that **was** changed by another hunk.

## Pure renames

`git diff --unified=0` emits:

```
diff --git a/old.ts b/new.ts
similarity index 100%
rename from old.ts
rename to new.ts
```

— and nothing else. The script captures the `b/` path from the `diff --git` line, then enters the **new** path with `[]` when it sees `rename to`. The old path does not appear in the map.

Implication: findings agents write against `new.ts` (the post-rename path) are kept if they have a plausible `line:` value; the line-level filter short-circuits on the empty set. Findings against `old.ts` are dropped as `file_out_of_scope`.

## File deletions

`+++ /dev/null` marks the file as deleted post-image. The script does not enter the deleted file in the map. Findings against a deleted file land in `dropped[]` with `drop_reason: file_out_of_scope` — there is no post-image line they could refer to.

## Mixed adds + renames

For renames with content changes (`similarity index <100%`), `git diff` emits the `rename to` line **plus** hunks against the new path. The script captures the rename target normally (so it gets at least the `[]` baseline), then the subsequent `+++ b/<path>` and hunks add the changed lines. The end state: the new path appears with the actual changed-line list.

## Non-goals

The parser is **not** authoritative for:

- Untracked / new-file detection beyond what `+++ b/<path>` already implies.
- Binary file diffs — these are silently ignored (no `+++` header). Findings against them are scoped by `file_out_of_scope` only; that's the engine's intent.
- Submodule changes — same as binary: no hunks, no entries, scope by file only.

If a future flag requires any of these to be tracked precisely, add a sibling script — do not overload `build-changed-lines.ts`.
