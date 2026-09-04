<!--
This template mirrors the `## Canonical template` in `.agents/commands/tib-create.md`,
which is the single source of truth for TIB structure. Prefer running
`/tib-create "<decision title>"` — it resolves metadata, applies the full rulebook, and
drafts the brief for you. Keep this file in sync whenever that canonical template changes.

TIB = what + why. Code and Linear tickets = how. Once accepted a TIB is never substantively
changed: a changed decision gets a new superseding TIB (fill `Supersedes` / `Superseded by`
on both); an operational clarification gets a dated addendum.

Sections appear in the order below. Optional sections (Current Solution, Rejected
alternatives, Breaking Changes & Migration, Consequences, Open Questions, References,
Addenda) appear only when they carry content — delete the heading otherwise. Public
Interface, Behavior, and Invariants are mandatory whenever the decision touches a public
API, observable runtime behavior, or a runtime invariant, and may be dropped only for a pure
process, tooling, or documentation decision. Never leave an empty placeholder, a `TBD`, or
an `N/A`.
-->

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

_Required when the decision touches a public API; omit only for a pure process / tooling / doc
decision._ The signatures that change — new and changed functions and types, input & output shapes,
deprecations. Signatures and semantics only, never internal mechanics.

## Behavior

_Required when the decision has observable runtime behavior; omit only for a pure process / tooling /
doc decision._ The observable rules — the "if X then Y" list: rounding direction, refund handling,
what a zero or max input means, which authorizations are required.

- If X, then Y.

## Invariants

_Required when the decision has a runtime invariant; omit only for a pure process / tooling / doc
decision._ The properties that must hold no matter how the code is written — security, rounding,
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
