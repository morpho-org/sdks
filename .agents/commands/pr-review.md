# pr-review

Reviews a GitHub Pull Request using parallel specialized agents, posts findings as inline review comments. Supports CI mode (GitHub Actions) and local mode. Optionally watches for new commits and re-reviews automatically.

## Usage

```
/pr-review <pr-number>
/pr-review <pr-number> --watch
@claude /pr-review
```

## Examples

```
/pr-review 123
/pr-review 456 --watch
@claude /pr-review this PR
```

## Documentation Reference

When reviewing, refer to these project docs as needed:

| Document              | Path                                                | Use For                         |
| --------------------- | --------------------------------------------------- | ------------------------------- |
| **Project Context**   | `CLAUDE.md`                                         | Tech stack, commands, structure |
| **Coding Guidelines** | `.agents/guidelines.md`                             | All code changes                |
| **Chain Integration** | `docs/chains.md`                                    | New chain support PRs           |
| **Deployment**        | `docs/deployment.md`                                | Build/Docker/CI changes         |
| **Rewards**           | `apps/vvrm-app/src/contexts/Reward/rewards.md`      | Rewards feature changes         |
| **Consumer API**      | `apps/vvrm-app/src/services/consumer-api/README.md` | API client changes              |

## Skills Reference

Consult these skills for in-depth best practices:

| Skill                      | Path                                          | Use For                                |
| -------------------------- | --------------------------------------------- | -------------------------------------- |
| **React Best Practices**   | `.agents/skills/vercel-react-best-practices/` | Performance, rendering, async patterns |
| **Composition Patterns**   | `.agents/skills/vercel-composition-patterns/` | Component architecture, props design   |
| **Web Design Guidelines**  | `.agents/skills/web-design-guidelines/`       | UI/UX review, accessibility            |
| **Next.js Best Practices** | `.agents/skills/next-best-practices/`         | App Router, RSC, data fetching         |
| **React Doctor**           | `.agents/skills/react-doctor/`                | Common React issues                    |

> **TWO-PHASE SKILL**: Phase 1 (Steps 1-8) does the initial review. Phase 2 (Step 9) creates a continuous watcher via CronCreate if `--watch` was passed. If `--watch` is used, the skill is NOT complete until Step 9's CronCreate call succeeds and you report the job ID to the user.

## Step 1: Detect Environment and Repository

### Environment Detection

Detect your environment to determine the review mode:

- **CI Mode**: If running in GitHub Actions (check for `CI=true` or `GITHUB_ACTIONS=true` environment variable), post review comments directly and submit a formal verdict
- **Local Mode**: If running locally (no CI env vars), use parallel agents and post as `COMMENT` (never auto-approve or request changes)

### Repository Detection

Extract owner and repo from the git remote:

```bash
git remote get-url origin
```

Parse `owner` and `repo` from the URL (handles both `git@github.com:owner/repo.git` and `https://github.com/owner/repo.git` formats). Strip the `.git` suffix.

## Step 2: Fetch PR Details

Use local `gh` CLI to get PR metadata:

```bash
gh pr view <PR_NUMBER> --json title,body,baseRefName,headRefName,headRefOid,state
```

Extract:

- `baseRefName` — the base branch
- `headRefName` — the head/PR branch
- `headRefOid` — the head commit SHA (this is your **last_reviewed_sha**)
- `state` — must be `OPEN`

Then fetch the latest remote state:

```bash
git fetch origin
```

If the PR is not open, inform the user and stop.

## Step 3: Get Full PR Diff Locally

**IMPORTANT: Use the local repo on disk, NOT the GitHub API, for reading code and diffs.**

```bash
# Get the merge base between PR head and base branch
MERGE_BASE=$(git merge-base origin/<base_branch> origin/<head_branch>)

# Full diff of the PR
git diff $MERGE_BASE..origin/<head_branch>

# List of changed files
git diff --name-only $MERGE_BASE..origin/<head_branch>
```

Also read the actual changed files from the local filesystem using the Read tool so agents have full file context (not just diff hunks).

## Step 4: Read Project Guidelines

Before launching review agents, read the key reference documents so you can include relevant criteria in each agent's prompt:

1. Read `.agents/guidelines.md` for coding standards
2. Read relevant sections of the skills referenced above based on what files changed

## Step 5: Launch Parallel Review Agents

Launch ALL 5 review agents **in parallel** using the Agent tool (subagent_type: `"general-purpose"`). Each agent should:

- Receive the full diff AND the full content of changed files (read from local filesystem)
- Be told the repo path, owner, repo name, PR number, base branch, and head branch
- Be instructed to analyze the **full PR diff** (not just latest commit)
- Have access to read local files for additional context (e.g., imports, types, configs)
- Return structured findings as a JSON array: `[{severity: "critical"|"high"|"medium"|"low", file: "path/to/file", line: number, description: "what is wrong and how to fix it"}]`
- Only include **actionable** findings — no praise, no summaries

