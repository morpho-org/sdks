---
name: execute-project
description: >-
  Execute a Linear project end to end: ingest the project overview and every attached resource,
  map the issue graph (blocks / blocked-by), then implement the issues in dependency waves — one
  child agent or sub-session per issue — as stacked draft PRs so dependent work never waits for a
  merge to `main`; a Devin orchestrator starts each issue's session from Linear so the issue is
  linked to it. Use whenever someone asks to "execute", "run", "implement", "work through", or
  "ship" a Linear project, "start the project", or "do all the tickets in <project>" — not only
  when /execute-project is invoked explicitly. Do NOT use for a single ticket (open it directly and
  follow /create-pr), for writing a TIB or turning one into issues (/plan-tib, /create-tib), or for
  reviewing a single PR (/review-pr-gh, /review-pr-local).
argument-hint: <linear-project-name-id-or-url> [--only <issue-ids>] [--dry-run]
allowed-tools:
  - mcp__linear__get_project
  - mcp__linear__list_projects
  - mcp__linear__list_issues
  - mcp__linear__get_issue
  - mcp__linear__list_comments
  - mcp__linear__list_documents
  - mcp__linear__get_document
  - mcp__linear__get_attachment
  - mcp__linear__save_issue
  - mcp__linear__save_comment
  - mcp__linear__get_user
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - WebFetch
  - Agent
  - Skill
  - AskUserQuestion
version: 1.0.0
---

# execute-project

Turn a Linear project into merged code. The skill reads everything the project knows about itself,
works out which issues can start now and which must wait, and hands each issue to its own child
agent. Children work in parallel where the graph allows, and dependent issues stack on the branch
of the issue they depend on, so the whole graph is implemented without waiting for `main`.

The orchestrator (the agent running this skill) never implements an issue itself. It plans, briefs,
reviews, restacks, and asks the user when it is not sure it should proceed.

## Usage

```
/execute-project <linear-project-name-id-or-url> [--only SDK-101,SDK-104] [--dry-run]
```

- `--only` restricts execution to the listed issues (and refuses to run one whose blockers are not
  in the list or already done).
- `--dry-run` runs Steps 1-5 and stops after the plan is presented. Nothing is dispatched and
  nothing is written to Linear — decisions are recorded in the context pack only.

## Definitions

- **Issue graph**: the project's incomplete issues plus the `blockedBy` / `blocks` edges between
  them. Edges to completed issues are satisfied and dropped. Edges to cancelled issues are **not**
  satisfied — the work never landed — and raise a go/no-go for each dependent (Step 5). Edges to
  issues outside the project are **external blockers**.
- **Wave**: the set of issues whose blockers are all either done or already assigned to a branch in
  the current run. Wave 1 is the unblocked issues.
- **Stack**: GitHub stacked PRs. A **root** PR targets `main`. A **child** PR targets its parent's
  head branch. Children merge into the parent first, then the root squash-merges into `main`. This
  repo has no workflow that carries a child's `Closes SDK-N` line into the root, so after a child
  merges into its parent the orchestrator checks the child's Linear issue moved to Done and sets it
  with `mcp__linear__save_issue` when it did not.
- **Completion status**: every child report and the final report end with one of `DONE` (all
  steps completed, evidence provided), `DONE_WITH_CONCERNS` (completed, with issues the reader must
  know about), `BLOCKED` (cannot proceed; what was attempted and what blocks), or `NEEDS_CONTEXT`
  (missing information; what is needed to continue).
- **Go/no-go**: a question to the user with concrete options. The orchestrator asks it whenever it
  would otherwise have to guess (Step 5). Uncertainty is a reason to ask, never a reason to skip.

---

## Instructions

### Step 1: Resolve the project

1. Parse `$ARGUMENTS`. A `https://linear.app/...` URL yields the project slug; a name, ID, or
   `P-TEAM-N` identifier is used directly. With no argument, ask which project to execute.
2. `mcp__linear__get_project` with `includeMilestones: true`, `includeMembers: true`,
   `includeResources: true`. If it cannot be found, `mcp__linear__list_projects` with the text as
   `query` and ask the user to pick.
3. Record: name, teams, lead, status, health, start/target dates, milestones (ordered by target
   date then name), and the description (the **overview**).

### Step 2: Ingest the project context

Read everything the project points at, in parallel, before looking at a single issue:

