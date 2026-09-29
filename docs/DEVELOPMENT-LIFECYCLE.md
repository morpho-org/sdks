# Development Lifecycle

This page is the short version. The full guide is the
[Software Development Lifecycle Guide (Notion)](https://app.notion.com/p/morpho-labs/Software-Development-Lifecycle-Guide-3ddd69939e6d81709ea9e944915abefc).
When the two disagree, Notion wins.

Every project accumulates one written document, the **Technical Project Plan**, as it moves through
the phases below. Decisions that are hard to revert or set a new technical standard are recorded
separately in an **Architectural Decision Record (ADR)**.

---

## The eight phases

1. **Problem articulation and pressure testing** — state the problem, the evidence for it, and why
   now.
2. **High-level solution scoping** — goals, non-goals, assumptions, risks, and any strong solution
   preference.
3. **Technical exploration** — prototype the candidate shapes, research norms, gather input from
   other teams.
4. **Technical decision making** — choose the solution, rule out alternatives, name invariants,
   security and privacy implications, and the decisions that are hardest to revert.
5. **Project planning** — milestones, sequencing, rollout, testing, and monitoring.
6. **Project execution** — small PRs, escalate decisions that belonged in phase 4, review agent PRs
   before asking others.
7. **Production release** — changesets, migration guides for majors, coordinate the release.
8. **Retrospective and maintenance** — is the problem solved, what to improve now versus later, what
   to change in how we work.

## The two checkpoints

| Checkpoint              | After phase | Stakeholders validate                                                                         |
| ----------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| **Project Kickoff**     | 2           | The problem statement and the high-level scope                                                |
| **Project Plan Review** | 4–5         | The technical decisions, any ADRs, and the plan (milestones, rollout, testing, observability) |

Iterate the plan with the core team between checkpoints. Use the checkpoints to validate it with
people outside the core team.

## When to write an ADR

Ask one question:

> **Would this still be true if the project were cancelled tomorrow and the code rewritten next
> year?**

If yes, it is a decision and gets an ADR. If no, it belongs in the Technical Project Plan. An ADR
is accepted through its own PR and is frozen after merge. Status is the only field that changes. A
changed decision gets a new ADR that supersedes the old one.

An ADR never contains file paths, private symbols, phases, milestones, owners, dates other than the
header, or links to anything that changes. The plan links its ADRs. An ADR never links the plan.

In this repo the public surface is the product: the exported signatures a decision adds, changes,
removes, or deprecates, the observable behavior, and the semver consequence are part of the
decision and belong in the ADR. The mechanics that produce them — files, private helpers, edit
order, test cases — belong in the plan.

## Where each document lives

| Document                   | Lives in                                                                                       | Template                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **ADR**                    | This repo — `docs/adrs/`                                                                       | [`templates/ADR.md`](./templates/ADR.md)                                                      |
| **Technical Project Plan** | The Linear project description. Mutable, disposable once the project ships                     | [`templates/TECHNICAL-PROJECT-PLAN.md`](./templates/TECHNICAL-PROJECT-PLAN.md) (reference copy) |
| **Retrospective**          | The Linear project's final update. Retros worth keeping in the repo go in [`retros/`](./retros/) | [`retros/TEMPLATE.md`](./retros/TEMPLATE.md)                                                  |

See [`README.md`](./README.md) for naming, folder layout, and the copy commands.
