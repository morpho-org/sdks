# tib-create

Scaffold and draft a TIB — **Technical Intent Brief**: the frozen, dated record of **what** we
decided and **why**. Asks the author targeted questions only where the brief cannot be written
without the answer.

## Usage

```
/tib-create "Route Blue actions through BlueBundlesV1"
```

- `$ARGUMENTS` should contain `<decision-title>` — free-form, used verbatim in the doc heading.
- If empty, ask once: _"What decision is this TIB recording?"_

---

## The one rule everything else follows from

**TIB = what + why. Code and Linear tickets = how.**

A TIB is not an implementation manual. Once accepted its **decision content is frozen** — the
decision, interface, behavior, invariants, and rationale are never rewritten — so anything a routine
refactor could make false must stay out of it. The TIB stays frozen **except** for two sanctioned,
non-substantive edits: relationship metadata (`Supersedes` / `Superseded by`) when a later TIB
replaces it, and dated operational **addenda** that clarify how the decision is applied without
changing it. That split also dictates where each artifact lives:

- The **TIB lives in the repo** — frozen, zero maintenance, the decision record sits next to the
  code.
- **Implementation detail lives outside the repo** (Linear tickets) — disposable, regenerated at
  will, never maintained. One TIB → N disposable plans.

Two consequences to apply on every line you write:

- The code always explains *what* the system does and never *why it had to change*. Context is
  unrecoverable from the repo — and it is what stops a future team from "fixing" a deliberate
  trade-off.
- Contradictions are far easier to detect between **rationales** than between implementations. A
  conflicting "why" exposes the problem at the intent level, which is a much stronger signal.

Most of the time and effort behind significant technical work should go into the TIB.

## The line: observable / contractual in, internal / swappable out

| In the TIB (observable, contractual)                            | Out of the TIB (internal, swappable)          |
| --------------------------------------------------------------- | --------------------------------------------- |
| Public function signatures — input & output types               | How an encoder is structured internally       |
| Observable behavior: "if X then Y"                              | Private helper signatures, variable names     |
| Invariants: rounding, ordering, atomicity, backward-compat      | The literal constant used to achieve behavior |
| Semver deltas: what is added, removed, deprecated               | List of files to touch, order of edits        |
| Which contract / target a transaction hits                      | Pseudo-code of each function                  |
| Release ordering, when it changes what ships                    | Test file names and individual cases          |

**The interface is part of the product, not the implementation** — it is a contract semver protects,
so it belongs in the TIB; the mechanics that produce it do not.

An architectural choice earns its place **only when it has an observable or semver consequence, or
when it _is_ the decision**:

- ✅ _"The returned transaction targets `BlueBundlesV1`, never Bundler3"_ — architecture, but
  integrators simulate the transaction, so it is observable. It stays.
- ❌ _"Simple actions delegate to the combined encoder with a zero inactive leg"_ — architecture with
  no observable consequence. It belongs in the code, not the brief.

## Two tests that settle any borderline line

1. **The compression test.** If removing a piece of information could lead two good engineers to
   build two functionally **different behaviors**, it must be in the TIB. If removing it only leads
   to two different but equally correct internal implementations, it does not belong.
2. **The agent acceptance test.** An agent given only the TIB + the repo must be able to determine,
   without ambiguity, whether a PR honors or violates the decision. If it cannot, you have a product
   blind spot — fill it. If the only thing it cannot determine is an internal mechanic, that is
   correct — leave it out.

Worked example — _"pure collateral-supply passes `maxLtv = maxUint256`, so an already-unhealthy
position can still improve"_:

- the **behavior** (unhealthy positions can still improve) passes both tests → in the TIB;
- the literal **`maxUint256`** fails both → it is a mechanic, leave it to the code.

These same two tests are the gate on every question you are allowed to ask (Step 3).

---

## Instructions

### Step 1 — Resolve metadata

```bash
DATE=$(date +%Y-%m-%d)
AUTHOR="@$(gh api user --jq .login 2>/dev/null)" || AUTHOR=$(git config user.name)
```

- **TITLE** — from `$ARGUMENTS`, verbatim in the H1.
- **DATE** — today, `YYYY-MM-DD`, the date the TIB is **created**. This is the TIB's only date: it
  feeds the identifier, filename, and H1, and later edits never re-date it. There is no separate
  acceptance or merge date — even when documenting a past decision, use today's creation date.