### Agent 1: Code Quality

Focus: TypeScript strict mode, type safety, early returns, `as` assertions, duplication, naming conventions, code smells, magic numbers, overly complex functions.

Prompt must include:

- Type safety issues (any types, type assertions, missing generics)
- Error handling and edge cases
- Code smells (duplicated logic, overly complex functions, magic numbers)
- Early returns preferred over nested conditionals
- Naming conventions per guidelines (PascalCase for components, camelCase for hooks, etc.)
- Reference `.agents/guidelines.md` rules

### Agent 2: React & Architecture

Focus: Component patterns, hooks rules, React Compiler, re-render optimization, Suspense/error boundaries, Next.js App Router patterns.

Prompt must include:

- React best practices (hooks rules, effect dependencies, unnecessary re-renders)
- Component patterns (prop drilling, component composition, separation of concerns)
- Performance issues (check for manual memoization — should use React Compiler with `"use memo";` instead)
- Re-render optimization (derived state, lazy init, functional setState)
- Avoid boolean prop proliferation (use variants or compound components)
- Prefer children over render props
- App Router patterns (server vs client components, data fetching)
- Client/server boundary violations
- Reference `.agents/skills/vercel-react-best-practices/` and `.agents/skills/vercel-composition-patterns/`

### Agent 3: Web3 Security

Focus: Contract interactions, transaction parameters, wallet handling, permit flows, race conditions. **This is CRITICAL review territory.**

Prompt must include:

- Contract interactions: verify correct contract addresses, function signatures, and arguments
- Transaction parameters: check gas estimates, value transfers, and calldata encoding
- Reactivity concerns: can state changes cause unintended transaction parameters?
- Wallet connection: proper account handling and chain verification
- Hook usage: correct usage of wagmi hooks (useContractRead, useContractWrite, etc.)
- Error handling: transaction failures, reverts, and user rejections
- Race conditions in async operations
- Missing transaction confirmations or proper waiting for receipts
- Permit/deadline handling (avoid stale block timestamps)

### Agent 4: Silent Failure Hunter

Focus: Swallowed errors, missing error boundaries, empty catch blocks, unhandled promise rejections, missing loading/error states, dead code paths.

Prompt must include:

- Empty or overly broad catch blocks that swallow errors
- Missing error boundaries around async components
- Unhandled promise rejections (missing `.catch()` or try/catch)
- Missing loading states for async operations
- Missing error states for failed data fetches
- Silently ignored return values from critical operations
- Dead code paths that can never execute

### Agent 5: Style & Guidelines Compliance

Focus: Tailwind vs Emotion enforcement, import ordering, naming conventions, colocation, guidelines checklist.

Prompt must include:

- New components should use Tailwind (not Emotion)
- No mixing Tailwind and Emotion in the same component
- UI Kit V6 components for new unopinionated components
- Import ordering per guidelines
- Colocation: related code should be together, not in centralized folders
- Reference `.agents/guidelines.md` and `.agents/skills/web-design-guidelines/`

## Step 6: Aggregate and Deduplicate Findings

Merge all agent results. Deduplicate findings that reference the same file+line. Keep the highest severity when duplicates exist.

Map severity levels for display:

- `critical` → 🔴 Critical
- `high` → 🟡 Important
- `medium` → 🔵 Medium
- `low` → 🔵 Minor

---

## Step 7: Post Review (CI Mode)

**Only follow this step if running in CI mode (GitHub Actions).**

### 7a: Create pending review and add inline comments

```bash
# Create a pending review (returns review_id)
# Note: omit the "event" field entirely to create a pending review — "PENDING" is not a valid event value
REVIEW_ID=$(gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews \
  --method POST \
  -f commit_id="<head_commit_sha>" \
  --jq '.id')

# For each finding, add an inline comment to the pending review
gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews/$REVIEW_ID/comments \
  --method POST \
  -f path="<file>" \
  -F line=<line> \
  -f side="RIGHT" \
  -f body="**[SEVERITY]** <description>

Suggestion: <how to fix>"
```

### 7b: Submit formal review with verdict

**Choose the appropriate verdict based on findings:**

| Verdict             | When                                              | Event             |
| ------------------- | ------------------------------------------------- | ----------------- |
| **Approve**         | No critical or important issues (minor issues OK) | `APPROVE`         |
| **Request Changes** | Any critical issues, or multiple important issues | `REQUEST_CHANGES` |

