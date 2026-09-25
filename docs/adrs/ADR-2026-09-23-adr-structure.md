# ADR-2026-09-23: ADR structure and the ADR / project plan boundary

| Field      | Value        |
| ---------- | ------------ |
| **Status** | accepted     |
| **Date**   | 2026-09-23   |
| **Author** | @Foulks-Plb  |
| **Scope**  | Repo-wide    |

_Status is the only field that changes after acceptance._

## Context

The repo recorded technical decisions as Technical Intent Briefs (TIBs), with a template of
fourteen sections, half of them optional, spanning decision content (public interface, behavior,
invariants, semver) and planning content (acceptance criteria, open questions, migration steps).
The template defined `Supersedes` and `Superseded by` header fields (records added a `Status` row
on their own, outside the template), and the rulebook required filling `Superseded by` on the
superseded record, but the convention was not applied: most records still read `Proposed`, and no
superseded record had its row filled, so a reader of an old record had no reliable signal that it
was no longer current.

The wider organisation adopted a Software Development Lifecycle in which every project accumulates
a mutable Technical Project Plan in Linear, and hard-to-revert decisions are frozen as ADRs in the
repo. TIBs sat between the two: frozen like an ADR but routinely carrying plan content. Splitting
the two artifacts required deciding what the SDK's decision record looks like, where the
public-surface content that TIBs held goes, and what happens to the existing records.

## Decision

Technical decisions are recorded as Architectural Decision Records (ADRs), one decision per record,
accepted through their own PR and frozen after merge.

An ADR has a four-field header — **Status**, **Date**, **Author**, **Scope** — and five sections:
Context, Decision, Invariants, Rejected alternatives (optional), References. Status is `accepted`,
`superseded by <ADR stem>`, or — when a later record replaces only part of the decision —
`accepted; <part> superseded by <ADR stem>`; it is the only field that changes after acceptance.
Scope names the packages and target versions the decision binds, or `Repo-wide`.

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

TIBs are retired, and the existing records were migrated into `docs/adrs/` under the ADR name:
each kept its sections and implementation-time examples, gained a normalized Status, and lost
planning content and links to anything that changes (Linear). `docs/tibs/` no longer exists.
Records dated before this one are migrated legacy records: they keep their implementation-time
sections — including sequencing, test plans, open questions and the retired editing instructions —
as a historical snapshot and are maintained only through their Status row. A decision recorded in
a migrated record is changed by a new ADR that lists the old record in its References, not by
editing the old record.

## Invariants

Every check runs from the repository root over the set of records, which is every Markdown file in
`docs/adrs/`. Fenced blocks and code spans are stripped before matching, so a check never matches
its own definition.

````sh
records() { git ls-files 'docs/adrs/*.md' | grep . || echo 'ERROR: no ADR records found; run from the repository root' >&2; }
new_records() { records | awk -F/ '$NF >= "ADR-2026-09-23"'; }
prose() { sed -e '/^ *```/,/^ *```/d' -e 's/`[^`]*`//g' "$1"; }
````

- One decision per record; a PR that adds an ADR changes no published package source and ships no
  changeset → PR review.
- No planning content lives in a record dated on or after this one (legacy migrated records are
  exempt) → this check prints nothing:

  ```sh
  for f in $(new_records); do prose "$f" | grep -qE 'Phase [0-9]|Milestone|Owner' && echo "$f"; done
  ```

- An ADR never links a Linear project or issue → this check prints nothing:

  ```sh
  for f in $(records); do prose "$f" | grep -q 'linear\.app' && echo "$f"; done
  ```

- No record uses the retired convention → this check prints nothing:

  ```sh
  git ls-files ':(top)*TIB-*.md' ':(top)*/tibs/*'
  ```

- Every record has a Status row → this check prints nothing:

  ```sh
  for f in $(records); do grep -q '| \*\*Status\*\*' "$f" || echo "$f"; done
  ```

- Every record filename matches the convention → this check prints nothing:

  ```sh
  for f in $(records); do basename "$f" | grep -vqE '^ADR-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+\.md$' && echo "$f"; done
  ```

- A record is edited after acceptance only to change Status, its filename, or a link path whose
  target was renamed → revisit if a PR diff touches an accepted `ADR-*.md` in any other way.
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
- **Keep migrated TIBs frozen under `docs/tibs/`.** Rejected because two record conventions side
  by side is what the lifecycle removes; one directory, one name, one check.

## References

- Supersedes none; this is the first record written to this structure.
- morpho-org/morpho-apps ADR-2026-09-23 — the application-monorepo structure this adapts.
- Accepted in the PR that added this file.
