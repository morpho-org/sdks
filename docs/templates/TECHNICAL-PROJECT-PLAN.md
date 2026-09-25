# Technical Project Plan

> **Reference copy.** The live plan for a project is its Linear project description; that is
> the document to read and edit. This file is a read-only copy of the
> [Technical Project Plan Template (Notion)](https://app.notion.com/p/morpho-labs/Technical-Project-Plan-Template-3ddd69939e6d81599785f8f65dc432ff)
> so humans and agents in this repo can draft or parse a plan without leaving it. When the two
> drift, Notion wins; update this file to match.

A **technical project plan** is the one written document a project accumulates as it moves through
the software development lifecycle. It starts as a problem statement and grows section by section.
It is mutable, lives with the project in Linear rather than in the repo, and is disposable once the
project ships: learnings go to the project's final update, a superseding ADR, or a convention or
skill.

Not every section is present in every plan. Use the ones that make sense. Write at the level you
could hand off to someone with little added context.

**Relationship to the ADR:** the plan links any ADR written for a hard-to-revert decision or a new
technical standard being set. The ADR never links the plan.

---

## Overview

_Three paragraphs at most: the problem, the proposed solution, and why now. Written so anyone in
the company can decide whether they need to read further._

## Background

_The problem in detail and the evidence that it exists. How it is solved today and what that
costs. Prior decisions, documents and ADRs the reader needs. How this fits the longer-term
direction._

## Goals and non-goals

_What this project must achieve. What is explicitly out of scope and will not be addressed._

**Goals**

- …

**Non-goals**

- …

## Requirements, assumptions and invariants

_Non-negotiable requirements, separated from preferences. Assumptions about load, scale, usage,
latency and availability, stated so they can be checked with their owners. Invariants: what the
system must never do or must always hold, each with how it is checked. When an ADR exists for a
decision, its invariants live there; link it rather than repeating them._

**Requirements**

- …

**Preferences**

- …

**Assumptions**

- …

**Invariants**

- …

## Proposed design

_The approach. Architecture diagram, impacted parts of the codebase, API and schema changes, UI
states and error handling, new dependencies, prototype links. List the decisions made along the
way, each with a one-line reason; any that were hard to revert or argued link to their ADR._

**Decisions**

- Decision — reason

## Alternatives

_Other approaches considered, with pros and cons. Facts, not advocacy. Options not fully explored
can be described briefly._

## Milestones and rollout

_Rough timeline, clearly marked as rough. Milestones with the reason for their order and what
lands in each. Feature gating, gradual rollout, A/B, cross-repo ordering, and how to revert. Who
owns it after launch._

| Milestone | Why in this order | What lands |
| --------- | ----------------- | ---------- |
|           |                   |            |

## Testing and observability

_How it is tested: unit, integration, end to end, staging or preview. Success and failure metrics.
Logging, dashboards and alerts, and which alerts page. Analytics events if product impact is
measured._

## Security and privacy

_Threat model changes, new endpoints or schema exposure, external content, unverified contracts,
PII, what happens if a dependency is compromised. Whether an external audit is needed. Security
properties that must always hold are invariants: record them above or in the ADR._

## Dependencies and cross-team impact

_Third parties, their SLAs, limits and cost. Which teams are affected, what they must build or
support, and the interfaces between them. Who needs to know at release._

## Open questions and risks

_Known unknowns, contentious calls the author wants input on, failure scenarios. Each with a
default so work can start._

| Question | Default if unanswered | Blocks |
| -------- | --------------------- | ------ |
|          |                       |        |
