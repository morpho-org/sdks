# TIB-NNNN: [Decision Title]

| Field             | Value                                            |
| ----------------- | ------------------------------------------------ |
| **Status**        | Proposed \| Accepted \| Deprecated \| Superseded |
| **Date**          | YYYY-MM-DD                                       |
| **Author**        | @username                                        |
| **Scope**         | Repo-wide \| App: [name] \| Package: [name]      |
| **Supersedes**    | TIB-XXXX _(if applicable, otherwise remove)_     |
| **Superseded by** | TIB-XXXX _(if applicable, otherwise remove)_     |

---

## Context

What is the issue that motivates this decision? Describe the forces at play (technical, business,
social, project constraints) and any prior decisions the reader needs to understand the rest of
the document. Keep this scoped to "what made this decision necessary" -- not the decision itself.

> If documenting a decision retroactively, use the date the decision was originally accepted and
> note here that this is a retrospective record (e.g., "This TIB retroactively documents a decision
> made in [month/year].").

## Goals / Non-Goals

What this TIB is trying to achieve and what it explicitly is **not** trying to achieve.
Non-goals are as important as goals: they bound the decision and prevent scope creep in
implementation.

**Goals**

- Goal 1
- Goal 2

**Non-Goals**

- Non-goal 1
- Non-goal 2

## Current Solution

_Optional -- remove this section if there is no existing solution._

What exists today (or what would happen by default if we did nothing). Briefly describe the
relevant parts of the current system.

## Proposed Solution

The decision. State it clearly and concretely. Use diagrams, code excerpts, and interface sketches
where they help. This is the load-bearing section.

### Implementation Phases

_Optional -- remove this sub-section if the solution does not require phased delivery._

If the solution has a meaningful order of operations, outline the high-level phases here. Each
phase should have a clear goal and a rough indication of what lands in it. The point is to let
reviewers chime in on sequencing, dependencies, and gotchas _before_ execution begins -- and to
give the `/extract-plan` workflow a starting point for Linear milestones.

- **Phase 1 -- [name]:** What lands in this phase and why it comes first.
- **Phase 2 -- [name]:** ...
- **Phase 3 -- [name]:** ...

## Considered Alternatives

Other approaches the author seriously evaluated, with the reason each was rejected. The point is
not exhaustive enumeration; it is to record _why_ the chosen approach won, so future readers do
not relitigate settled debates.

### Alternative 1: [Name]

Description of the alternative.

**Why rejected:** Reason

### Alternative 2: [Name]

Description of the alternative.

**Why rejected:** Reason

## Assumptions & Constraints

Conditions the proposed solution depends on (technical, organisational, regulatory). If an
assumption breaks, the decision may need to be revisited.

- Assumption / constraint 1
- Assumption / constraint 2

## Dependencies

_Optional -- remove this section if not applicable._

External systems, packages, services, or other TIBs the proposed solution depends on. Include
version constraints if relevant.

## Observability

_Optional -- remove this section if not applicable._

What needs to be measured, logged, traced, or alerted on for this decision to be operable in
production? Call out new metrics, log fields, traces, dashboards, or alerts the implementation
should produce, and which existing observability surfaces will be affected.

## Security

_Optional -- remove this section if not applicable._

What security considerations does this decision introduce or change? Cover threat model deltas,
sensitive data handling, trust boundaries, and any review the change should go through (e.g.,
dependency audit, secrets handling, on-chain assumptions). Skip if the decision has no security
surface.

## Future Considerations

_Optional -- remove this section if not applicable._

Known follow-ups, possible extensions, or conditions that would trigger a reassessment. Distinct
from Open Questions: these are things deferred deliberately, not things still being decided.

## Open Questions

_Optional -- remove this section if there are none at acceptance time._

Things the author has not yet resolved but does not want to block acceptance.

## References

- [Related TIB or doc](url)
- [Linear epic](url)
- [Discussion thread](url)

<!--
TIB conventions:
- Once accepted, do not substantively edit this TIB. If the decision needs to change,
  create a new TIB that supersedes this one and update the Status/Superseded by fields.
- TIB numbers are sequential and never reused.
- See TIB-0016 (docs/decisions/TIB-0016-tib-structure.md) for the canonical structure
  and section semantics this template is built on.
-->