```bash
gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews/$REVIEW_ID/events \
  --method POST \
  -f event="<APPROVE or REQUEST_CHANGES>" \
  -f body="<!-- CLAUDE_REVIEW_COMPLETE -->
<!-- CLAUDE_VERDICT:APPROVE -->  <!-- Only include for approvals -->
## Code Review Summary

### Overview
<Brief summary of the PR and overall assessment>

### Findings
- 🔴 Critical: X issues
- 🟡 Important: X issues
- 🔵 Minor: X issues

See inline comments for details.

### Guidelines Compliance
- [ ] Follows TypeScript strict mode
- [ ] Uses early returns over nested conditionals
- [ ] React Compiler (\`\"use memo\";\`) instead of manual memoization
- [ ] Tailwind for new components (not Emotion)
- [ ] Proper error handling with logger service
- [ ] Naming conventions followed
- [ ] Component composition patterns (no boolean prop proliferation)
- [ ] Proper async/Suspense boundaries
- [ ] No unnecessary re-renders

### Verdict
✅ **Approved** - Code looks good!
<!-- OR -->
❌ **Changes Requested** - Please address the issues above."
```

**Important notes for CI mode:**

- Always include `<!-- CLAUDE_REVIEW_COMPLETE -->` in every review
- For approvals, also include `<!-- CLAUDE_VERDICT:APPROVE -->` and use `APPROVE` event
- Line numbers must match the NEW file in the diff (right side)
- Use `side: "RIGHT"` for commenting on added/modified lines
- For multi-line suggestions, use `start_line` and `line` parameters

**After posting, skip to Step 8.** CI mode does not use `--watch`.

---

## Step 7 (alt): Post Review (Local Mode)

**Only follow this step if running locally (NOT in CI).**

### 7a: Create pending review and add inline comments

```bash
# Create a pending review (returns review_id)
# Note: omit the "event" field entirely to create a pending review — "PENDING" is not a valid event value
REVIEW_ID=$(gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews \
  --method POST \
  -f commit_id="<head_commit_sha>" \
  --jq '.id')

# For each finding, add an inline comment to the pending review
gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews/$REVIEW_ID/comments \
  --method POST \
  -f path="<file>" \
  -F line=<line> \
  -f side="RIGHT" \
  -f body="**[SEVERITY]** <description>

Suggestion: <how to fix>"

# Submit the review as COMMENT (never auto-approve or request changes in local mode)
gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews/$REVIEW_ID/events \
  --method POST \
  -f event="COMMENT" \
  -f body="## Parallel PR Review (Claude)

**Reviewed commit:** \`<short_sha>\`

| Severity | Count |
|----------|-------|
| 🔴 Critical | X |
| 🟡 Important | X |
| 🔵 Medium | X |
| 🔵 Minor | X |

_This is an automated parallel review. It will re-run when new commits are pushed (if watching)._"
```

**Important**: If the pending review API is not available, fall back to posting individual inline comments via `gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/comments`.

If there are zero findings, still submit with a body saying "No issues found in this review."

### 7b: Optional Codex pass

Check if `codex` CLI is available:

```bash
which codex
```

If available, run in the background (do not wait for it to finish):

```bash
codex exec -c model_reasoning_effort=xhigh "Review PR #<PR_NUMBER> in this repo. The PR branch is <headRefName> based on <baseRefName>. Run 'git diff origin/<baseRefName>...origin/<headRefName>' to get the full diff. Analyze the changes for bugs, security issues, code quality, and best practices. Post your findings as inline review comments on the PR using 'gh api' to create a pull request review with comments on specific lines." 2>&1 | tail -50
```

If `codex` is not installed or the command fails, log the error and continue — Claude review is sufficient on its own.

---

## Step 8: Report to User

Print a summary:

```
PR #<number> review posted:
  Claude: <N> findings (X critical, Y important, Z medium, W minor)
  Codex:  <triggered in background / not available>
  Mode:   <CI / Local>
Last reviewed commit: <short_sha>
```

If `--watch` was NOT passed (or in CI mode), the skill is complete here.

If `--watch` WAS passed AND in local mode, **you MUST proceed to Step 9**.

## Step 9: Schedule Continuous Watch (only with --watch, local mode only)

**If `--watch` was passed, you MUST call `CronCreate` now.** Do not skip this step.

Use `CronCreate` to schedule a recurring job every 2 minutes:

- cron: `*/2 * * * *`
- recurring: true
- prompt: The prompt below, with all variables filled in (replace all `<PLACEHOLDERS>` with actual values):

