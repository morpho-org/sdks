# execute-project

Execute a Linear project end to end: ingest the project overview and every attached resource, map the issue graph (blocks / blocked-by), then implement the issues in dependency waves — one child agent or sub-session per issue — as stacked draft PRs so dependent work never waits for a merge to the default branch.

Ported from the `morpho-apps` skill of the same name and adapted to this repo: slash-command layout (`.agents/commands/`), no stacked-PR CI (GitHub-native base retargeting + a hand-maintained stack map instead of a `Stack children` workflow), Changesets for release notes, and this repo's `/create-pr` + `/review-pr-{local,gh}` review flow.

## Usage

```
/execute-project <linear-project-name-id-or-url> [--only SDK-101,SDK-104] [--dry-run]
```

- `--only` restricts execution to the listed issues (and refuses to run one whose blockers are not in the list or already done).
- `--dry-run` runs Steps 1-5 and stops after the plan is presented. Nothing is dispatched and nothing is written to Linear — decisions are recorded in the context pack only.

Not for a single ticket (open it directly and follow `/create-pr`), for creating or spec'ing a project (`work-loop:write-plan`), or for turning a document into issues (`work-loop:extract-plan`).

## Linear MCP tools

This command drives Linear through the Linear MCP. Tool names are prefixed by host — `mcp__linear__get_project` on a Devin session, `mcp__claude_ai_Linear__get_project` on a Claude Code session with the claude.ai connector. Below they are named by function (`get_project`, `list_issues`, `get_issue`, `list_comments`, `list_documents`, `get_document`, `get_attachment`, `save_issue`, `save_comment`); use whichever prefix the host exposes. If no Linear MCP is connected, stop and tell the user — this command cannot run without it.

## Definitions

- **Issue graph**: the project's incomplete issues plus the `blockedBy` / `blocks` edges between them. Edges to completed issues are satisfied and dropped. Edges to cancelled issues are **not** satisfied — the work never landed — and raise a go/no-go for each dependent (Step 5). Edges to issues outside the project are **external blockers**.
- **Wave**: the set of issues whose blockers are all either done or already assigned to a branch in the current run. Wave 1 is the unblocked issues.
- **Stack**: a chain of PRs where a **root** PR targets the default branch and a **child** PR targets its parent's head branch. GitHub retargets a child to the default branch automatically when its parent merges. This repo has **no stacked-PR automation workflow** — the orchestrator maintains the stack map by hand (Step 8) and each PR ships its own Changeset, so release notes come from Changesets, not from carried `Closes` lines.
- **Go/no-go**: a question to the user with concrete options. The orchestrator asks it whenever it would otherwise have to guess (Step 5). Uncertainty is a reason to ask, never a reason to skip.

---

## Instructions

### Step 1: Resolve the project

1. Parse `$ARGUMENTS`. A `https://linear.app/...` URL yields the project slug; a name, ID, or `P-TEAM-N` identifier is used directly. With no argument, ask which project to execute.
2. `get_project` with `includeMilestones: true`, `includeMembers: true`, `includeResources: true`. If it cannot be found, `list_projects` with the text as `query` and ask the user to pick.
3. Record: name, teams, lead, status, health, start/target dates, milestones (ordered by target date then name), and the description (the **overview**).

### Step 2: Ingest the project context

Read everything the project points at, in parallel, before looking at a single issue:

1. **Overview** — the project description. Extract the requirements (`R-x`), assumptions (`A-x`), out-of-scope items, and open questions (`Q-x`). Open questions with no default are go/no-go candidates in Step 5.
2. **Resources** — every document, link, and attachment from `includeResources`:
   - Linear documents: `get_document`. Also `list_documents` with `projectId` to catch documents attached after the resources list was cached.
   - Repo files (ADRs under `docs/adrs/`, plan docs, `docs/*.md`, per-package `AGENTS.md`): `Read` them from the checkout.
   - GitHub PRs and issues: `gh pr view <n> --json title,body,state,url` / `gh issue view`.
   - Other URLs (Notion, Figma, docs sites): `WebFetch`. For a URL you cannot reach (Slack thread, auth-gated page), record it as an **unread source** — do not summarise from its title.