1. **Overview** — the project description. When it is structured (Why / Background /
   Requirements / Assumptions / Out of scope / References / Open, or a TIB's Decision /
   Consequences / Open questions), extract the requirements (`R-x`), assumptions (`A-x`),
   out-of-scope items, and open questions (`Q-x`); number them yourself when the overview does not.
   Open questions with no default are go/no-go candidates in Step 5.
2. **Resources** — every document, link, and attachment from `includeResources`:
   - Linear documents: `mcp__linear__get_document`. Also `mcp__linear__list_documents` with
     `projectId` to catch documents attached after the resources list was cached.
   - Repo files (TIBs under `docs/tibs/`, `docs/*.md`, package `AGENTS.md`): `Read` them from the
     checkout. A TIB linked from the project is the primary spec — its Decision section overrides
     the overview where they disagree (`AGENTS.md` §6: implemented TIBs are historical records, so
     never edit one to match the code).
   - GitHub PRs and issues: `gh pr view <n> --json title,body,state,url` / `gh issue view`.
   - Other URLs (Notion, Figma, docs sites): `WebFetch`. For a URL you cannot reach (Slack thread,
     auth-gated page), record it as an **unread source** — do not summarise from its title.
3. **Project comments and status updates** — `mcp__linear__list_comments` with `projectId` (the
   tool accepts exactly one of `issueId` / `projectId`; `save_comment` takes the same parents).
   Later comments override earlier decisions in the overview when they clearly settle a question.