- **AUTHOR** — GitHub `@handle` when available, else `git config user.name`.
- **SLUG** — kebab-case from the title (lowercase, alphanumerics + hyphens, ≤ 60 chars).
- **PATH** — `docs/tibs/TIB-<DATE>-<SLUG>.md`.
- **ID** — `TIB-<DATE>-<SLUG>`, the filename stem. This is the TIB's **canonical, unique
  identifier**: cite it this way from other TIBs and fill `Supersedes` / `Superseded by` with the
  full slugged ID, never the date alone — two TIBs drafted the same day share a `<DATE>` and would
  otherwise collide. The H1 stays `TIB-<DATE>: <TITLE>` for readability; the slug in the ID is what
  disambiguates.
- **SCOPE** — the packages and target versions the decision binds (e.g. `morpho-sdk 6.0.0, WDK
  2.0.0`). If you cannot derive it from the repo, this is a legitimate Step 3 question.

If `PATH` already exists, **stop and report it** — accepted TIBs are frozen records and are never
overwritten. Pick a distinct slug, or, if this decision supersedes the existing one, create a new
dated file and fill `Supersedes` / `Superseded by` on both.

### Step 2 — Ground yourself in the repo before writing or asking

You are not allowed to ask about anything you could have read. Before drafting:

- `git log --oneline -20` and the diff of any branch work already related to the decision.
- The packages named in the title: their `src/index.ts` public surface, their `AGENTS.md`.
- The root `AGENTS.md` sections the decision touches — layering (§1), forbidden patterns (§2),
  public API and packaging (§4), testing and security invariants (§5), releases and the deprecation
  flow (§7).
- `ls docs/tibs/` — prior, superseded, and adjacent TIBs. Read the two most recent for house style
  and for decisions this one must not contradict.

**Structure comes from this command's `## Canonical template`, not from older files.** TIBs in
`docs/tibs/` that predate this rulebook are read for prior decisions and house style — never copied
for their section layout.

### Step 3 — Clarification protocol

You may ask the author questions. **A question is legitimate only when its answer changes a line of
the TIB.** Nothing else earns an interruption.

#### Admission test — all four must hold

1. **Section-bound.** You can name the section the answer lands in — Context, Goals / Non-Goals,
   Decision, Public Interface, Behavior, Invariants, Rejected alternatives, Breaking Changes &
   Migration, Acceptance Criteria, or a metadata field.
2. **Passes the compression test or the agent acceptance test.** Without the answer, two good
   engineers could build functionally different behaviors, or a reviewing agent could not tell
   whether a PR honors the decision.
3. **Not recoverable from the repo.** You already looked (Step 2) and the answer is not in the code,
   `AGENTS.md`, a prior TIB, or git history. A question you can answer by reading is a question you
   must not ask.
4. **Answerable by the decision owner in one or two sentences**, without designing the
   implementation.

If any of the four fails, drop the question. Do not soften it, do not ask it "just in case", and do
not bundle it as a rider on a legitimate question.

#### Never ask

- Which files to touch, or in what order.
- Private / non-exported signatures, internal helper structure, variable names.
- Pseudo-code or "call Y then Z" sequences.
- The literal constant used to achieve a behavior — ask about the **behavior**, then leave the
  constant to the code.
- Test file names or individual test cases — Acceptance Criteria states *what must be true*, never
  *which test asserts it*.
- Anything that would read as false after a routine refactor.
- File naming, output path, section ordering, formatting, tone — the template settles these.
- Anything the author already stated in `$ARGUMENTS` or in an earlier answer.

#### Coverage sweep — where "unclear or untreated" actually shows up

Walk the sections and mark each **sufficient**, **thin**, or **missing**. Only *thin* / *missing*
entries that clear the admission test become questions.

| Section                        | Probe                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Context                        | What force makes this necessary *now*? Which prior decision does the reader need to follow the rest?                                           |
| Goals / Non-Goals              | Which plausible-but-wrong PR must a non-goal preempt? What was deliberately left out?                                                          |
| Decision                       | Is a route / flag / fallback / coexistence choice left ambiguous? Can the decision be recited in three sentences?                              |
| Public Interface               | Which exported symbols are added, changed, removed, deprecated — and what are the input & output shapes?                                       |
| Behavior                       | What does a zero or max input mean? Rounding direction? Refund handling? Which authorizations are required? Which edge case is natural to implement wrong? |
| Invariants                     | What must hold no matter how the code is written (security, rounding, ordering, atomicity, backward-compat)? Which assumption, if broken, reopens the decision? |
| Rejected alternatives          | Which option would a smart person actually propose, and why was it rejected?                                                                   |
| Breaking Changes & Migration   | Which packages bump and by how much? What must callers change? What is the release ordering?                                                   |
| Acceptance Criteria            | Which invariants must have a test that fails if the invariant is removed?                                                                      |

#### How to ask

- **Batch, do not drip.** One round, at most 5 questions, ordered by how much of the brief each
  unblocks. Use `AskUserQuestion` with concrete options.
