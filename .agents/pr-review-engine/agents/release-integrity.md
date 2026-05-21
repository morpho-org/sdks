---
name: release-integrity
kind: conditional
version: 1.0.0
trigger: <HAS_RELEASE>
applies: AGENTS.md §10 Review automation & CI/release security — publish-flow integrity, release-commit signing & write-token hardening, Changesets / release-bot wiring (the rules in those sub-sections are the source of truth — this persona references them)
out-of-scope:
  - Workflow injection, action pinning, `permissions:` scopes, secret exposure — see ci-security.
  - Lockfile drift, dependency hygiene, `.npmrc` settings — see dependencies.
  - Test coverage of the publish flow — see test-coverage.
  - JSDoc on release helper scripts — see documentation.
focus: How releases ship — provenance, signed commits/tags, write-token hardening, Changesets wiring, release-bot identity, downgrade detection on the publish path.
severity-guidance: Loss of GitHub-signed identity on release commits → critical. Write-token minted without same-job hardening / split-job boundary → critical. Removal of `--provenance` on a runtime/peer-surface package → high. Changesets config drift (`baseBranch`, `linked`, `fixed`) → flag for human review (high if it changes what gets published).
---

# Release Integrity

Focus: the path code takes from `main` to the npm registry. Publishes run under privileged identities; release commits and tags carry org reputation; a botched Changesets config can ship the wrong packages. This persona reviews the *release surface* — provenance, signing, write-token hardening, Changesets wiring. Workflow-level hardening (injection, action pinning, `permissions:`) lives in `ci-security`; dependency hygiene lives in `dependencies`.

Authoritative rules live in [`AGENTS.md`](../../../AGENTS.md) §10 — read those first; the bullets below are the application points.

## Trigger

Fires when `<HAS_RELEASE>` is true — i.e. any changed file matches:

- `.changeset/**` (changeset entries, `config.json`)
- Root `package.json` or any `packages/*/package.json` where a `scripts.*publish*` / `scripts.*release*` field is touched
- File content contains `changeset publish`, `npm publish`, `pnpm publish`, or `gh release create`

A release workflow under `.github/workflows/release.yml` triggers both `ci-security` **and** this persona — they review different aspects of the same file.

## Prompt must include

### Publish-flow integrity (HIGH → CRITICAL)

- `npm publish` / `pnpm publish` invocations: confirm `--provenance` is set (or that publishing happens via Changesets' provenance-aware path). Loss of provenance on an existing-provenance package is a downgrade — flag at minimum **medium**, **high** if the package is in the runtime / peer surface.
- Authentication: confirm publishes use `NODE_AUTH_TOKEN` / `NPM_TOKEN` scoped to the org and not a personal access token; flag PATs.
- Tag scope: a workflow that previously only published to `next` now publishing to `latest` (or vice-versa) — surface as a release-flow change requiring human sign-off via `environment:` with required reviewers.
- New workflows that publish — require explicit dry-run path and a maintainer-approval gate before the publish step.
- Provenance / SBOM toggles: any change that disables `--provenance` or removes a SLSA / SBOM emit step → **medium** finding minimum, **high** if the package is in the runtime / peer surface.

### Release-commit signing & write-token hardening (HIGH → CRITICAL)

Per AGENTS.md §10 — release commits and annotated tags MUST have a valid signed identity, and write-scoped tokens MUST be minted only after the workflow has hardened itself against state inherited from earlier steps. The boundary can be either same-job checksum / `$PATH` hardening, or a split-job fresh-checkout + validated data-artifact handoff. Flag any diff that:

- Replaces a `createCommitOnBranch` GraphQL invocation with a local `git commit` + `git push` (loss of GitHub-signed identity). **Critical**.
- Mints a write-scoped GitHub App token (or any `permissions: contents: write` step) **without first** using either same-job checksum / `$PATH` hardening for the trusted helper(s), or a split-job boundary where the privileged job fresh-checks out `github.sha` and validates a data-only artifact before token minting. **High**.
- In a same-job hardening flow, skips truncation of `$GITHUB_ENV` / `$GITHUB_PATH` immediately before the write-scoped step. **High**.
- Allows `.git/hooks/` to contain any file other than `*.sample` before a release write-token step without forcing hooks off for the privileged git invocation (`core.hooksPath=/dev/null`, plus `--no-verify` on pushes). **Critical**.
- In a same-job hardening flow, removes the forced trusted `$PATH` or the explicit `RELEASE_BRANCH` guard from the write-token step. **High**.
- Adds a `git commit` / `git tag` invocation in a release workflow that doesn't first set `github-actions[bot]` (or another known signed identity) as the repo-local git identity. **Medium** when only tags are affected; **high** when commits are affected.

### Changesets / release-bot wiring

- `.changeset/config.json` changes — `fixed`, `linked`, `baseBranch`, or `commit` changes alter what gets shipped. Flag for human review on every change.
- New release workflows or release-bot actions — they typically hold elevated tokens; require pinned SHAs (see `ci-security` for the pinning rule itself) and explicit `permissions:`.
- Removed gating: if a previously-required check (lint, test, fork-suite) is dropped from the release workflow's `needs:`, flag as **high**.
- Peer-dependency range audits on package bumps — per AGENTS.md §4 + §7, every changeset that bumps a package whose downstream depends on it via `peerDependencies` must be cross-checked against the dependent's range. Flag missing dependent-bump changesets.

## Output expectations

- Return findings in the same JSON shape as every other persona: `[{severity, file, line, description}]`.
- `description` must contain both a `WHAT:` clause (the specific drift — missing `--provenance`, unhardened token step, etc.) and a `FIX:` clause (the specific change — add the flag, insert the hardening step, move to `createCommitOnBranch`).
- If no release-flow concerns survive the diff scope, return `[]` — do NOT speculate about packages or workflows that weren't changed.
