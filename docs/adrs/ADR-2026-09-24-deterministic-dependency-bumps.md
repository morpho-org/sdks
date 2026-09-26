# ADR-2026-09-24: Dependency updates come from deterministic discovery, and each bump is owned by one agent session

| Field      | Value     |
| ---------- | --------- |
| **Status** | proposed  |
| **Date**   | 2026-09-24 |
| **Author** | @foulques |
| **Scope**  | Repo-wide |

_Status is the only field that changes after acceptance._

## Context

The SDK packages run inside integrators' applications, so every dependency version we adopt is code
we ship to them. A bump is a supply-chain decision: what matters is what the published artifact for
the new version contains, not only what its changelog says.

Version bumps used to arrive as Dependabot pull requests. Whoever picked one up, human or agent,
started after the change was already proposed, from a diff of version strings, with CI failing for
reasons unrelated to the bump because Dependabot runs with its own restricted secrets. Ownership of
each bump was split between the tool that proposed it and the person or agent that repaired it.

Which bumps are eligible is already answered mechanically by the repository's manifests and its
minimum release age policy. What a bump brings in is the part that needs judgment.

## Decision

Deciding which bumps exist is deterministic; reviewing and applying them is owned by an agent.

A scheduled job with no model in the loop reads the declared dependencies and pinned CI actions,
selects for each one the highest stable version that satisfies the repository's minimum release
age, drops bumps already in flight, and emits one event per package and target version. Security
updates enter the same pipeline as events of the same shape.

Each event starts one agent session that owns that bump until its PR is green: it inspects the
artifact published for the target version before changing anything, applies exactly the bump it was
given, runs the full validation suite, and fixes regressions the bump causes. Anything else it
notices is reported, not fixed in the same PR.

Dependabot does not open version-update PRs. Dependabot Alerts stay the source of vulnerability
signals.

This decision does not cover peer dependency ranges, which stay a deliberate, audited change, nor
the minimum release age policy itself, which bump PRs never bypass.

## Invariants

- The set of proposed bumps depends only on the manifests, the release age setting, registry and
  release metadata, and the bumps already in flight; no model chooses it → check: the selection
  logic is pure and unit-tested on fixed inputs, and a dry run on the same inputs yields the same
  events.
- A proposed version is stable, strictly newer than the declared minimum, and older than the
  minimum release age → check: unit tests fail if a prerelease or a version inside the window is
  selected.
- At most one bump is in flight per package and target version → check: unit tests fail if a bump
  with an open PR or existing bump branch is dispatched again, or if one package declared in several
  places yields more than one event per version.
- A lookup failure never produces an event; if in-flight bumps cannot be listed, nothing is
  dispatched → check: unit tests with failing listings assert zero dispatches.
- Discovery holds read-only repository access, and all writes happen in the agent session under its
  own identity → check: CI security review rejects any write permission on the discovery workflow.
- Bump PRs pass the same required checks and review rules as any other PR, and never add an
  exception to the minimum release age → check: CI security review flags any release-age bypass.
- Every CI action reference is pinned to a commit SHA with its version, so discovery can see it →
  check: CI security review rejects tag-only action references.
- Only one system proposes version bumps → check: the repository's Dependabot configuration opens
  no version-update PRs; revisit if a second producer is introduced.
- Revisit if per-bump PRs routinely conflict with each other (for example on the lockfile) often
  enough that grouping bumps would cost less review than resolving conflicts.

## Rejected alternatives

- **Keep Dependabot version-update PRs and have the agent repair them.** Rejected because the agent
  starts after the change is proposed, cannot review the published artifact before applying it, and
  ownership of each bump stays split between two systems.
- **Let the agent discover updates itself.** Rejected because the set of proposals would depend on a
  model's run, making it non-reproducible and hard to audit, for a question the repository's
  configuration already answers mechanically.
- **Run both producers side by side.** Rejected because the same bump would be proposed twice, and
  deduplication would depend on two systems agreeing on naming and timing.
