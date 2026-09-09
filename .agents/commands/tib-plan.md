# tib-plan

Turn an accepted **TIB** into the disposable **implementation plan** that carries it out: a set of
Linear tickets, each scoped to **one PR**, each describing **how** the code will be written.

`tib-plan` is the sibling of [`tib-create`](./tib-create.md). They split one decision across two
artifacts:

- **`tib-create` → the TIB.** Frozen, in the repo, answers **what + why**. Contains only
  observable/contractual decisions (signatures, behavior, invariants, rationale).
- **`tib-plan` → the tickets.** Disposable, in Linear, answers **how**. Contains exactly the
  material the TIB deliberately excluded — the "what does NOT belong in a TIB" cheat sheet from
  `tib-create`: files to touch, private signatures, encoder structure, edit order, test file names
  and cases, the changeset and release plumbing.

> **One TIB → N tickets → N PRs.** The tickets are the *inverse* of the TIB. If a detail would read
> as false after a routine refactor, it was banned from the TIB — which means it belongs **here**.

## Usage

```
/tib-plan docs/tibs/TIB-2026-08-25-blue-bundles-v1-sdk-actions.md "BlueBundlesV1 SDK route"
```

- `$ARGUMENTS` should contain: `<tib-file-path> [linear-project-name-or-id]`
- If **one argument** is given, treat it as the TIB path and ask for the target Linear project.
- If **no arguments** are given, ask:
  1. _"Which TIB should I plan? (path under `docs/tibs/`)"_
  2. _"Which Linear project should the tickets land in? (name or ID, or 'new' to create one)"_

The input is normally a TIB, but any structured decision doc (RFC, ADR, design note) works — the
steps adapt to whatever sections are present.

---

## The two objectives, above everything else

Everything below serves two goals. When a rule seems to conflict, these win:

1. **1 ticket = 1 PR.** A ticket is right-sized when its work lands as a single, independently
   reviewable, independently releasable PR — carrying its own tests, JSDoc, and changeset. Not
   smaller (don't split a feature from its tests), not larger (don't fold two package bumps or two
   release trains into one).
2. **The ticket describes the _how_, technically and concretely.** A competent engineer (or agent)
   should be able to open the ticket and start typing: which files, which signatures, which
   encoder, which ABI/address source, which layer, which tests at which pinned block, which
   changeset. Vague tickets are a failure of this command, not of the author who receives them.

---

## Instructions

### Step 1 — Parse arguments

Resolve the TIB path and the Linear project per **Usage**. If the project is `"new"`, you create it
in Step 6. Do **not** create a git branch or touch code — this command produces Linear artifacts and
(optionally) a plan file only.

### Step 2 — Read the TIB, then ground yourself in the repo

You cannot write a technical *how* without reading the code the *how* lands in. This step is what
separates a real plan from a restatement of the TIB. Do all of it before drafting a single ticket.

**2a. Read the TIB in full** and extract its skeleton:

| TIB section (names vary)          | What it gives the plan                                                        |
| --------------------------------- | ----------------------------------------------------------------------------- |
| **Scope** (metadata)              | Which packages bump and to which versions — the backbone of ticket boundaries |
| **Context / Goals / Non-Goals**   | Project description; non-goals become explicit "out of scope" ticket lines    |
| **Decision**                      | The rule each ticket must honor — cite it per ticket                           |
| **Public interface**              | The exact signatures to add/change/remove/deprecate — the contract to hit     |
| **Behavior**                      | The `if X then Y` edge cases each implementation ticket must encode           |
| **Invariants**                    | The properties each ticket's tests must fail-if-removed                        |
| **Breaking changes & migration**  | **Release ordering** → milestones; per-package bumps → changesets; peer audits |
| **Acceptance / Verification**     | Seeds each ticket's acceptance criteria and its fork/unit test list           |

**2b. Ground in the repo** — for every package the TIB's **Scope** names (and every package those
transitively touch, e.g. a `morpho-sdk` facade over a `blue-sdk` change):

- Read `packages/<pkg>/src/index.ts` — the current public surface, so you name the *actual*
  symbols/signatures the TIB changes, not invented ones.
- Read the package's `AGENTS.md` and the root `AGENTS.md` sections the decision touches: layering
  (§1), forbidden patterns (§2), public API & packaging (§4), testing & security invariants (§5),
  releases & deprecation flow (§7).
- `git log --oneline -20` and any existing branch work for the decision.
- Locate where the real onchain constants live (ABIs, addresses) so tickets cite the **source of
  truth**, not a copy — per §7 "pinned ABIs and addresses in-package".

