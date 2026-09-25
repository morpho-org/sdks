<!--
An ADR (Architectural Decision Record) is the frozen record of a technical decision that is hard
to revert and/or sets a new technical standard to adhere to. It is written in code, accepted
through its own PR, and never edited afterwards: a changed decision gets a new ADR that supersedes
it. Status is the only field that changes after acceptance.

The test for ADRs: would this still be true if the project were cancelled tomorrow and the code
rewritten next year? If not, it belongs in the project's Technical Project Plan (the Linear project
description).

What never goes in an ADR: file paths, private symbols, phases, milestones, owners, dates other
than the header, links to anything that changes.

What does go in an SDK ADR when the decision has it: the public signatures it adds, changes,
removes, or deprecates; the observable "if X then Y" rules; the semver consequence and release
ordering. The public surface is the contract semver protects, so it is decision content, not
mechanics. Quote exported symbols in backticks.

Conventions:
- File naming: ADR-YYYY-MM-DD-short-slug.md under docs/adrs/. The date is when the ADR was first
  drafted; the slug distinguishes two records drafted on the same day.
- Scope names the packages and target versions the decision binds (e.g. `morpho-sdk 6.0.0, WDK
  2.0.0`), or `Repo-wide` for a process, tooling, or documentation decision.
- Context is written in the past tense; the Decision is the rule, not the story of reaching it.
  When revising in response to a PR comment, fix the rule — do not narrate the back-and-forth.
- No changeset: an ADR is documentation, not a change to published package source.
- Delete this comment block and every italic guidance line before opening the PR.
-->

# ADR-YYYY-MM-DD: [Decision title]

| Field      | Value                                                     |
| ---------- | --------------------------------------------------------- |
| **Status** | accepted · superseded by ADR-X                            |
| **Date**   | YYYY-MM-DD                                                |
| **Author** | @username                                                 |
| **Scope**  | Repo-wide · Packages and target versions: [pkg x.y.z, …] |

_Status is the only field that changes after acceptance._

## Context

_Why a decision was needed, at the time. Past tense, five to ten lines. Describe the force that
made the decision necessary, not the solution._

## Decision

_The rule stated as concisely as possible. Include what it deliberately does not cover. When the
decision changes a public API, state the signatures and the semver consequence here._

## Invariants

_What must hold no matter how the code is written. One bullet each, with the check that fails if it
breaks: a test, a lint rule, a grep, or a "revisit if …" trigger for the assumptions the decision
rests on._

- Invariant → check:
- Invariant → check:

## Rejected alternatives

_Optional. The two or three a smart person would propose, and why each lost. Only alternatives that
were genuinely considered._

- **Alternative.** Rejected because …

## References

_Prior ADRs or TIBs this builds on or supersedes, and the PR that accepted it. Nothing that
changes._

-