- **Propose the answer the repo implies, first.** You have read the code; a closed question with a
  recommended default beats an open one, and makes silence a usable input.
- **Show the stake.** Each question names the section it feeds and what changes depending on the
  answer — one clause is enough: _"Behavior — decides whether a zero-amount leg is a no-op or a
  revert."_ If you cannot write that clause, the question failed admission test 1. Drop it.
- **At most one follow-up round**, and only to resolve a contradiction the first round exposed (two
  answers that cannot both be true) — never to go one level deeper.
- **Never ask the author to choose between implementations.** If the choice has no observable
  consequence, it is not yours to raise and not theirs to settle here.

#### When an answer does not come

Never invent a decision, and never leave a placeholder heading:

- **Still needed before merge** → record it under `## Open Questions`, phrased as the question plus
  what it blocks. That section may hold blockers while the TIB is in progress, but **must be empty
  before the TIB merges**.
- **Deliberately deferred** → record it under `## Consequences` as accepted debt with its
  reassessment trigger. That is a decision, not an open question.
- **Turned out to be a mechanic** → drop it silently. It was never TIB material.

### Step 4 — Write the TIB

Write `PATH` from the `## Canonical template` below.

- **Drop every optional section you have no content for.** Delete the heading — never leave an empty
  placeholder, a `TBD`, or an `N/A`.
- **`Public Interface`, `Behavior`, and `Invariants` are gated independently, each on its own
  surface** — include `Public Interface` when the decision changes a public API, `Behavior` when it
  has observable runtime behavior, `Invariants` when it has a runtime invariant. Each is mandatory
  when its own surface applies (which is nearly every SDK TIB) and dropped — heading and all, like an
  optional section — when that surface does not. A decision may keep one and drop another: a pure type
  rename keeps `Public Interface` and drops the other two; a pure process, tooling, or documentation
  decision drops all three. Never keep any of them as an empty or `N/A` heading.
- **Context: 5–15 lines.** Explain the force, not the solution.
- **Decision states the rule, not the mechanics.** A reader must be able to recite it in three
  sentences without knowing a single internal type.
- **Behavior is a list of observable "if X then Y" rules.** Only the edge cases that change the
  design or are natural to implement wrong — not an exhaustive enumeration.
- **Invariants are what may not break, in terms that survive any refactor** — plus the assumptions
  the decision depends on.
- **Acceptance Criteria is a checklist a reviewer or agent can run against a PR** — what must be
  true, referencing which invariants need a failing-if-removed test, never test file names.
- Quote exported symbols in backticks. Use `bigint` literals and WAD scaling the way the packages do.

There is no `Status` field: acceptance is recorded by the TIB's own PR (Step 6), and a mutable status
line in a frozen document is exactly the kind of detail that rots.

### Step 5 — Self-review before handing it over

Run this against the draft and fix what fails:

- [ ] Every line is observable / contractual, or is the decision itself.
- [ ] Cheat-sheet sweep (below) finds nothing: no file lists, no private signatures, no pseudo-code,
      no variable names, no literal constant standing in for a behavior, no test names or cases.
- [ ] **Compression test** on each paragraph — would removing it only produce two equally correct
      internal implementations? Then cut it.
- [ ] **Agent acceptance test** — given only this TIB + the repo, can a reviewer decide whether a PR
      honors the decision? For extra confidence, hand the draft to a subagent with repo access, ask
      it to state the decision back and name what it cannot determine. Anything it cannot determine
      that is *not* an internal mechanic is a gap: fill it, or take it back to Step 3.
- [ ] Every invariant **that can be expressed as a test** — at minimum the security invariants of
      `AGENTS.md` §5 (security invariants are tests) — is covered by an Acceptance Criteria line that
      must fail if the invariant is removed. Non-testable invariants (release ordering, external
      assumptions) are stated but need no such test.
- [ ] Non-goals actually preempt the plausible-but-wrong PRs surfaced in Step 2.
- [ ] Nothing in the draft would read as false after a routine refactor.
- [ ] No empty section, no placeholder heading, no `TBD` outside `Open Questions`.

### Step 6 — Hand off

1. **Its own PR.** A TIB is proposed in a separate PR containing nothing else, and needs **at least
   one developer review** before it is accepted.
2. **No changeset.** A TIB is documentation, not a change to published package source
   (`AGENTS.md` §7).
3. **Then plan.** Once accepted, run `/extract-plan docs/tibs/TIB-<DATE>-<SLUG>.md "<project name>"`
   to generate the Linear tickets that carry the implementation detail. Those details live in the
   tickets — never back in the TIB.
4. **Then leave it alone.** A changed decision gets a new superseding TIB, with `Supersedes` /
   `Superseded by` filled on both. An operational clarification gets a dated addendum. Recurring
   mechanical addenda mean the line was drawn in the wrong place — move the detail out of the brief
   rather than amending it again (`AGENTS.md` §6).

