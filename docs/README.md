# Documentation

Docs are context for the humans and agents who work in this repo. The better they capture _why_
decisions were made, the better agents can assist with implementation, review, and extending the
SDK over time.

---

## What lives where

| Type                                      | Where it lives                                                                  | Relationship                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **ADRs** (Architectural Decision Records) | This repo — `docs/adrs/`                                                        | Frozen record of a hard-to-revert decision or a new standard; plans link them |
| **Technical Project Plans**               | Linear — the project description ([reference copy](./templates/TECHNICAL-PROJECT-PLAN.md)) | Mutable; hold context, judgement calls, milestones, rollout; link their ADRs  |
| **Implementation tickets**                | Linear                                                                          | One per PR, flowing from the plan's milestones                                |
| **Retrospectives**                        | Linear — the project's final update; [`retros/`](./retros/) when kept ([template](./retros/TEMPLATE.md)) | Compare delivered work against the plan; check ADR invariants held            |

This repo is the home for **architectural decisions** and **code-level documentation** (READMEs,
`AGENTS.md`, JSDoc). Linear is the home for **planning and tracking implementation**. ADRs settle
the "why this approach" question; the plan handles "what to build and when."

> **Full guide:** See [`DEVELOPMENT-LIFECYCLE.md`](./DEVELOPMENT-LIFECYCLE.md) for the eight
> phases, the two stakeholder checkpoints, and when a decision earns an ADR.

---

## Architectural Decision Records (ADRs)

An ADR is the frozen record of a **single technical decision** that is hard to revert or sets a
new technical standard: the context, the rule, its invariants, and the alternatives rejected.

The test: would this still be true if the project were cancelled tomorrow and the code rewritten
next year? If not, it belongs in the Technical Project Plan.

ADRs are small and focused — one decision per ADR. An ADR is accepted through its own PR, needs
at least one developer review, ships no changeset, and is never edited after merge. Status is the
only field that changes, and takes one of three forms: `accepted`, `superseded by <ADR stem>`, or
— when a later record replaces only part of the decision — `accepted; <part> superseded by <ADR
stem>`. A changed decision gets a new ADR that supersedes the old one.

> **Before writing an ADR**, read [`DEVELOPMENT-LIFECYCLE.md`](./DEVELOPMENT-LIFECYCLE.md) and the
> preamble of [`templates/ADR.md`](./templates/ADR.md). Agents must follow these rules when
> proposing or creating decision records.

### Creating an ADR

```bash
# Use today's date; the slug distinguishes two records drafted on the same day
cp docs/templates/ADR.md docs/adrs/ADR-YYYY-MM-DD-short-slug.md
```

### Naming convention

`ADR-YYYY-MM-DD-short-slug.md` (CalVer — the date the ADR was first drafted). The filename stem is
the record's canonical identifier: cite it from other ADRs and in `superseded by` with the full
slugged stem, never the date alone.

The header's **Scope** names the packages and target versions the decision binds (e.g.
`morpho-sdk 6.0.0, WDK 2.0.0`), or `Repo-wide` for a process, tooling, or documentation decision.

Example: `docs/adrs/ADR-2026-09-23-adr-structure.md`

---

## Technical Project Plans

A Technical Project Plan is the one document a project accumulates as it moves through the
lifecycle: overview, background, goals and non-goals, requirements, proposed design with its
decisions, alternatives, milestones and rollout, testing and observability, security, dependencies,
and open questions. It is mutable, lives as the Linear project description, and is disposable once
the project ships. [`templates/TECHNICAL-PROJECT-PLAN.md`](./templates/TECHNICAL-PROJECT-PLAN.md) is
a read-only reference copy of the Notion template.

The plan links any ADR it produced. An ADR never links the plan.

---

## Checking the records

The structural rules ADRs follow are executable. From the repository root:

```sh
records() { git ls-files 'docs/adrs/*.md' | grep . || echo 'ERROR: no ADR records found; run from the repository root' >&2; }
new_records() { records | awk -F/ '$NF >= "ADR-2026-09-23"'; }
prose() { sed -e '/^ *```/,/^ *```/d' -e 's/`[^`]*`//g' "$1"; }

# No planning content in a record dated on or after ADR-2026-09-23 — prints nothing
for f in $(new_records); do prose "$f" | grep -qE 'Phase [0-9]|Milestone|Owner' && echo "$f"; done

# An ADR never links Linear — prints nothing
for f in $(records); do prose "$f" | grep -q 'linear\.app' && echo "$f"; done

# The retired TIB convention is gone — prints nothing
git ls-files '*TIB-*.md' '*/tibs/*'

# Every record has a Status row — prints nothing
for f in $(records); do grep -q '| \*\*Status\*\*' "$f" || echo "$f"; done

# Every record filename matches the convention — prints nothing
for f in $(records); do basename "$f" | grep -vqE '^ADR-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+\.md$' && echo "$f"; done
```

---

## Folder layout

```
docs/
  README.md                 # this file
  DEVELOPMENT-LIFECYCLE.md  # the eight phases, two checkpoints, ADR vs plan
  jsdoc-style.md            # canonical JSDoc shape for exported symbols

  adrs/                     # Architectural Decision Records
    ADR-YYYY-MM-DD-short-slug.md

  retros/                   # retrospectives worth keeping in the repo
    TEMPLATE.md

  templates/
    ADR.md                      # ADR template (decision records)
    TECHNICAL-PROJECT-PLAN.md   # reference copy of the Notion plan template
```