4. **Repo conventions** — root `AGENTS.md` (§1 layering, §2 forbidden patterns, §5 test
   placement, §6 JSDoc, §7 changesets, §8 tooling) and the `AGENTS.md` of every package under
   `packages/` the project touches (identify them from the overview and the issues' title scopes),
   plus `docs/jsdoc-style.md` when the project adds exports.

Write the result to a **context pack** at `<scratchpad>/execute-project/<project-slug>/context.md`:
project summary, requirements, assumptions, out-of-scope, open questions, decisions found in
comments, one paragraph per resource with its URL, the unread-source list, and the repo conventions
that apply. Every child brief links to this file. Keep it current when the user answers a go/no-go.

### Step 3: Build the issue graph

1. `mcp__linear__list_issues` with `project` set to the project ID; paginate with `cursor` until
   `hasNextPage` is false.
2. For every issue, `mcp__linear__get_issue` with `includeRelations: true` to get `blockedBy`,
   `blocks`, `parent`/sub-issues, `branchName`, attachments, and the full description. For every
   incomplete issue also `mcp__linear__list_comments` — comments may hold decisions, PR links, or a
   human saying "I'm on this".
3. Classify each issue: **Done** (completed status type), **Cancelled** (cancelled status type;
   its dependents are go/no-go items — the user drops the edge, rescopes, or skips), **Human-owned** (status
   In Progress / In Review with a non-agent assignee, or an open PR from a branch that is not
   ours), **Candidate** (everything else).
4. Build the graph over Candidates. Drop satisfied edges. Flag **external blockers** (blockers
   outside the project or Human-owned) — an issue behind one cannot be executed in this run unless
   the user says otherwise in Step 5.
5. Detect and report cycles (`A blocks B blocks A`). A cycle is a go/no-go: the user picks which
   edge to ignore or fixes Linear.
6. Compute waves with a topological sort. Inside a wave, order by priority (Urgent → Low), then
   milestone order, then identifier.
7. Assign each Candidate a **stack position**:
   - Zero open blockers → **root**, branch from `origin/main`.
   - Exactly one open blocker → **child** of that blocker's branch.
   - Two or more open blockers → **multi-parent**. Prefer the blocker with the longest downstream
     chain as the parent, and mark the issue for a go/no-go (Step 5) because the second blocker's
     changes will be missing from its base until one of them lands on `main`.
   - Every path in this repo is owned (`.github/CODEOWNERS` starts with `* @morpho-org/sdk-engineers`),
     so there is no review-free path: every PR waits for a human approval. Keep independent
     docs-only or tests-only issues as roots anyway so they can merge without waiting on the stack.

### Step 4: Audit each candidate against the context pack

For every Candidate, decide whether the issue is **executable as written**. An issue passes when:

- Its description is complete enough that a child could start without asking: context,
  references (TIB, PR, or doc), and a possible solution or acceptance criteria.
- It maps to at least one requirement in the overview, or the overview is silent and nothing in
  Out of scope excludes it.
- Its scope (title prefix, referenced paths) names a package under `packages/` (or `scripts/`,
  `docs/`, `.agents/`) that the project owns.
- It carries no unresolved open question (`Q-x` with no default) and no comment that reverses it.
- It does not touch a **guarded surface**: `.github/` (workflows, CODEOWNERS, dependabot),
  `.changeset/config.json`, the publish/release flow (`publish.yml`, `version-pr.yml`,
  `scripts/release/`), `.npmrc`, `pnpm-workspace.yaml`, secrets or environment variables, a new
  runtime dependency (`AGENTS.md` §2 rule 9 needs a written justification), a major version bump
  or the removal of a public symbol without the §7 deprecation flow, or pinned ABIs and addresses.

Every failed check is a go/no-go item, not a reason to silently skip or silently proceed.

### Step 5: Present the plan and collect go/no-go decisions

Present, in the thread:

```
## Execute Project: <project-name>

**Context**: <n> resources read · <n> unread (listed below)
**Issues**: <total> · <done> done · <human> human-owned · <n> candidates in <w> waves

### Waves and stack

| Wave | ID | Title | Priority | Stack position | Base branch | Audit |
| ---- | -- | ----- | -------- | -------------- | ----------- | ----- |
| 1 | SDK-101 | feat(blue-sdk): add VaultV2 adapter entity | High | root | main | OK |
| 2 | SDK-102 | feat(morpho-sdk): expose VaultV2 adapter facade | High | child of SDK-101 | <branch-101> | OK |
| 2 | SDK-103 | docs(morpho-sdk): document VaultV2 adapters | Normal | root | main | OK |
| 3 | SDK-105 | feat(blue-sdk-viem): fetch VaultV2 adapter state | Normal | multi-parent (101, 104) | <branch-101> | ASK |

### Dependency graph
SDK-101 → SDK-102 → SDK-105
SDK-104 → SDK-105
SDK-103 (independent)

### Go/no-go
1. SDK-105 has two open blockers; stacking on SDK-101 leaves SDK-104's changes out of its base
   until one merges. Options: stack on 101 and rebase later · wait for 104 to merge, have
   SDK-101's agent rebase <branch-101> onto `main` and confirm it now carries 104, then dispatch
   105 from it · skip.
2. SDK-107 touches `.github/workflows/test.yml` (guarded surface). Options: execute · skip ·
   execute but stop before pushing.
3. Q-2 in the overview ("does the facade re-export the raw name under `/blue/vaults`?") has no
   default and SDK-101 depends on it. Options: <the plausible answers> · skip SDK-101 and
   everything behind it.

### Not executed this run
- SDK-110 — human-owned (@alice, In Progress, #1012 open)
- SDK-111 — blocked by API-2261 (outside the project)
```

Ask each go/no-go through the host's structured question tool with the options above and a
recommendation, batching the ones whose prerequisites are settled. An issue with an open question
is **not dispatched** until answered. If the user does not want to answer now, treat the item as
"skip" and say so in the report. Then ask **"Execute this plan?"** — options: **execute all**,
**execute waves 1-N**, **execute only <ids>**, **edit** (change a base, skip an issue, re-parent
a multi-parent issue), or **stop**. With `--dry-run`, stop here.

Record every answer in the context pack under `## Decisions` with the issue ID and date. A
decision that changes an issue's scope also goes back to Linear as a comment on that issue
(`mcp__linear__save_comment`) so the ticket, not the chat, carries it — except under `--dry-run`,
which never writes to Linear.

### Step 6: Dispatch waves to child agents

Every issue runs in its **own child agent or sub-session** — never in the orchestrator's context.
Pick the host's primitive:

| Host        | Primitive                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code | `Agent` tool, `general-purpose` type (or a specialist type when the issue is clearly protocol/contract work). One call per issue, in one message per wave so they run concurrently.  |
| Codex       | One custom agent per issue from `.codex/agents/` when a match exists, else the general agent.                                                                                        |
| Devin       | One **Linear-triggered** session per issue, adopted by the orchestrator (below). Fall back to a plain child session (`managing-child-sessions`) only when the trigger does not fire. |

Children that share the orchestrator's machine each work in their **own git worktree**
(`git worktree add -b <branch> ../wt-<issue-id> <base>`), never in the orchestrator's checkout. Children on
their own machines (Devin sessions) clone the repo themselves; the brief tells them the exact
base ref to fetch.

For each issue in the wave, before dispatch:

1. `mcp__linear__save_issue` — set `state` to **In Progress**. Do not change the assignee; add a
   comment `Execution started by /execute-project — branch <name>, base <base>` instead (on Devin
   the trigger comment below carries this line, so post only one comment).
2. Branch name: the issue's `branchName` from Linear when present (that is what Linear links on),
   else `<type>/<issue-id-lowercase>-<slug>` — the identifier must appear in it.

**Devin orchestrator — trigger through Linear, then adopt.** Linear's agent-session linkage
(activity feed, plan sync, session and PR links on the issue) exists only for sessions started
_from_ Linear, so a Devin orchestrator does not create children directly:

1. Post the child brief as a single issue comment (`mcp__linear__save_comment` with `issueId`)
   that starts with an `@Devin` mention. The mention starts a Devin session with the comment as its
   task and links it to the issue. Do not also assign Devin or add a playbook label — each is a
   separate trigger and would start a second session for the same issue.
2. Adopt the session: poll `devin_session_search` (`origins: ["linear"]`, `created_after` the
   comment time) until a session whose title or prompt carries the issue identifier appears, and
   record its ID in the context pack next to the issue. It is not a child of the orchestrator, so
   wait on it with `devin_session_interact` `get` (status) and steer it with `message` — the
   same review, re-brief, and rebase instructions as for any child go through `message`.
3. If no session appears within a few minutes, the integration did not fire (Devin not connected
   to that Linear team, or the comment was not treated as a mention). Fall back to one child
   session with the same brief and comment its URL on the issue so the link exists at least as
   text; note the fallback in the Step 9 report.

**Claude Code / Codex orchestrator — sub-agents.** Do not mention or assign Devin in Linear; the
issue is worked by a sub-agent of this session. The sub-agent's PR URL is commented on the issue
in Step 7, which is the only link Linear gets.

**The child brief is self-contained** — the child sees none of this conversation. It contains:

- The issue identifier, title, full description, and every relevant comment, verbatim.
- The path (or full text, for a remote child) of the context pack, and the sentence "The project
  overview and its Decisions section override the issue description where they disagree."
- The exact **base ref** (`origin/main`, or `origin/<parent-branch>` for a child PR) and the exact
  **branch name** to create. For a child PR: "Your diff is reviewed against `<parent-branch>`; do
  not re-implement anything already on that branch, and do not merge `main` into your branch."
- The repo rules that apply to every change: never commit to `main`, never commit secrets or ENV
  values; root `AGENTS.md` (§1 layering; §2 forbidden patterns; §5 test placement; §6 JSDoc on
  every new export; §7 a changeset via `pnpm changeset` for any semver-relevant change to a
  published package, none for docs/tests/agent files; §8 tooling), the `AGENTS.md` of the affected
  package, and `docs/jsdoc-style.md`.
- Validation to run before pushing: `pnpm lint`, `pnpm build`, and `pnpm test` from the repo root
  (or `pnpm --filter <pkg> test` while iterating, then the root suite once). Zero errors and zero
  warnings, or report BLOCKED with the output.
- PR instructions: open a **draft** PR with the base set explicitly (`gh pr create --draft
  --assignee @me --base <base-branch>`), following `/create-pr` for the body and the commit title
  convention (`<type>(<package>): <description> (<ISSUE-ID>)`, commitlint-enforced), with a bare
  `Closes <ISSUE-ID>` line. When the base is not `main`, the body says so in the first line
  (`Stacked on #<parent-pr>`). Then run `/review-pr-gh <pr-number>` and fix High/Medium findings
  with `/fix-pr` before reporting.
- **Stop conditions** — the child must **stop and report** rather than guess when: the issue needs
  a decision the context pack does not settle; the change would touch a guarded surface (Step 4)
  not approved in Decisions; the validation suite fails three times on the same error (stop
  iterating without a new hypothesis); the base branch no longer exists; or the child finds the issue
  already done on `main`.
- The **report format**: `ISSUE-ID · status (DONE / DONE_WITH_CONCERNS / BLOCKED /
NEEDS_CONTEXT) · branch · PR URL · base · files changed · validation evidence · open questions`.

Dispatch the whole wave at once. Do not dispatch wave N+1 until every issue in wave N that it
depends on has **pushed a branch with an open PR** — a merge is not required; that is the point of
the stack.

### Step 7: Review each child's result before stacking on it

For every report:

1. Read the child's full diff (`git fetch origin <branch>` then
   `git diff origin/<base>...origin/<branch>`), not its prose. Check it against the issue, the
   context pack, and the review personas' rubrics (`/review-pr-local <base>` from the child's
   worktree, or read the `/review-pr-gh` output the child already posted). A report is a claim; the
   diff and the validation output are the evidence.