```
You are the PR review watcher for PR #<PR_NUMBER> in <owner>/<repo>.
Last reviewed commit SHA: <LAST_REVIEWED_SHA>.
Repo path: <REPO_PATH>
Head branch: <HEAD_BRANCH>
Base branch: <BASE_BRANCH>

This is a RECURRING cron job. Each run is one check cycle. After completing a cycle, simply end your response — the cron scheduler will invoke you again in 2 minutes.

CYCLE START:

1. FETCH AND CHECK STATE:
   Run: cd <REPO_PATH> && git fetch origin
   Run: git rev-parse origin/<HEAD_BRANCH>
   Run: gh pr view <PR_NUMBER> --repo <owner>/<repo> --json state --jq '.state'
   If not "OPEN": say "PR #<PR_NUMBER> is no longer open (state: <STATE>). Review watcher done." and end.

2. COMPARE SHA:
   Compare the current head SHA to the last reviewed SHA (<LAST_REVIEWED_SHA>).
   If the SHA is the same: say "No new commits on PR #<PR_NUMBER>, still at <short_sha>." and end this cycle.

3. NEW COMMIT DETECTED:
   Say "New commit detected on PR #<PR_NUMBER>: <new_sha>. Running full review..."

4. GET FULL PR DIFF:
   Run: cd <REPO_PATH>
   MERGE_BASE=$(git merge-base origin/<BASE_BRANCH> origin/<HEAD_BRANCH>)
   git diff $MERGE_BASE..origin/<HEAD_BRANCH>
   git diff --name-only $MERGE_BASE..origin/<HEAD_BRANCH>
   Also read each changed file from the local filesystem using the Read tool for full context.

5. READ GUIDELINES:
   Read .agents/guidelines.md for coding standards.

6. LAUNCH REVIEW AGENTS in parallel using the Agent tool (subagent_type: "general-purpose"):
   a. code-quality — TypeScript strict mode, type safety, early returns, assertions, duplication, naming, code smells
   b. react-architecture — component patterns, hooks, React Compiler ("use memo;"), re-render optimization, Next.js App Router
   c. web3-security — contract interactions, tx params, wallets, permits, race conditions (CRITICAL)
   d. silent-failure-hunter — swallowed errors, empty catch blocks, missing error boundaries, unhandled rejections
   e. style-guidelines — Tailwind vs Emotion, import ordering, naming conventions, colocation
   Each agent receives the full diff AND changed file contents, and returns findings as JSON: [{severity, file, line, description}]

7. Collect and deduplicate all agent findings. Keep highest severity for same file+line.

8. POST REVIEW to GitHub:
   a. Create a pending review (omit event field): gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews --method POST -f commit_id="<new_sha>"
   b. Add inline comments for each finding (format: "**[SEVERITY]** description")
   c. Submit the review as COMMENT: gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews/<REVIEW_ID>/events --method POST -f event="COMMENT"

9. OPTIONAL CODEX: If `which codex` succeeds, run codex review in background.

10. Say "Review posted for PR #<PR_NUMBER> commit <new_short_sha>: <N> findings (X critical, Y important, Z medium, W minor)."

CYCLE END — the cron scheduler will run this again in 2 minutes.
```

**After CronCreate returns the job ID:**

1. Report the job ID to the user
2. Tell them they can cancel with `CronDelete` using that ID
3. Note that the watcher auto-expires after 3 days
4. Only THEN is the skill complete

## Error Handling

- If the PR doesn't exist: tell the user and stop
- If the diff is too large for agents: split by file groups and review in batches
- If posting review fails (e.g., permissions): fall back to posting a single PR comment with all findings using `gh api repos/<owner>/<repo>/issues/<PR_NUMBER>/comments`
- If an agent fails: continue with results from other agents, note which aspect was skipped
- If CronCreate is not available: skip continuous monitoring, inform the user that `--watch` requires CronCreate

## Notes

- **Local-first**: Always use local filesystem and git commands for reading code, diffs, and file contents. Only use GitHub API for posting reviews/comments (write operations). Never use the GitHub API to read diffs or file contents — the local repo has everything.
- **Unified command**: This command replaces the old separate `/review` (CI-only) and `/pr-review` (local-only) commands. It auto-detects the environment and adapts its behavior.
- **CI mode differences**: In CI, the review submits a formal verdict (`APPROVE` or `REQUEST_CHANGES`), includes `CLAUDE_REVIEW_COMPLETE` markers, and does not support `--watch`. In local mode, the review always posts as `COMMENT` and optionally supports `--watch`.
- **Self-contained watcher**: The cron watcher performs the full review inline (launches agents, posts review) rather than re-invoking the skill. This avoids recursive watcher creation and ensures each cron tick is a complete review cycle.
- Always review the FULL PR diff, not just the latest commit — this ensures context and cross-file impact are considered
- Each re-review posts a new review (GitHub keeps the history)
- This skill works on any repository — it detects owner/repo from git remote automatically
- The skill assumes it is invoked from within the git repository
