# [Project/Initiative Name] Retrospective

| Field       | Value                                             |
| ----------- | ------------------------------------------------- |
| **Date**    | YYYY-MM-DD                                        |
| **Author**  | @username                                         |
| **Period**  | Start date – End date (~N weeks)                  |
| **Packages**| Affected packages (e.g., `morpho-sdk`, `blue-sdk`)  |
| **Project** | [Linear project name][linear-project]             |

---

## Executive Summary

2–4 sentence overview of the project: what was done, the scale of changes (files, commits, issues),
the key outcome, and any notable cost or tradeoff.

---

## Outcome Assessment

Quantify the success or failure of the project against its original goals. Be honest — partial
success is common and worth documenting clearly.

### Goal Scorecard

| #   | Goal (from the plan's Goals section) | Status                 | Evidence                        |
| --- | ------------------------------------ | ---------------------- | ------------------------------- |
| 1   | Goal as originally stated            | Hit / Partial / Missed | Link to PR or metric proving it |
| 2   | …                                    | …                      | …                               |
| 3   | …                                    | …                      | …                               |

**Overall: N/M goals fully hit, X partial, Y missed.**

### Quantitative Indicators

| Indicator                 | Target  | Actual               | Verdict            |
| ------------------------- | ------- | -------------------- | ------------------ |
| Scope completion (issues) | N       | N done / N total     | On track / Behind  |
| Timeline adherence        | N weeks | N weeks              | On time / +N weeks |
| Fix ratio                 | < 20%   | N%                   | Healthy / Elevated |
| Unplanned work ratio      | —       | N PRs out of M       | Low / High         |
| Plan conformance          | —       | N/M requirements met | —                  |
| ADR conformance           | 100%    | N/M invariants held  | Held / Broken      |

> **How to fill this in:** The plan is the Linear project description (shape:
> [`TECHNICAL-PROJECT-PLAN.md`](../templates/TECHNICAL-PROJECT-PLAN.md)). Extract goals from its
> "Goals and non-goals" section. If no explicit goals were written down, note that as a process gap
> and infer goals from the issue titles. Scope completion = done issues / total issues. Fix ratio =
> PRs with `fix(` prefix / total PRs. Unplanned work = PRs not linked to any original issue. Plan
> conformance = requirements delivered as planned / total requirements. ADR conformance =
> invariants held / invariants checked.

---

## Timeline

Chronological table of key milestones with links to the PRs that delivered them.