---

## Canonical template

Sections in this order. Optional sections (Current Solution, Rejected alternatives, Breaking Changes
& Migration, Consequences, Open Questions, References, Addenda) appear only when they carry content.
`Public Interface`, `Behavior`, and `Invariants` are each gated on their own surface: include
`Public Interface` only when the decision changes a public API, `Behavior` only when it has
observable runtime behavior, and `Invariants` only when it has a runtime invariant. Each is mandatory
when its surface applies and dropped when it does not, so a decision may keep one and drop another; a
pure process, tooling, or documentation decision drops all three.

```markdown
# TIB-<DATE>: <TITLE>

| Field             | Value                                        |
| ----------------- | -------------------------------------------- |
| **Date**          | <DATE>                                       |
| **Author**        | <AUTHOR>                                     |
| **Scope**         | <packages and target versions>               |
| **Supersedes**    | TIB-YYYY-MM-DD-slug _(remove if not applicable)_ |
| **Superseded by** | TIB-YYYY-MM-DD-slug _(remove if not applicable)_ |

## Context

The problem that forces a decision: the forces at play — technical, product, constraints — and any
prior decision the reader needs. 5–15 lines. Scope it to "what made this necessary", not to the
decision itself.

## Goals / Non-Goals

**Goals**

- What this decision must achieve.

**Non-Goals**

- What it explicitly will not do. Each non-goal preempts a plausible-but-wrong PR.

## Current Solution

_Optional._ What exists today, or what would happen by default if we did nothing.

## Decision

The chosen behavior, stated concretely. The load-bearing section: the rule, not the mechanics.

## Public Interface

_Required when the decision changes a public API; drop the section when it does not._ The signatures
that change — new and changed functions and types, input & output shapes,
deprecations. Signatures and semantics only, never internal mechanics.

## Behavior

_Required when the decision has observable runtime behavior; drop the section when it does not._ The
observable rules — the "if X then Y" list: rounding direction, refund handling,
what a zero or max input means, which authorizations are required.

- If X, then Y.

## Invariants

_Required when the decision has a runtime invariant; drop the section when it does not._ The
properties that must hold no matter how the code is written — security, rounding,
atomicity, ordering, protocol limits, backward-compatibility — plus the assumptions the decision
depends on.

- Invariant, phrased so it survives any refactor.

## Rejected alternatives

_Optional._ Approaches seriously evaluated, each with why it was rejected. Not an exhaustive survey
— the ones a smart person would actually propose.

- **<Alternative>.** Rejected: <reason>.

## Breaking Changes & Migration

_When the decision breaks compat._ Which packages bump and by how much, what callers must change,
the ordering of releases, and migration guidance.

## Acceptance Criteria

How anyone objectively knows the implementation honors the decision — a checklist a reviewer or an
agent can run against a PR. Reference which invariants must have a failing-if-removed test, not
which test asserts them.

- [ ] <What must be true.>

## Consequences

_Optional._ Deliberate debt, deferred follow-ups, reassessment triggers — things decided to defer,
not things still undecided.

## Open Questions

_Optional, and must be empty before merge._ Unresolved questions that block the implementation,
each with what it blocks.

## References

_Optional._

- [Related TIB or doc](url)

## Addenda

_Optional._ The only sanctioned way to update an accepted TIB, strictly for **operational**
clarifications — never a change of decision.

### YYYY-MM-DD — <Title>

**Author:** @username

What changed in the operational interpretation, and why.
```

---

## Cheat sheet: what does NOT belong in a TIB

If a draft contains one of these, move it to the Linear tickets — outside the repo — or delete it:

- Exhaustive lists of files to modify.
- Private / non-exported function signatures.
- Pseudo-code or step-by-step "call Y then Z" sequences.
- Variable names and internal helper structure.
- The literal constants used to achieve a behavior — the *behavior* stays; the constant goes.
- Test file names and individual test-case enumerations.
- Anything that would read as false after a routine refactor.

**At a glance:**

|              | **TIB** (Brief)                                     | **Implementation detail** (plans, notes)   |
| ------------ | --------------------------------------------------- | ------------------------------------------ |
| Answers      | What & Why                                          | How                                        |
| Mutability   | **Frozen** once accepted                            | **Mutable** during execution               |
| Lifespan     | Permanent record                                    | Disposable, regenerable                    |
| Holds        | Decision, interface, invariants, alternatives       | Files, steps, test plan, checklists        |
| Where        | **In the repo** (zero maintenance)                  | **Outside the repo** (regenerated at will) |
| Cardinality  | 1 TIB                                               | → N disposable plans                       |