**2c. Study how a comparable TIB was split** into PRs, for calibration. `ls docs/tibs/` and pick the
nearest prior decision; skim its merged PRs (`gh pr list --search "<slug>" --state all`) to see the
real granularity. The blue-bundles-v1 TIB, for example, shipped as a prerequisite deprecation/ABI PR
followed by chained per-method-group PRs (position → supply/withdraw → refinance) — one coherent
method group per PR, tests included, hard-ordered by release train. Match that standard.

**Never ask the user what you can read.** Signatures, current behavior, package boundaries, and
prior PR granularity are all in the repo.

### Step 3 — Decompose into PR-sized tickets

This is the core of the command. Build the ticket list from the TIB skeleton + repo grounding.

#### The "1 ticket = 1 PR" heuristics (SDK monorepo)

**Split into separate tickets when:**

- **A release train boundary forces it.** If the TIB mandates a deprecation minor (or a
  prerequisite patch: Permit2 fix, pinned ABI, address bump) that must **publish before** a breaking
  major, those cannot land in one PR — they are separate tickets, hard-ordered (`blockedBy`). This
  is the most common and most important split; it comes straight from the TIB's release ordering.
- **A layer can land and be tested independently.** Action-layer encoders (pure, unit-testable via
  calldata snapshots) can ship before the entity wiring that consumes them. A new package scaffold
  ships before the modules added to it.
- **Coherent method/feature groups are large.** A five-method route splits into 2–3 tickets by
  method group (e.g. supply/withdraw, then collateral+borrow, then migration), each a self-contained
  PR with its own fork tests — rather than one unreviewably large PR.
- **A cross-package peer-range widening can land on its own** (e.g. widening a downstream package's
  `morpho-sdk` peer range once the new major is verified).

**Keep as ONE ticket (do not over-split):**

- **Tests ship with the code they test.** Never a "write tests for X" ticket separate from "build
  X". Same for that ticket's JSDoc and its changeset — §8 "one concern per PR; tests, JSDoc, and any
  changeset land with the change."
- **A `blue-sdk`/`midnight-sdk` consumer-facing change and its `morpho-sdk` facade audit.** §4
  requires the facade subpath to be audited **in the same PR** as the upstream ABI/address/constant/
  entity/error/type change — so that pairing is one ticket, not two.
- **All layers of one atomic behavior** (Client → Entity → Action) when the behavior only makes
  sense whole and has no independently-testable seam.

**A ticket is correctly sized when all of these hold:**

- It changes one coherent surface a reviewer can judge against the TIB in one sitting.
- It ships its own tests (unit always; fork at a pinned block wherever correctness depends on real
  onchain state — oracles, accruals, health under live IRMs, contract reverts).
- It ships its own JSDoc on every new/changed export and exactly the changeset(s) its package
  bump(s) require.
- It can be reverted without unpicking unrelated work.

#### Ordering & dependencies

Set `blockedBy` / `blocks` only where a **real** dependency exists:

- **Release ordering is a hard blocker.** The deprecation/prerequisite ticket blocks the
  breaking-major ticket (must publish first).
- **Producer before consumer.** The encoder ticket blocks the entity-wiring ticket; the
  pinned-ABI/address ticket blocks every ticket that encodes against it; the package-scaffold ticket
  blocks its module tickets.
- Do **not** invent cross-milestone blockers for every pair. Independent method-group tickets in the
  same train can proceed in parallel unless they share a seam.

#### Milestones = release trains

Map milestones to the TIB's **release ordering**, not to generic "Foundation / Polish":