2. `DONE` with a clean diff: comment the PR URL on the Linear issue (skip when a Linear-triggered
   Devin session already attached it) and move it to **In Review** (or the team's equivalent). Its
   branch becomes a valid base for the next wave.
3. `DONE_WITH_CONCERNS`: decide. If the concern is scope (the child did more or less than the
   issue), send one consolidated correction brief to the same child. If the concern needs the
   user, it is a go/no-go and the issue's dependents wait.
4. `BLOCKED` / `NEEDS_CONTEXT`: answer from the context pack if you can, in one re-brief. Otherwise
   raise a go/no-go with the child's question verbatim and the options you see. Dependents of a
   blocked issue are **held**, never re-parented onto `main` silently — re-parenting changes the
   plan the user approved.
5. Never squash, amend, or force-push a child's branch yourself. Corrections go back to the child
   as a brief.

### Step 8: Keep the stack healthy

- **Fix-ups on a parent**: when a parent branch gains commits after a child was branched from it,
  tell the child to rebase (`git fetch origin && git rebase origin/<parent>` then
  `git push --force-with-lease`). Children rebase their own branches; the orchestrator only tells
  them when.
- **Parent merges into `main`**: when a root squash-merges, GitHub retargets its children to `main`
  but their branches still carry the pre-squash commits. Brief the child to
  `git rebase --onto origin/main <old-parent-head-sha>` and force-push with lease, then confirm the
  PR diff shows only that issue's change.
- **Merge order**: children into the parent first, then the parent into `main`. Before the root
  merges, confirm its description carries a `Closes SDK-N` line for every child squashed into it
  and that the changesets of every child are present on the branch (one release PR bumps them all).
  The orchestrator does not merge; it tells the user what is mergeable and in which order.
- **CI**: a red check on a child PR goes back to that child with the failing job log. A red check
  caused by the parent goes to the parent's child agent, and the dependents wait.

### Step 9: Report

When every dispatched issue has reported and every go/no-go is answered or skipped, post:

```
## Executed: <project-name>

| Wave | ID | Title | PR | Base | Status | Notes |
| ---- | -- | ----- | -- | ---- | ------ | ----- |

### Merge order
1. #1231 (SDK-103, docs only) → main
2. #1233 (SDK-102) → <branch-101>
3. #1230 (SDK-101) → main, add `Closes SDK-102` to its description first

### Skipped / held
- SDK-105 — waiting on decision 1 (multi-parent)
- SDK-110 — human-owned

### Unread sources
- <url> — <why it could not be read>
```

Post the same summary as a comment on the Linear project (`mcp__linear__save_comment` with the
project ID) so the next run — or a human — starts from it. End with the completion status
(Definitions): `DONE` when every candidate has a reviewed PR, `DONE_WITH_CONCERNS` when any issue is
held, skipped, or has unread sources, `BLOCKED` when a go/no-go stops the run, `NEEDS_CONTEXT`
when the project cannot be resolved or has no candidates.

---

## Re-running

The skill is idempotent per project. On a second run, Step 3 finds issues already **In Review**
with a PR from an expected branch and treats them as satisfied blockers (their branch is the base
for dependents). It never opens a second PR for an issue that has an open one; it re-briefs the
existing child (or a new child with the existing branch) instead. The project comment from Step 9
is the handover record between runs.

## Notes

- The orchestrator writes to Linear only through `save_issue` (state) and `save_comment`
  (progress, decisions, PR links, and — on Devin — the `@Devin` trigger brief). It never edits
  descriptions, relations, or assignees.
- The orchestrator never pushes code. Every commit comes from a child on its own branch.
- One issue, one child, one branch, one PR. A child that wants to split its issue reports
  `NEEDS_CONTEXT` and the split is a go/no-go — file the new ticket in the SDK Linear team with
  `mcp__linear__save_issue` if approved, linked `blockedBy` the original.
- Optimise for the stack: the graph, not the merge queue, decides what runs. Waiting for `main` is
  the exception (multi-parent issues the user chose to wait on), never the default.
- Related commands (`.agents/commands/`): [`create-pr`](../../commands/create-pr.md) (what every
  child follows for its PR), [`review-pr-gh`](../../commands/review-pr-gh.md) /
  [`review-pr-local`](../../commands/review-pr-local.md) and [`fix-pr`](../../commands/fix-pr.md)
  (the AI review loop each child runs, and how the orchestrator reads a child's diff),
  [`plan-tib`](../../commands/plan-tib.md) / [`create-tib`](../../commands/create-tib.md) (the
  spec a project usually points at).
