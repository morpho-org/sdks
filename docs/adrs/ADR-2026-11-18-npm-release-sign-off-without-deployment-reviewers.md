# ADR-2026-11-18: Internal version-PR approval is the npm release sign-off

| Field      | Value       |
| ---------- | ----------- |
| **Date**   | 2026-11-18  |
| **Author** | @Foulks-Plb |
| **Scope**  | Repo-wide   |

_Frozen after merge; only superseded-by entries in References change._

## Context

The SDK release flow required a reviewed internal version PR followed by a separate
human approval of the public npm deployment. The public repository was a generated
mirror, and the sync App could update its publishing workflow as well as its packages.
The earlier independent-provenance decision assumed that human npm approval would
remain. Foulques Pellabeuf (@Foulks-Plb), the SDK owner and decision maker, chose
internal version-PR approval as the release sign-off instead of a second deployment
approval, so stable and prerelease publishing could proceed automatically after merge.

## Decision

The public `npm` environment requires no deployment reviewers for `main` or `next`;
merging a code-owner-approved internal version PR is the release sign-off.
Required deployment reviewers are optional, not forbidden. This decision removes
the requirement to wait for a second human approval, not the requirement for
code-owner review of the internal version PR.

The `npm` environment retains selected deployment branches (`main`, optionally
`next`) and disabled administrator bypass. Publishing retains OIDC trusted
publishing with `--provenance`, the branch and package-tag rules, signed commits,
and the public-sync protection checks other than the reviewer requirement.

Anyone holding the sync App key can now publish without a second approver: that
key can replace the public publishing workflow on an allowed branch, bypassing
internal review. This is an accepted risk, not a claim that internal version-PR
review protects against a compromised sync key. An independent automated deployment
gate is not established by this decision. The earlier independent-provenance
design remains separate; its assumption that human npm approval is retained is
superseded here. No published package API or semver contract changes.

A code owner who approves an internal version PR may also merge it and trigger
publication without a distinct deployment approver. This single-code-owner
release path is also an accepted risk; code-owner review does not preserve the
earlier separation between the person merging and the person approving deployment.

## Invariants

- Internal version PRs require code-owner approval before merge; repository-rule
  review must verify this requirement, including inherited rules and bypass actors.
- Both release branches may publish without deployment reviewers; release-script
  tests must accept a reviewer-free environment and an explicitly reviewed empty
  reviewer expectation, while rejecting unresolved expectations.
- Removing deployment reviewers must not loosen deployment branch restrictions,
  administrator-bypass settings, branch/tag protections or signing requirements;
  public-sync protection tests and release-security review check those controls.
- Publishing keeps its `npm` environment, OIDC identity and `--provenance`;
  release-security review must reject removal of those boundaries.
- Revisit the accepted sync-key risk if an independent deployment gate is adopted
  or the sync App's authority changes; reviewers must reassess which party can
  publish without internal review.

## References

- Human npm-approval requirement and assumption superseded from
  [ADR-2026-11-04: An independent App gates npm publishing on internal provenance](./ADR-2026-11-04-independent-npm-provenance-gate.md).
- [ADR-2026-05-12: Release PR, publish on push](./ADR-2026-05-12-release-pr-publish-on-push.md).
