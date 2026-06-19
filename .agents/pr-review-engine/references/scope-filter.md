# Markdown documentation-example filter

Reference for Step 6 of `SKILL.md`. The deterministic implementation is in `scripts/validate-findings.ts`; this file documents the rules.

## Why this filter exists

A common false positive: an agent flags `OPENAI_API_KEY=sk-...` or `_authToken=...` inside a Markdown code fence that's *demonstrating what NOT to do*. The string looks like a secret to a regex-driven secret scanner, but it's pedagogical content, not a leaked credential.

This filter drops those findings — but only when *all three* of these hold:

1. `finding.file` ends in `.md`.
2. `finding.description` matches one of the FP-suspect patterns (case-insensitive): `secret`, `API key`, `token`, `password`, `_authToken`, `eval(`, `dangerouslySetInnerHTML`, `private key`, `mnemonic`.
3. `finding.line` falls **inside** a fenced code block in the file.

If any of (1) (2) (3) is false, the finding survives.

## Detecting the fence

Read the file. Walk lines `1..(finding.line - 1)` (stop one line short — a finding cited ON a fence line itself is treated as outside the block, not inside). Count fence markers, where a fence marker is a line whose first three non-whitespace characters are either:

- Triple backtick (CommonMark standard).
- `~~~` (CommonMark tilde fence — used to embed triple-backticks inside an example).

The rule must cover both or it silently misses tilde-fenced examples — that is a real regression we've shipped before.

If the count is odd, `finding.line` is inside a fenced block → drop and increment `DROPPED_DOC_EXAMPLE`.

## Known limitations (intentional)

- **Indented code blocks (4-space)** are NOT detected — a secret-shaped string in an indented block survives the filter. Rare in practice; flag for follow-up if metrics show the false-positive rate matters.
- **Unclosed fences** (odd fence count at EOF — common in partial drafts) cause everything after the unclosed fence to read as "inside a block". The filter may over-drop. Accepted trade-off; the audit section surfaces the drop for user review.
- A real hardcoded secret in a `.md` outside a code fence (rare but possible) is preserved as a real finding.

## What this filter does NOT do

- It does **not** look at the surrounding language label (` ```bash`, ` ```env`). A fence is a fence regardless of language. Adding language-specific logic ("only drop inside `env` fences") would help precision but is not implemented; the current filter is deliberately simple.
- It does **not** look at the `description` for "example" / "do not do this" wording. Agents are inconsistent about flagging examples; we drop based on file shape + content shape, not on the agent's prose.

## Implementation pointer

`scripts/validate-findings.ts` carries the regex set, the fence-walking logic, and the `DROPPED_DOC_EXAMPLE` counter. The Vitest test `drops a finding inside a tilde fence` in `scripts/validate-findings.test.ts` locks in the CommonMark `~~~` support so future edits don't silently regress.
