# ADR-2026-09-23: ADR structure and the ADR / project plan boundary

| Field      | Value      |
| ---------- | ---------- |
| **Status** | accepted   |
| **Date**   | 2026-09-23 |
| **Author** | @0xbulma   |
| **Scope**  | Repo-wide  |

_Status is the only field that changes after acceptance._

## Context

The repo recorded technical decisions as Technical Intent Briefs (TIBs) under `docs/tibs/`, with
a template of fourteen optional sections spanning decision content (public interface, behavior,
invariants, semver) and planning content (acceptance criteria, open questions, migration steps).
TIBs carried no status field, so supersession was recorded in the superseding record only, and a
reader of the old record had no signal it was no longer current.

The wider organisation adopted a Software Development Lifecycle in which every project accumulates
a mutable Technical Project Plan in Linear, and hard-to-revert decisions are frozen as ADRs in the
repo. TIBs sat between the two: frozen like an ADR but routinely carrying plan content. Splitting
the two artifacts required deciding what the SDK's decision record looks like and where the
public-surface content that TIBs held goes.

## Decision

Technical decisions are recorded as Architectural Decision Records (ADRs), one decision per record,
accepted through their own PR and frozen after merge.

An ADR has a four-field header — **Status**, **Date**, **Author**, **Scope** — and five sections:
Context, Decision, Invariants, Rejected alternatives (optional), References. Status is `accepted`
or `superseded by <ADR stem>`; it is the only field that changes after acceptance. Scope names the
packages and target versions the decision binds, or `Repo-wide`.

All ADRs live in a single directory, `docs/adrs/`, named `ADR-YYYY-MM-DD-short-slug.md`. There is
no per-package ADR location: the packages version independently through Changesets but ship from
one monorepo and one release flow, and a decision that touches one package's public surface
constrains its dependents through the dependent-bump and peer-range audit.

An ADR records what is true regardless of how the project is executed. In this repo that includes
the public signatures a decision adds, changes, removes, or deprecates, the observable behavior
rules, and the semver and release-ordering consequence, because the public surface is the contract
the release rules protect. It excludes file paths, private symbols, phases, milestones, owners,
acceptance criteria, dates other than the header, and links to anything that changes. That content
belongs in the Technical Project Plan in Linear. The plan links its ADRs; an ADR never links a plan.

TIBs are retired as a convention. Existing TIBs stay in `docs/tibs/` as frozen historical records
and keep their names, structure, and implementation-time examples. A decision recorded in a TIB is
changed by a new ADR that lists the TIB in its References, not by editing the TIB. No new TIB is
written.

## Invariants

- One decision per record; a PR that adds an ADR changes no published package source and ships no
  changeset → PR review.
- An accepted ADR changes only its Status field → PR review; a diff to an existing `docs/adrs/`
  file outside the Status row is rejected.
- `docs/adrs/` contains only ADRs; every filename matches `ADR-YYYY-MM-DD-*.md` → `ls docs/adrs`.
- No file under `docs/tibs/` is modified after this record is accepted → `git log -- docs/tibs`.
- Revisit if a package stops releasing from this monorepo's release flow: a per-package ADR
  location would then be reconsidered.

## Rejected alternatives

- **Keep TIBs and add a Status field.** Rejected because the TIB template's planning sections
  (acceptance criteria, open questions, migration steps) are exactly what the lifecycle moves to
  the Linear plan; patching the header keeps the mixed artifact.
- **Package-scoped ADR directories (`packages/<pkg>/docs/adrs/`).** Rejected because the packages
  share one release flow and most SDK decisions cross package boundaries; scope is carried by the
  header field instead.
- **Drop public signatures and semver from ADRs, as the application-monorepo template does.**
  Rejected because for an SDK the exported surface is the decision, and semver consequence is what
  makes it hard to revert.
- **Rename existing TIBs to ADRs.** Rejected because implemented TIBs are historical records and a
  rename would break the references code, changesets, and prior PRs carry.

## References

- morpho-org/morpho-apps#6225 — the application-monorepo ADR structure this adapts
- morpho-org/sdks#1157 — the PR that accepted this record
