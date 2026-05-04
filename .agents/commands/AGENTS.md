# Slash-command authoring notes

This file is for maintainers of the slash commands under `.agents/commands/`. It is NOT loaded into the runtime prompt of any skill — keeping it here means the LLM doesn't pay token cost for reading governance every time a user invokes `/pr-review-ci` or `/pr-fix`.

## Active commands

- `/pr-review-ci` — CI review verdict (GitHub Actions context). Posts `APPROVE` / `REQUEST_CHANGES`.
- `/pr-review-gh` — Local PR review. Posts as `COMMENT`. Optional `--watch` for a 2-minute cron.
- `/pr-review-local` — Pre-PR local review. Terminal-only output. Optional `--fix` to apply fixes (refuses on dirty tree — no stash dance).
- `/pr-fix` — Apply fixes for unresolved PR review comments. Optional `--watch` for a 2-minute cron.
- Other commands: `pr-create`, `pr-describe`, `extract-plan`, `release`, `verify-dependency-vulnerability`.

## Shared review base

The three `/pr-review-*` commands share Steps 3–6 (diff retrieval, project context discovery, 7 SDK-specialized review agents, aggregation) via `.agents/lib/pr-review-base.md`. Each command's Step 1–2 sets up mode-specific state (CI env detection, branch resolution); Steps 3–6 are delegated to the base; Steps 7+ post the result in a mode-specific shape.

When changing the shared base, no entry-point edit is required if the change is internal. If the change adds a new field to the base's output contract (the deduplicated findings shape passed to Step 7), update all three entry points and `/pr-fix` if it surfaces in a sentinel.

## Sentinel grammar registry

Every terminal step in these skills ends with a single grep-able `Sentinel: NAME — <human prose>` line. Adding a new sentinel REQUIRES adding a row here.

| Sentinel | Owning skill / step | Fires on | Trailer grammar |
|---|---|---|---|
| `REVIEW_CLEAN` | pr-review-gh Step 7 + pr-review-local Step 7 | Zero findings, zero agent failures | `— no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| `REVIEW_INCOMPLETE` | pr-review-gh Step 7 + pr-review-local Step 7 | Zero findings BUT some agents crashed | `— <FAILED_AGENTS> of 7 agents failed (<names>); no findings does NOT mean clean.` |
| `REVIEW_DONE_LOCAL` | pr-review-local Step 7 | Local-only mode, non-zero findings | `— <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| `REVIEW_DONE_PR` | pr-review-ci Step 8 + pr-review-gh Step 8 | End of run, posted to GitHub | `— PR #<PR_NUMBER>, <N> findings, mode=<CI\|LocalPR>, commit=<HEAD_SHA_SHORT>` |
| `FIX_DONE_LOCAL` | pr-review-local Step 7b | `--fix` happy path | `— <X> applied, <Y> skipped (Local-only, unstaged).` |
| `FIX_ABORTED` | pr-review-local Step 7b pre-flight | Dirty tree at start | `— <reason>` |
| `WATCH_REJECTED` | pr-review-gh Step 9 / pr-fix Step 12 pre-flight | Empty prompt OR un-substituted CronCreate-time placeholder | `— <reason>` |
| `WATCH_TRANSIENT_ERROR` | pr-review-gh / pr-fix watcher (any cycle command) | Any non-zero exit. **Permanent failures (branch-protection, expired auth) flow through this same sentinel and recur every cycle until CronDelete.** | `— step <N> (<command>): <stderr>` |
| `WATCH_PR_CLOSED` | pr-review-gh / pr-fix watcher Step 1 | PR is no longer OPEN | `— PR #<PR_NUMBER> state=${CYCLE_PR_STATE}, watcher exiting.` |
| `WATCH_REVIEW_CLEAN` | pr-review-gh watcher Step 3 | No new commits since last review | `— PR #<PR_NUMBER> still at ${CYCLE_HEAD_SHA_SHORT}, no new commits since last review.` |
| `WATCH_REVIEW_DONE` | pr-review-gh watcher Step 11 | Review posted for new commit | `— PR #<PR_NUMBER> commit ${CYCLE_HEAD_SHA_SHORT}: <N> findings (X critical, Y high, Z medium, W low).` |
| `RECONCILE_OK` | pr-fix Step 9.5 | Reconciliation pass succeeded | `— <N> threads addressed (<F> fixed-and-resolved, <SK> skipped-with-reply, <Q> questions, <D> discussions, <P> praise-resolved, <A> already-addressed-resolved, <ST> stale-skipped).` |
| `RECONCILE_FAILED` | pr-fix Step 9.5 | At least one thread in unknown terminal state | `— <N> threads in unknown state: <id1> <id2> <id3>.` |
| `FIX_DONE_PR` | pr-fix Step 11 | Terminal sentinel for `/pr-fix <PR>` (no `--watch`) | `— PR #<PR_NUMBER>, fixed <N>, skipped <M>, resolved <R>, ci=<PASS\|FAIL\|PENDING\|PENDING_TIMEOUT\|NA>, commit=<HEAD_SHA_SHORT>` |
| `WATCH_FIX_GREEN` | pr-fix watcher Step 6 | Cycle has zero unresolved comments AND CI passing AND no conflicts AND no ambiguous-merge flag | `— PR #<PR_NUMBER> is green (no unresolved comments, CI passing, no conflicts).` |
| `WATCH_LINT_FAILED` | pr-fix watcher Step 7b | Lint rejected proposed fix; cycle aborted with stash-and-drop revert | `— PR #<PR_NUMBER> cycle aborted; lint rejected the proposed fix; working tree restored (stashed at <SHA> then dropped — recoverable from the reflog by SHA).` |
| `WATCH_FIX_DONE` | pr-fix watcher Step 7h | Cycle completed (some categories may be 0) | `— PR #<PR_NUMBER> cycle complete: <F> fixed-and-resolved, <SK> skipped-with-reply, <Q> questions, <D> discussions, <P> praise-resolved, <A> already-addressed-resolved, <ST> stale-skipped. Merge SHA: ${CYCLE_MERGE_SHA:-none}. Push SHA: ${CYCLE_HEAD_SHA:-none}. Resolved <R> threads. ci=<FAIL\|NA\|UNKNOWN>.` |

Sentinel names and trailer field order are part of the contract — rename or reorder fields only with a deprecation note in the table. Cross-skill changes (sentinels shared across commands) must land in this registry in the same PR that touches the skill body.

## Conventions

- **Bash-only constructs** (`${var//pattern/}`, `[[ ... ]]`) are fine — the agent's Bash tool runs `bash` on macOS/Linux.
- **Pseudocode form**: when a numbered step says `set CYCLE_X = \`cmd\``, the watcher agent runs `CYCLE_X=$(cmd)` (bare LHS — `${VAR}=...` is invalid bash).
- **Placeholder discipline (watcher prompts)**: `<UPPERCASE>` placeholders are CronCreate-time substitutions; `${CYCLE_*}` placeholders are cycle-derived (computed inside each cycle by the watcher agent, NOT substituted at CronCreate time). Pre-flight grep before CronCreate must abort if any unsubstituted `<UPPERCASE>` remains.
- **Whitespace-only validation**: `gh pr view` field validation must use `[ -z "${X//[[:space:]]/}" ]` — bare `[ -z "$X" ]` lets whitespace-only values silently pass.
- **Codex pass**: removed in the iter-10 split. The pre-existing `codex exec` background invocation was vestigial (fire-and-forget, no dedup, optional). If you want a real co-reviewer, build it as Agent 8 in `pr-review-base.md` Step 5 with proper output integration into Step 6's aggregator.