- If the TIB defines a sequence (e.g. _"Train A: V1 reallocation deprecation minor, published first;
  Train B: 6.0.0 major"_), each train is a milestone, ordered, named for what it ships.
- If the TIB has no explicit ordering, derive milestones from logical groupings (e.g. per package,
  or scaffold → implement → migrate) and confirm them with the user in Step 5.

#### Scope detection → Linear team

Suggest a team from the TIB **Scope** and the paths it touches:

- `packages/blue-sdk*`, `packages/morpho-sdk`, `packages/midnight-sdk`, `packages/evm-simulation` →
  core SDK
- `packages/*-viem`, `packages/*-wagmi`, `packages/wdk-*`, `packages/*liquidity*` → integration
  packages
- `scripts/`, root configs, `.changeset/`, `pnpm-workspace.yaml`, cross-package → repo-wide

If `CLAUDE.md` has a **Team IDs** table, resolve to that team ID. Otherwise ask which Linear team to
file under, and offer to record the answer in `CLAUDE.md` for next time.

### Step 4 — Write each ticket

Each ticket has a **title** and a **description**. Titles follow conventional-commit form, one
package prefix, matching the PR that will implement it:

```
feat(morpho-sdk): route Blue supply/withdraw through BlueBundlesV1
fix(blue-sdk): pin BlueBundlesV1 ABI and registry address
chore(liquidity-sdk-viem): widen morpho-sdk peer range to ^6.0.0
```

Description — use this template. It is deliberately the **inverse of the TIB**: everything here is
the swappable *how*. Drop any section a given ticket has no content for.

```markdown
> ⚠️ AI-generated implementation plan — a starting point, not a prescription. The TIB is the
> contract; if this plan and the TIB disagree, the TIB wins. Regenerate freely.

## Context
Implements <TIB-ID> §<section>. One or two lines: what this PR delivers and the decision it carries.

## Scope (this PR)
- **Package(s):** `@morpho-org/<pkg>` — bump: `patch` | `minor` | `major`
- **Layer(s):** Client | Entity | Action | Helpers | Facade | Test
- **Depends on:** <ticket ids that must merge/publish first, or "—">
- **Out of scope:** <the TIB non-goals or later-train work this PR must not touch>

## Implementation
### Files to touch
- `packages/<pkg>/src/<path>.ts` — <what changes here>
- `packages/<pkg>/src/index.ts` — <re-exports added/removed>

### Signatures, types & encoding
- <the private/internal signatures the TIB omitted: `functionName(args): Return`>
- **Encoder:** how calldata is built — which ABI, which contract/target address, which args.
- **Layer discipline:** what reads state (Entity, async) vs what encodes (Action, sync, no I/O) —
  must respect `Client → Entity → Action` (§1); no `async`/network/signing in actions (§2.3).

### Source of truth
- **ABI / address:** where it is pinned in-package (§7) — cite the file, not a copy.
- **Types/errors:** reuse existing SDK types (`Address`, `MarketId`, `MarketParams`, …); new failure
  modes are named exported error classes, never `throw new Error` (§2.2, §3).

### Edge cases & invariants to honor
- <from the TIB Behavior/Invariants: rounding direction, zero/max-input meaning, refund handling,
  required authorizations, atomicity — the cases natural to implement wrong>

## Tests
- **Unit** (`<file>.test.ts`, colocated): <encoder calldata inline snapshots; zero/max legs; errors
  asserted by class identity>. Property-based (`fast-check`) on encoders where inputs are enumerable.
- **Fork** (`test/<name>.integration.test.ts`, pinned block): <which entrypoints/markets/fixtures;
  which chain; note the RPC env it needs>. Required wherever correctness depends on live onchain
  state; a transport mock is not sufficient there (§2.6, §5).
- **Security invariants** (§5): <the failing-if-removed test for chainId validation / authorization /
  accounting / LLTV buffer this PR touches>.

## Docs & release
- **JSDoc** (§6) on every new/changed export: description, `@param`, `@returns`, `@throws`, one
  runnable `@example`.
- **Changeset:** `<pkg>` `<patch|minor|major>` — "<one-line>". **Peer-dependent audit:** <which
  maintained dependents need a patch/range bump in this same changeset (§4, §7)>.
- **Migration guide / deprecation:** <if major or deprecating — the `@deprecated` note or migration
  section this PR adds>.

## Acceptance criteria (maps to TIB Verification)
- [ ] <objective checks a reviewer/agent runs against the PR — pulled from the TIB's
      Acceptance/Verification, each tied to a test where the TIB says an invariant needs one>

## References
- TIB: `<tib-path>` (§Decision, §Public interface, §Behavior)
- <contract source at pinned revision, related tickets, prior PRs>
```

Also set, per ticket: **priority** (1 Urgent for critical-path/prerequisite, 2 High for the core
train, 3 Normal for later trains, 4 Low for deferred follow-ups), an optional **estimate** (1 small
/ 2 medium / 3 large / 5 XL — an XL is a hint to split further), and **labels** (e.g. `["Feature"]`,
`["Bug"]`, `["Chore"]`) matching the conventional-commit type.

### Step 5 — Present the plan for review (before creating anything)

Show the full plan and get explicit approval:

```
## TIB → Linear plan

**Source TIB:** <tib-path>
**Project:** <name> (existing | new)   **Team:** <name> (<key>)
**Milestones (release trains):** N     **Tickets (= PRs):** N

### Milestone 1 — <Train A: … (publishes first)>
| # | Title                                                  | Pkg · Bump          | Pri | Est | Blocked by | Blocks |
|---|--------------------------------------------------------|---------------------|-----|-----|-----------|--------|
| 1 | fix(blue-sdk): pin BlueBundlesV1 ABI + address         | blue-sdk · patch    | 1   | 2   | —         | #3,#4  |
| 2 | feat(morpho-sdk): deprecate V1 reallocation flows      | morpho-sdk · minor  | 1   | 2   | —         | #5     |

### Milestone 2 — <Train B: 6.0.0 major>
| # | Title                                                  | Pkg · Bump          | Pri | Est | Blocked by | Blocks |
|---|--------------------------------------------------------|---------------------|-----|-----|-----------|--------|
| 3 | feat(morpho-sdk): route supply/withdraw via BundlesV1  | morpho-sdk · major  | 2   | 3   | #1        | #4     |
| 4 | feat(morpho-sdk): route collateral+borrow / repay      | morpho-sdk · major  | 2   | 3   | #3        | —      |

### Dependency graph
#1 → #3 → #4
#2 → #5
```

Then ask:

> **Does this plan look good?**
> - **"create all"** — create the project, milestones, and every ticket
> - **"create milestone 1 only"** — a subset
> - **Edit** any item (retitle, re-scope, move between milestones, merge/split tickets, re-point a
>   dependency, drop one)
> - **"skip"** — cancel, create nothing

Re-splitting or merging tickets here is normal — the whole plan is disposable.

### Step 6 — Create in Linear

Once approved, create in this order. Linear MCP tool names differ by connected server — use whichever
namespace is present:

| Operation        | Self-hosted Linear MCP        | claude.ai Linear connector          |
| ---------------- | ----------------------------- | ----------------------------------- |
| find project     | `mcp__linear__list_projects`  | `mcp__claude_ai_Linear__list_projects` |
| find team        | `mcp__linear__list_teams`     | `mcp__claude_ai_Linear__list_teams` |
| create project   | `mcp__linear__create_project` | `mcp__claude_ai_Linear__save_project` |
| create milestone | `mcp__linear__create_milestone` | `mcp__claude_ai_Linear__save_milestone` |
| create/update issue | `mcp__linear__create_issue` / `..._update_issue` | `mcp__claude_ai_Linear__save_issue` |

Always resolve project/team **names to IDs** first (`list_*`) before creating artifacts.

**6a. Project (if "new").** Create with: name; description = Vision (TIB Context) + Motivation (Goals)
+ Scope + a link to the TIB path; team. If the TIB is still `Proposed`/`Draft`, note the decision may
change.

**6b. Milestones.** Create in train order: name = the release-train name; description = the TIB's
release-ordering text for that train; attach to the project.

**6c. Issues — two passes** (avoids forward-reference gaps):

- **Pass 1 — create every issue** in dependency order (no-`blockedBy` first): title, description
  (the Step 4 template), team, project, milestone, priority, estimate, labels. Default **state =
  Backlog** unless the user overrides. Store each returned issue ID.
- **Pass 2 — set relationships**: update each issue with its `blockedBy` / `blocks` using the stored
  IDs.

### Step 7 — Confirm

Summarize what landed:

```
## Planned from <tib-file-name>

**Project:** <name> — <linear-url>

### Milestones
1. <Train A …> — N tickets
2. <Train B …> — N tickets

### Tickets created (N)
| ID        | Title                                             | Milestone | Blocked by |
|-----------|---------------------------------------------------|-----------|-----------|
| SDK-101   | fix(blue-sdk): pin BlueBundlesV1 ABI + address    | Train A   | —         |
| SDK-103   | feat(morpho-sdk): route supply/withdraw           | Train B   | SDK-101   |

### Dependency chain
SDK-101 → SDK-103 → SDK-104
```

Then remind the author: the tickets are disposable and regenerable from the TIB — if the code drifts
from a ticket, fix the ticket or re-run `/tib-plan`; the TIB stays frozen (`tib-create` Step 6.5).

---

## Notes

- **The TIB is the contract; tickets are disposable.** Never edit the TIB to match a ticket. A
  changed decision gets a new superseding TIB, not a rewritten plan.
- **One ticket, one PR, one changeset story.** If a ticket would produce two independent changesets
  for two release trains, it is two tickets.
- **Every ticket names its tests.** A ticket that touches onchain-state-dependent code without a
  pinned fork test in its Tests section is under-specified — fix it in Step 4, don't ship it.
- **Errors, types, and ABIs point at the source of truth** (§3, §7) — tickets cite where a symbol
  lives; they never instruct re-declaring an ABI or address that is already pinned in-package.
- Resolve all names to IDs before creating Linear artifacts, and create issues in dependency order so
  `blockedBy` references are valid.
- Do **not** create a git branch or write code — this command produces the plan only.

$ARGUMENTS