| Date   | Milestone        | PR     |
| ------ | ---------------- | ------ |
| MMM DD | First milestone  | [#NNN] |
| MMM DD | Second milestone | [#NNN] |
| MMM DD | Final milestone  | [#NNN] |

---

## What Changed

Describe the major changes the project introduced:

- What was added, removed, or replaced
- Key architectural shifts
- Dependencies added or removed

### By the Numbers

Quantitative summary of the project's footprint, computed from the
project's PRs.

| Metric              | Value        |
| ------------------- | ------------ |
| PRs merged          | N            |
| Total files changed | N            |
| Total insertions    | +N           |
| Total deletions     | -N           |
| Net change          | +/- N lines  |
| Average PR size     | +/- N lines  |
| Largest PR          | [#NNN] (+/-) |
| Smallest PR         | [#NNN] (+/-) |

> **Note:** Line counts may include lockfile churn and generated code. Call out significant
> contributors to inflated counts.

---

## Plan Conformance

_Compare what the Technical Project Plan (the Linear project description) said would ship against
what shipped._

### Milestones

| Milestone   | Planned order | Shipped | PRs    | Notes                   |
| ----------- | ------------- | ------- | ------ | ----------------------- |
| Milestone 1 | 1             | Yes     | [#NNN] | Landed in order         |
| Milestone 2 | 2             | Partial | [#NNN] | Split; second half in … |
| Milestone 3 | 3             | No      | —      | Dropped because …       |

### Requirements

| Requirement | Verdict                                         | Evidence |
| ----------- | ----------------------------------------------- | -------- |
| `R-1`       | Delivered as planned / Deviated / Not delivered | [#NNN]   |
| `R-2`       | …                                               | …        |

- **Deviated from plan:** For each deviation, what shipped differently and why
- **Not delivered:** For each descoped or deferred requirement, the reason
- **Unplanned additions:** PRs that map to no requirement or milestone
- **Assumptions and open questions:** Assumptions (`A-x`) that turned out false; open questions
  (`Q-x`) answered during execution rather than before it

> If the project description has no requirements or milestones, note that as a process gap and
> say how the plan was inferred (issue titles, Linear milestones).

---

## ADR Invariant Check

_ADRs are the frozen decisions the plan links. Conformance is separate from delivery: a project can
ship every milestone and still break an invariant._

| ADR                                               | Title | Status                |
| ------------------------------------------------- | ----- | --------------------- |
| [ADR-YYYY-MM-DD](../adrs/ADR-YYYY-MM-DD-title.md) | Title | Accepted / Superseded |

| ADR            | Invariant           | Check run       | Verdict                       |
| -------------- | ------------------- | --------------- | ----------------------------- |
| ADR-YYYY-MM-DD | Invariant as stated | Test / grep / … | Held / Broken / Not checkable |

- **Superseded during the project:** Which ADRs changed and why
- **Decisions without an ADR:** Hard-to-revert decisions or new standards made during execution
  that have no ADR. Each is a candidate ADR for the Recommendations section.

> If the plan links no ADR and the project's PRs touch none, note that and explain how
> architectural decisions were made (ad-hoc, in PRs, team discussions, etc.).

---

## Impact

_Optional — remove if not applicable._

Performance, reliability, DX, or user-facing impact observed after the project shipped.

### Positive

- Impact 1
- Impact 2

### Negative or Neutral

- Impact 1

---

## Issue Completion Analysis

Summary of Linear issue status at retro time.

| Status      | Count | Notes                |
| ----------- | ----- | -------------------- |
| Done        | N     |                      |
| In Progress | N     | Why still open?      |
| Cancelled   | N     | Why cancelled?       |
| Backlog     | N     | Descoped or deferred |

### Incomplete Issues

For each issue that was not completed, explain:

- **ISSUE-ID: Title** — Reason it was not completed (blocked by X, descoped because Y, deferred
  to project Z, etc.)

---

## Post-Completion Fix Cluster

_Catalog bugs and fixes that emerged after the project's core work was "done."_

### Fix 1: [Short description]

- **Problem:** What went wrong
- **Fix:** How it was resolved (link PR)
- **Lesson:** What should have been done differently

### Fix 2: [Short description]

- **Problem:** …
- **Fix:** …
- **Lesson:** …

> Calculate the fix ratio: `PRs with fix( prefix / total PRs` during the project period. A ratio
> above 20% suggests the area needs more upfront design or testing.

---

## What Went Well

- Thing 1
- Thing 2
- Thing 3

---

## What Could Be Better

For each item, include a concrete suggestion for improvement — not just "X was bad."

### Area 1: [Title]

Description of the problem and a specific recommendation.

### Area 2: [Title]

Description of the problem and a specific recommendation.

---

## Recommendations for Future Projects

Numbered list of actionable recommendations derived from the retro. These should be general enough
to apply beyond this specific project.

1. **Recommendation title.** Explanation.
2. **Recommendation title.** Explanation.
3. **Recommendation title.** Explanation.

---

## Verdict

_One-paragraph honest summary: was this project a success, partial success, or failure? Why?_

Ground the verdict in the Goal Scorecard and Quantitative Indicators above. Call out the single
biggest win and the single biggest miss. If the project was a partial success, explain what would
have made it a full success.

---

## Current State

_What does the codebase look like now that the project is complete?_

| Component | State | Notes |
| --------- | ----- | ----- |
| …         | …     | …     |

---

## Key PRs

| PR     | Title |
| ------ | ----- |
| [#NNN] | …     |
| [#NNN] | …     |

---

## References

- [Related ADR](../adrs/ADR-YYYY-MM-DD-title.md)
- [Technical Project Plan template](../templates/TECHNICAL-PROJECT-PLAN.md)
- [Linear project][linear-project]
- [Other relevant links]

[linear-project]: https://linear.app/morpho-labs/project/PROJECT-SLUG
[#NNN]: https://github.com/morpho-org/sdks/pull/NNN

<!--
Retro conventions:
- File naming: YYYY-MM-<project-slug>.md (e.g., 2026-03-orpc-migration.md)
- Save in docs/retros/
- Link all PRs using reference-style links at the bottom
- Compare delivered work against the plan (Linear project description); check ADR invariants
  separately
-->