3. **Project comments and status updates** — `list_comments` with `projectId` (the tool accepts exactly one of `issueId` / `projectId`; `save_comment` takes the same parents). Later comments override earlier decisions in the overview when they clearly settle a question.
4. **Repo conventions** — root `AGENTS.md` (`CLAUDE.md` is a symlink to it), `MISSION.md`, `docs/DEVELOPMENT-LIFECYCLE.md`, `docs/jsdoc-style.md`, and the scoped `AGENTS.md` of every package the project touches (identify them from the overview and the issues' scopes). The root `AGENTS.md` §2 forbidden-patterns list and §7 release rules are binding on every child.

Write the result to a **context pack** at `.context/execute-project/<project-slug>/context.md` (`.context/` is the workspace scratchpad, ignored by the root `.gitignore` so it can never be staged by `/create-pr`'s `git add -A`): project summary, requirements, assumptions, out-of-scope, open questions, decisions found in comments, one paragraph per resource with its URL, the unread-source list, and the repo conventions that apply. Every child brief links to this file. Keep it current when the user answers a go/no-go.

### Step 3: Build the issue graph

1. `list_issues` with `project` set to the project ID; paginate with `cursor` until `hasNextPage` is false.
2. For every issue, `get_issue` with `includeRelations: true` to get `blockedBy`, `blocks`, `parent`/sub-issues, `branchName`, attachments, and the full description. For every incomplete issue also `list_comments` — comments may hold decisions, PR links, or a human saying "I'm on this".
3. Classify each issue: **Done** (completed status type), **Cancelled** (cancelled status type; its dependents are go/no-go items — the user drops the edge, rescopes, or skips), **Human-owned** (status In Progress / In Review with a non-agent assignee, or an open PR from a branch that is not ours), **Candidate** (everything else).
4. Build the graph over Candidates. Drop satisfied edges. Flag **external blockers** (blockers outside the project or Human-owned) — an issue behind one cannot be executed in this run unless the user says otherwise in Step 5.
5. Detect and report cycles (`A blocks B blocks A`). A cycle is a go/no-go: the user picks which edge to ignore or fixes Linear.
6. Compute waves with a topological sort. Inside a wave, order by priority (Urgent → Low), then milestone order, then identifier.
7. Assign each Candidate a **stack position**:
   - Zero open blockers → **root**, branch from `origin/main` (or the repo's default branch — resolve it with `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`).
   - Exactly one open blocker → **child** of that blocker's branch.
   - Two or more open blockers → **multi-parent**. Prefer the blocker with the longest downstream chain as the parent, and mark the issue for a go/no-go (Step 5) because the second blocker's changes will be missing from its base until one of them lands on the default branch.
   - Review-free work (every touched path resolves only to the org-wide `*` owner in `.github/CODEOWNERS` — never a scoped owner like `@morpho-org/security` for `/.github/`, `/.changeset/config.json`, `/.npmrc`, lockfiles, or `package.json`) stays a **root** only when it has zero open blockers. A real dependency wins: dependent review-free work stays stacked on its blocker's branch.

### Step 4: Audit each candidate against the context pack

For every Candidate, decide whether the issue is **executable as written**. An issue passes when:

- Its description is complete enough that a child could start without asking: a Context section, references, and a possible solution or acceptance criteria.
- It maps to at least one requirement in the overview, or the overview is silent and nothing in Out of scope excludes it.
- Its scope (title prefix, referenced paths) routes to a package the project owns.
- It carries no unresolved open question (`Q-x` with no default) and no comment that reverses it.
- It does not touch a **guarded surface**: release PRs (`version-pr.yml` output / the Changesets release PR), publish flow (`publish.yml`, `--provenance`, `NODE_AUTH_TOKEN`), `.changeset/config.json`, `.npmrc`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, any `package.json`, `.github/workflows/**`, `.github/CODEOWNERS`, branch protection, secrets or environment variables, or **pinned protocol ABIs and addresses** (the source-of-truth registries — changing these is a protocol-routing decision, not routine work). These route to `@morpho-org/security` or a protocol owner and need explicit approval.

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
| 1 | SDK-101 | feat(blue-sdk): add RBAC entity | High | root | main | OK |
| 2 | SDK-102 | feat(morpho-sdk): surface RBAC | High | child of SDK-101 | <branch-101> | OK |
| 2 | SDK-103 | docs(morpho-sdk): document RBAC | Normal | root (review-free) | main | OK |
| 3 | SDK-105 | feat(morpho-sdk): RBAC facade | Normal | multi-parent (101, 104) | <branch-101> | ASK |

### Dependency graph
SDK-101 → SDK-102 → SDK-105
SDK-104 → SDK-105
SDK-103 (independent)

### Go/no-go
1. SDK-105 has two open blockers; stacking on SDK-101 leaves SDK-104's changes out of its base until one merges. Options: stack on 101 and rebase later · wait for 104 to merge, then have 101's child rebase onto the default branch before 105 is dispatched · skip.
2. SDK-107 edits `.changeset/config.json` (guarded surface, owned by @morpho-org/security). Options: execute · skip · execute but stop before pushing.
3. Q-2 in the overview ("which chains are in scope?") has no default and SDK-101 depends on it. Options: <the plausible answers> · skip SDK-101 and everything behind it.

### Not executed this run
- SDK-110 — human-owned (@alice, In Progress, #6012 open)
- SDK-111 — blocked by MKT-2261 (outside the project)
```

Ask each go/no-go through the host's structured question tool with the options above and a recommendation, batching the ones whose prerequisites are settled. An issue with an open question is **not dispatched** until answered. If the user does not want to answer now, treat the item as "skip" and say so in the report. Then ask **"Execute this plan?"** — options: **execute all**, **execute waves 1-N**, **execute only <ids>**, **edit** (change a base, skip an issue, re-parent a multi-parent issue), or **stop**. With `--dry-run`, stop here.

Record every answer in the context pack under `## Decisions` with the issue ID and date. A decision that changes an issue's scope also goes back to Linear as a comment on that issue (`save_comment`) so the ticket, not the chat, carries it — except under `--dry-run`, which never writes to Linear.

### Step 6: Dispatch waves to child agents

Every issue runs in its **own child agent or sub-session** — never in the orchestrator's context. Pick the host's primitive:

| Host        | Primitive                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code | `Agent` tool, `general-purpose` type (or a specialist type when the issue is clearly protocol/contract work). One call per issue, in one message per wave so they run concurrently.  |
| Codex       | One custom agent per issue when a match exists, else the general agent.                                                                                                              |
| Devin       | One **Linear-triggered** session per issue, adopted by the orchestrator (below). Fall back to a plain child session only when the trigger does not fire. Attempt this path **only when the parent session is itself Devin**. |

Children that share the orchestrator's machine each work in their **own git worktree** (`git worktree add -b <branch> ../wt-<issue-id> <base>`), never in the orchestrator's checkout. Children on their own machines (Devin sessions) clone the repo themselves; the brief tells them the exact base ref to fetch.

For each issue in the wave, before dispatch:

1. `save_issue` — set `state` to **In Progress**. Do not change the assignee; add a comment `Execution started by /execute-project — branch <name>, base <base>` instead (on Devin the trigger comment below carries this line, so post only one comment).
2. Branch name: the issue's `branchName` from Linear when present (that is what Linear links on), else `<type>/<issue-id-lowercase>-<slug>` — the identifier must appear in it. Type is `feat` / `fix` / `chore` / `docs` per the repo's conventional-commits style.

**Devin orchestrator — trigger through Linear, then adopt.** Linear's agent-session linkage exists only for sessions started _from_ Linear, so a Devin orchestrator does not create children directly:

1. Post the child brief as a single issue comment (`save_comment` with `issueId`) that starts with an `@Devin` mention. The mention starts a Devin session with the comment as its task and links it to the issue. Do not also assign Devin or add a playbook label — each is a separate trigger and would start a second session for the same issue.
2. Adopt the session: poll `devin_session_search` (`origins: ["linear"]`, `created_after` the comment time) until a session whose title or prompt carries the issue identifier appears, and record its ID in the context pack next to the issue. Wait on it with `devin_session_interact` `get` (status) and steer it with `message` — the same review, re-brief, and rebase instructions as for any child go through `message`.
3. If no session appears within a few minutes, the integration did not fire. Fall back to one child session with the same brief and comment its URL on the issue so the link exists at least as text; note the fallback in the Step 9 report.

**Claude Code / Codex orchestrator — sub-agents.** Do not mention or assign Devin in Linear; the issue is worked by a sub-agent of this session. The sub-agent's PR URL is commented on the issue in Step 7, which is the only link Linear gets.

**The child brief is self-contained** — the child sees none of this conversation. It contains:

- The issue identifier, title, full description, and every relevant comment, verbatim.
- The **absolute** path of the context pack (a local child may run in a separate worktree, where a relative `.context/...` path resolves to nothing) or its full text for a remote child, and the sentence "The project overview and its Decisions section override the issue description where they disagree."
- The exact **base ref** (`origin/main` or the resolved default branch, or `origin/<parent-branch>` for a child PR) and the exact **branch name** to create. For a child PR: "Your diff is reviewed against `<parent-branch>`; do not re-implement anything already on that branch, and do not merge the default branch into your branch."
- The repo rules that apply to every change: root `AGENTS.md` (the §1 layering rules, the §2 forbidden-patterns list, §3 type discipline, §6 JSDoc-on-every-export), the scoped `AGENTS.md` for the package, `docs/jsdoc-style.md`.
- **Changeset**: if the change touches published package source in a semver-relevant way, add a Changeset (`pnpm changeset`) with the correct bump per §7 — and audit direct runtime/peer dependents (e.g. a `blue-sdk` ABI/address/constant change must patch `morpho-sdk`). Do **not** add a changeset for docs-only, tests-only, fixture-only, generated-output-only, or repo-metadata changes.
- Validation to run before pushing, from the root `AGENTS.md` "Details for shared skills": `pnpm lint` (Biome + jsdoc-coverage + address + script-typecheck gates), `pnpm build` (recursive `tsc`), and `pnpm test run --project <name>` for each affected package's **unit** project. Fork projects (`<name>-fork`) need `MAINNET_RPC_URL` / `BASE_RPC_URL` in the env and are skipped when unset — the child says so rather than reporting a false green. Zero errors and zero warnings, or report BLOCKED with the output.
- PR instructions: open a **draft** PR assigned to `@me`. For a **root** (base = default branch), follow `/create-pr` for title/body. For a **child** (base = parent branch), run `gh pr create --draft --assignee @me --base <parent-branch>` with the same conventional-commits title and the `/create-pr` body shape; the first body line says `Stacked on #<parent-pr>`, and the body ends with a bare `Closes <ISSUE-ID>` line. The orchestrator adds the `Stack map: #<root>` line itself (Step 8). Marking the PR ready-for-review (or an `@claude` / `@codex review` comment) triggers the repo's automatic reviewers via `.github/workflows/claude.yml`; the orchestrator's own review (Step 7) is independent of that.
- **Stop conditions** — the child must **stop and report** rather than guess when: the issue needs a decision the context pack does not settle; the change would touch a guarded surface (Step 4) not approved in Decisions; the validation suite fails three times on the same error; the base branch no longer exists; or the child finds the issue already done on the default branch.
- The **report format**: `ISSUE-ID · status (DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT) · branch · PR URL · base · files changed · validation evidence · open questions`.

Dispatch the whole wave at once. Do not dispatch wave N+1 until every issue in wave N that it depends on has **pushed a branch with an open PR** — a merge is not required; that is the point of the stack.

### Step 7: Review each child's result before stacking on it

For every report:

1. Read the child's full diff (`git fetch origin <branch>` then `git diff <base>...origin/<branch>` — `<base>` is the ref from the brief and already carries its `origin/` prefix), not its prose. Check it against the issue, the context pack, and the root `AGENTS.md`. Run `/review-pr-gh <pr-number>` for a full persona pass on the child's PR (or `/review-pr-local <base>` on a locally-checked-out child branch). A report is a claim; the diff and the validation output are the evidence.
2. `DONE` with a clean diff: comment the PR URL on the Linear issue (skip when a Linear-triggered Devin session already attached it) and move it to **In Review** (or the team's equivalent). Its branch becomes a valid base for the next wave.
3. `DONE_WITH_CONCERNS`: decide. If the concern is scope (the child did more or less than the issue), send one consolidated correction brief to the same child. If the concern needs the user, it is a go/no-go and the issue's dependents wait.
4. `BLOCKED` / `NEEDS_CONTEXT`: answer from the context pack if you can, in one re-brief. Otherwise raise a go/no-go with the child's question verbatim and the options you see. Dependents of a blocked issue are **held**, never re-parented onto the default branch silently — re-parenting changes the plan the user approved.
5. Never squash, amend, or force-push a child's branch yourself. Corrections go back to the child as a brief.

### Step 8: Keep the stack healthy

- **Fix-ups on a parent**: when a parent branch gains commits after a child was branched from it, tell the child to rebase (`git fetch origin && git rebase origin/<parent>` then `git push --force-with-lease`). Children rebase their own branches; the orchestrator only tells them when.
- **Parent merges into the default branch**: GitHub retargets its children to the default branch, but their branches still carry the pre-merge commits. Brief the child to `git rebase --onto origin/main <old-parent-head-sha>` and force-push with lease, then confirm the PR diff shows only that issue's change.
- **Merge order**: children into the parent first, then the root into the default branch. The orchestrator does not merge; it tells the user what is mergeable and in which order. There is no `Stack children` automation in this repo — each PR carries its own Changeset, so nothing needs to propagate `Closes` lines between PRs.
- **Release notes come from Changesets.** When a root merges to the default branch it does not publish; it updates the Changesets release PR (`version-pr.yml`). The orchestrator does not touch that release PR — it is a guarded surface (Step 4).
- **Stack map**: GitHub shows a stack only as a flat list, and Linear not at all, so the orchestrator maintains one. Every root PR with at least one child carries a nested ordered list of its stack in the description, inside orchestrator-owned markers (a single-PR root skips the block). The nesting is the tree: each PR's children are nested under it, the root is last. The merge order is bottom-up: a PR merges only after everything nested under it has merged, and siblings merge top to bottom. Review in the same order, deepest first:

  ```markdown
  <!-- stack-map:start -->
  ### Stack (merge bottom-up: a PR merges after everything nested under it)

  1. ([SDK-102](https://linear.app/<org>/issue/SDK-102), [#6233](https://github.com/<org>/<repo>/pull/6233)) add adapter cap edit flow — needs @morpho-org/sdk-engineers
     1. ([SDK-107](https://linear.app/<org>/issue/SDK-107), [#6240](https://github.com/<org>/<repo>/pull/6240)) clamp cap input to vault limit — approved
  2. ([SDK-104](https://linear.app/<org>/issue/SDK-104), [#6235](https://github.com/<org>/<repo>/pull/6235)) cover cap edit flow in fork test — review-free
  3. ([SDK-101](https://linear.app/<org>/issue/SDK-101), [#6230](https://github.com/<org>/<repo>/pull/6230)) add cap-limit hooks — needs @morpho-org/sdk-engineers (root)
  <!-- stack-map:end -->
  ```

  Here the merge order is #6240, #6233, #6235, #6230. Each line: `([<issue-id>](<linear-url>), [#<pr>](<pr-url>)) <description> — <review state>`. The description is the PR title without its `<type>(<scope>):` prefix; both links are full URLs so the same line renders in GitHub, Linear, and Slack. The review state is the code owners GitHub requested, whether they approved, or `review-free` when the PR touches only org-wide-owned files; the root line ends with `(root)`. CI state is not on the line — it changes on every push; the **Stack ready for review** post below is the CI signal. Only the orchestrator writes between the markers (`gh pr edit <root> --body-file`, rebuilding the block in full and leaving the rest of the body untouched). Rebuild the map whenever a PR in the stack opens, changes base, gets a review, or merges — a merged child stays in the list, struck through. Child PR bodies keep their `Stacked on #<parent-pr>` first line and gain one line linking the root (`Stack map: #<root>`), so any PR in the stack leads back to the map.

- **Stack ready for review**: when every issue in a stack has an open PR with green CI and a finished review pass, post the same nested list (without the markers) as a comment on the Linear issue of the root and to the user, headed `Stack ready for review: <root PR title>`. Re-post only when the stack's shape changes (a PR added or re-parented), not on every review event. If the stack stops being ready afterwards (an approval dismissed, CI red, a PR reopened), edit the Linear comment to say so rather than leaving it advertising a stale state.
- **CI**: a red check on a child PR goes back to that child with the failing job log. A red check caused by the parent goes to the parent's child agent, and the dependents wait.

### Step 9: Report

When every dispatched issue has reported and every go/no-go is answered or skipped, post:

```
## Executed: <project-name>

| Wave | ID | Title | PR | Base | Status | Notes |
| ---- | -- | ----- | -- | ---- | ------ | ----- |

### Stacks
1. ([SDK-103](https://linear.app/<org>/issue/SDK-103), [#6231](https://github.com/<org>/<repo>/pull/6231)) document cap limits — review-free
2. Stack: [#6230](https://github.com/<org>/<repo>/pull/6230) (root) — merge bottom-up
   1. ([SDK-102](https://linear.app/<org>/issue/SDK-102), [#6233](https://github.com/<org>/<repo>/pull/6233)) add adapter cap edit flow — needs @morpho-org/sdk-engineers
      1. ([SDK-107](https://linear.app/<org>/issue/SDK-107), [#6240](https://github.com/<org>/<repo>/pull/6240)) clamp cap input to vault limit — approved
   2. ([SDK-101](https://linear.app/<org>/issue/SDK-101), [#6230](https://github.com/<org>/<repo>/pull/6230)) add cap-limit hooks — needs @morpho-org/sdk-engineers (root)

### Skipped / held
- SDK-105 — waiting on decision 1 (multi-parent)
- SDK-110 — human-owned

### Unread sources
- <url> — <why it could not be read>
```

The `Stacks` section lists every root with its stack map (Step 8) nested under it, full URLs, same bottom-up merge rule, so it can be pasted into Slack as-is. Post the same summary as a comment on the Linear project (`save_comment` with the project ID) so the next run — or a human — starts from it. End with the completion status: `DONE` when every candidate has a reviewed PR, `DONE_WITH_CONCERNS` when any issue is held, skipped, or has unread sources, `BLOCKED` when a go/no-go stops the run, `NEEDS_CONTEXT` when the project cannot be resolved or has no candidates.

---

## Re-running

The command is idempotent per project. On a second run, Step 3 finds issues already **In Review** with a PR from an expected branch and treats them as satisfied blockers (their branch is the base for dependents). It never opens a second PR for an issue that has an open one; it re-briefs the existing child (or a new child with the existing branch) instead. The project comment from Step 9 is the handover record between runs.

## Notes

- The orchestrator writes to Linear only through `save_issue` (state) and `save_comment` (progress, decisions, PR links, and — on Devin — the `@Devin` trigger brief). It never edits descriptions, relations, or assignees.
- The orchestrator never pushes code. Every commit comes from a child on its own branch.
- One issue, one child, one branch, one PR. A child that wants to split its issue reports `NEEDS_CONTEXT` and the split is a go/no-go — file the new ticket if approved.
- Optimise for the stack: the graph, not the merge queue, decides what runs. Waiting for the default branch is the exception (multi-parent issues the user chose to wait on), never the default.
- Related: `/create-pr` (what a root child follows for its PR), `/review-pr-gh` and `/review-pr-local` (how the orchestrator reviews a child's diff), `/fix-pr` (apply review findings on an open PR), and the shared `work-loop:write-plan` / `work-loop:extract-plan` skills (create the project and issues this command executes).
