# Scope filter — path normalization + Markdown fence rule

Engine ref: [`.agents/lib/scripts/validate-findings.ts`](../lib/scripts/validate-findings.ts). Consumed by [`.agents/lib/pr-review-base.md`](../lib/pr-review-base.md) Step 6 (sub-steps 1 and 4).

This file documents the two non-obvious parts of the scope filter: how agent-reported paths are normalized before lookup in `CHANGED_LINES`, and how the Markdown documentation-example filter detects fenced code blocks.

## Path normalization (sub-step 1)

The agent may emit a `file` field in any of several shapes. Before comparing against `CHANGED_LINES` keys, the validator normalizes:

1. Strip a leading `./` if present.
2. Strip a leading `a/` or `b/` diff prefix if present.
3. (Repo-root absolute paths) — not currently stripped automatically. Agents that need to emit absolute paths should strip the repo-root prefix themselves; otherwise the finding lands in `file_out_of_scope`.

Comparison is **case-sensitive** to match git's default behaviour. POSIX-style forward slashes only — agents emitting Windows-style `\` separators fall through to `file_out_of_scope`, which is the intended signal (agents on this codebase run on Unix-y hosts).

## Markdown documentation-example filter (sub-step 4)

A `.md` file in `CHANGED_LINES` is in scope, but findings on lines inside a fenced code block usually flag example code that's intentionally illustrative — not a real bug. The validator drops those with `drop_reason: doc_example_fp` after the line-level filter has already kept the finding.

### Fence detection

The validator reads the post-image file content from the repo root and walks it line-by-line. A line is treated as a **fence delimiter** when (after stripping leading whitespace) it starts with three or more backticks (` ``` `) or three or more tildes (`~~~`).

State machine:

- **Not in fence:** seeing a fence delimiter opens a block; remember the start line (1-indexed) and the delimiter character.
- **In fence:** seeing a fence delimiter built from the **same** character closes the block. The block's range is `[start_line, close_line]` inclusive.
- **Unclosed at EOF:** the block extends to the last line of the file.

A finding's `line` is treated as "inside a fence" if it falls within any `[start, end]` range, inclusive of both endpoints. This is intentional — the fence delimiter lines themselves are part of the example and should not trigger findings either (e.g. an agent flagging "missing language tag" on the opening ` ``` ` line is exactly the noise this filter targets).

### Known limitations

- **Indented fenced blocks** (4+ space indent forming a code block without `` ``` ``) are not detected. They are rare in this repo's docs; if they become common, extend the detector to recognise them.
- **Same-character fences nested across files** are not a concern — fence state resets per file.
- **`<pre>`-tagged code blocks** (HTML-flavoured) are not detected. Authors writing examples in this repo use fenced blocks; if HTML-flavoured examples appear and produce false-positive findings, extend the detector with a `<pre>` recogniser.
- **Inline code spans** (single-backtick `` `like this` ``) are not blocks and do not trigger the filter. A finding on a single line that happens to contain an inline code span is kept.

If a doc author wants to flag a line inside a fenced block as a real finding (e.g. an example that's actually wrong), the right move is to fix the example so the finding goes away — not to weaken the filter.

## Sub-step ordering

The filter applies in this strict order (see `validateFindings` in `validate-findings.ts`):

1. **Schema check** — `WHAT:` / `FIX:` clauses, severity, line shape. Failures route to `failed[]` (counted in `FAILED_AGENTS`).
2. **File-out-of-scope** — file not in `CHANGED_LINES`. Drops to `dropped[]`.
3. **Line-pre-existing** — file in scope, but line outside `±TOLERANCE` of any changed line. Drops to `dropped[]` with `distance_to_nearest_changed_line`. Skipped if the file's changed-line set is empty (pure rename — see [`changed-lines.md`](./changed-lines.md)).
4. **Markdown doc-example FP** — `.md` file, line inside a fenced block. Drops to `dropped[]`.

The order matters: an agent that returns a finding on a deleted file with the wrong line and no `FIX:` clause is reported as `failed` (the schema check fires first), not silently routed to `file_out_of_scope`.
