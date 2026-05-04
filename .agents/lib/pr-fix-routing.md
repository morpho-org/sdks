# pr-fix routing — per-category reply + resolve contract

Single source of truth for `/pr-fix`'s per-category routing. Invoked indirectly via:

- `/pr-fix` main flow Step 9 (uses `<HEAD_SHA>` in reply text)
- `/pr-fix --watch` watcher cycle Step 7 (uses `${CYCLE_HEAD_SHA}` in reply text — the SHA produced by THIS cycle's push, NOT a CronCreate-time value)

Do NOT invoke this file directly.

## The routing table

Step 5a of `/pr-fix` classifies each unresolved review thread into one of seven categories (plus a Mixed-purpose variant of actionable+fixed). Step 9 / watcher Step 7 implements one path per row below — do NOT collapse non-actionable categories into "skipped".

| Category (or variant) | Path | Exact reply text | Resolve thread? |
|---|---|---|---|
| **Actionable fix** (after Step 6 applies it) | reply + resolve | `Fixed in <HEAD_SHA> — <brief>` | yes |
| **Actionable fix** (skipped: low confidence, false positive, conflict) | reply only | `Skipped — <reason>. Leaving for human review.` | no |
| **Question / Clarification** | reply only | `Acknowledged — leaving for the author to answer.` | no |
| **Discussion / Opinion** | reply only | `Leaving this for human discussion.` | no |
| **Praise / Acknowledgment** | resolve only | (no reply) | yes |
| **Already addressed** | reply + resolve | `Already addressed in <SHA-or-current-code>.` | yes |
| **Stale / Inapplicable** | reply only | `Skipped — code referenced no longer exists at this location. Leaving for human review.` | no |
| **Mixed-purpose VARIANT** (Question + Actionable; Step 5a) | reply + resolve | `Fixed in <HEAD_SHA> — <brief>. (Re your question: <one-line answer>.)` | yes |

Reply text MUST match this column verbatim. The only intentional difference between main flow and watcher is `<HEAD_SHA>` → `${CYCLE_HEAD_SHA}` in the watcher's actionable+fixed and Mixed-purpose rows.

## Reply mechanism (one template)

Use heredoc-inline form for real newlines (not literal `\n`). Single-quoted heredoc tag prevents shell expansion inside the body — substitute placeholders by hand BEFORE the heredoc, or expand `${CYCLE_HEAD_SHA}` outside the heredoc and reference it as a captured value.

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments \
  --method POST \
  -F in_reply_to=<commentId> \
  -f body="$(cat <<'REPLY_EOF'
> <abbreviated original comment>

<reply text per the table above — substitute <HEAD_SHA> (or ${CYCLE_HEAD_SHA} in the watcher) and any per-finding fields (<brief>, <reason>, <SHA-or-current-code>, <one-line answer>) BEFORE this heredoc>
REPLY_EOF
)"
```

In the watcher, the actionable+fixed and Mixed-purpose rows ONLY fire when this cycle's Step 7e ran and `${CYCLE_HEAD_SHA}` is set. Non-actionable categories (praise, already-addressed via current-code, stale, question, discussion) MUST NOT reference `${CYCLE_HEAD_SHA}` — it may be unset on cycles where no fix was applied.

## Resolve mechanism (one template)

```bash
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread { isResolved }
    }
  }' -f threadId=<threadId>
```

Resolve fires for: actionable+fixed (incl. Mixed-purpose), praise, already-addressed.
Leave unresolved for: actionable+skipped, question, discussion, stale.

## Output contract (returned to caller)

Per processed thread, the caller (Step 9 main flow OR watcher Step 7) tracks:

- `<F>` — count of actionable+fixed (incl. Mixed-purpose) replies sent + threads resolved.
- `<SK>` — count of actionable+skipped replies sent.
- `<Q>` — count of question replies sent.
- `<D>` — count of discussion replies sent.
- `<P>` — count of praise threads resolved (no reply).
- `<A>` — count of already-addressed replies sent + threads resolved.
- `<ST>` — count of stale replies sent.
- `<R>` — total threads resolved (= `<F>` + `<P>` + `<A>`).

These bucket counts feed into the caller's terminal sentinel (`FIX_DONE_PR` for main flow, `WATCH_FIX_DONE` for watcher) and the Step 9.5 `RECONCILE_OK` sentinel.

## Smoke-test recipe

A maintainer changing this routing — adding a category, renaming a field, adjusting reply text — should run the recipe in `.agents/commands/AGENTS.md` (per-category routing smoke test). It exercises every row by posting eight throwaway threads and grepping for the exact reply text per row.
