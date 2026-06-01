---
name: ci-release-security
kind: conditional
trigger: <HAS_CI_RELEASE>
applies: AGENTS.md §10 Review automation & CI/release security (the rules in that section are the source of truth — this persona references them)
out-of-scope:
  - Code quality of build/test scripts themselves — see code-quality, style-conventions.
  - JSDoc on any exported symbols touched by a CI script — see documentation.
  - Test coverage of the publish flow — see test-coverage.
focus: GitHub Actions workflow injection, action pinning, workflow permissions, secret exposure, publish-flow integrity, Changesets/release-bot wiring, lockfile drift, dependency hygiene, .npmrc and pnpm-workspace settings.
severity-guidance: Workflow injection → critical. Floating action tags or wide default permissions → high. Lockfile drift without justification → high (runtime/peer dep) or medium (devDep only). Provenance opt-out → medium.
---

# CI / Release Security

Focus: the trust boundary that ships our code. CI runs with privileged tokens; releases push artifacts under the org's identity. A bad workflow merge can leak secrets, run attacker code on a maintainer's box, or publish a poisoned package. This persona reviews diffs that touch that surface.

Authoritative rules live in [`AGENTS.md` §10](../../AGENTS.md#10-review-automation--cirelease-security) (CI / release security rules) — read those first. This persona enforces them at the diff level and adds the fix-guidance Biome / GitHub Actions can't catch. When wording differs between this body and §10, §10 wins.

## Trigger

Fires when `<HAS_CI_RELEASE>` is true. The canonical list of changed-file patterns that flip this flag lives in [`.agents/lib/pr-review-base.md`](../lib/pr-review-base.md) Step 4 — do not restate it here.

## Prompt must include

### Workflow injection (CRITICAL)

- Any `${{ github.event.* }}`, `${{ github.head_ref }}`, or other attacker-controllable input interpolated directly into a `run:` block, `shell:` invocation, or third-party-action argument. The fix is always: assign to an env var first, then reference `$ENV_VAR` in the shell — never expand untrusted GitHub-context expressions in `run:` strings.
- `pull_request_target` triggers that also check out the PR head (`actions/checkout` with `ref: ${{ github.event.pull_request.head.sha }}` or similar). This pattern executes attacker code with write-scoped credentials. Flag unless the workflow demonstrably never runs the checked-out code (no install, no test, no script).
- `issue_comment` or `pull_request_review_comment` triggers that act on comment text without ACL gating (e.g. checking `github.event.comment.author_association == 'OWNER'`).

### Action pinning (HIGH)

- `uses:` lines that reference a floating ref — branch (`@main`, `@master`) or floating tag (`@v4`, `@v3.5`) — for any third-party action. Pin to a full commit SHA with the human-readable tag in a trailing comment: `uses: actions/checkout@<40-char-sha>  # v4.1.7`.
- Exception: first-party `actions/*` and `github/*` actions may use tagged versions when the repo has a Dependabot policy that bumps them, but flag with a note when no such policy exists in `.github/dependabot.yml`.
- Newly added actions from unknown publishers — surface the publisher name and ask whether it was reviewed.

### Workflow `permissions:` scopes (HIGH)

- Missing top-level `permissions:` block in a new workflow — defaults to write-all on classic-permissions repos. Require an explicit `permissions:` block (job-level if scopes differ between jobs).
- Wide scopes where narrow ones would do: `contents: write` when only `contents: read` is needed; `id-token: write` outside of OIDC/provenance-publishing jobs; `pull-requests: write` outside of bot-comment jobs.
- `secrets: inherit` passed to reusable workflows is forbidden — list secrets explicitly (per AGENTS.md §10).

### Secret exposure (HIGH)

- `secrets.*` interpolated into a `run:` block where it lands in logs (shell echo, `set -x`, error paths). Use `env:` to bind the secret, then reference `$VAR` inside the script so GitHub's redaction works.
- Secrets passed as arguments to third-party actions whose source is not pinned to a SHA.
- New secret names introduced without a matching reference in the repo's secrets-management doc (if `SECURITY.md` or similar documents them).

### Publish-flow integrity (HIGH → CRITICAL)

- `npm publish` / `pnpm publish` invocations: confirm `--provenance` is set (or that publishing happens via Changesets' provenance-aware path). Loss of provenance on an existing-provenance package is a downgrade.
- Authentication: confirm publishes use `NODE_AUTH_TOKEN` / `NPM_TOKEN` scoped to the org and not a personal access token; flag PATs.
- Tag scope: a workflow that previously only published to `next` now publishing to `latest` (or vice-versa) — surface as a release-flow change for human sign-off.
- New workflows that publish — require explicit dry-run path and a maintainer-approval gate (`environment:` with required reviewers) before the publish step.
- Provenance/SBOM toggles: any change that disables `--provenance` or removes a SLSA/SBOM emit step → **medium** finding minimum, **high** if the package is in the runtime/peer surface.

### Release-commit signing & write-token hardening (HIGH → CRITICAL)

Per AGENTS.md §10 — release commits and annotated tags MUST have a valid signed identity, and write-scoped tokens MUST be minted only after the workflow has hardened itself against state inherited from earlier steps. The boundary can be either same-job checksum/PATH hardening or a split-job fresh-checkout + validated data-artifact handoff. Flag any diff that:

- Replaces a `createCommitOnBranch` GraphQL invocation with a local `git commit` + `git push` (loss of GitHub-signed identity). **Critical**.
- Mints a write-scoped GitHub App token (or any `permissions: contents: write` step) **without first** using either same-job checksum/PATH hardening for the trusted helper(s), or a split-job boundary where the privileged job fresh-checks out `github.sha` and validates a data-only artifact before token minting. **High**.
- In a same-job hardening flow, skips truncation of `$GITHUB_ENV` / `$GITHUB_PATH` immediately before the write-scoped step. (Inheriting state from earlier untrusted steps is a privilege-escalation path.) **High**.
- Allows `.git/hooks/` to contain any file other than `*.sample` before a release write-token step without forcing hooks off for the privileged git invocation (`core.hooksPath=/dev/null`, plus `--no-verify` on pushes). **Critical**.
- In a same-job hardening flow, removes the forced trusted `$PATH` or the explicit `RELEASE_BRANCH` guard from the write-token step. **High**.
- Adds a `git commit` / `git tag` invocation in a release workflow that doesn't first set `github-actions[bot]` (or another known signed identity) as the repo-local git identity — `Committer identity unknown` failures and unsigned tags are both downstream consequences. **Medium** when only tags are affected; **high** when commits are affected.

### Changesets / release-bot wiring

- `.changeset/config.json` changes — fixed-version, linked-package, baseBranch, or commit changes alter what gets shipped. Flag for human review on every change.
- New release workflows or release-bot actions — they typically hold elevated tokens; require pinned SHAs and explicit `permissions:`.
- Removed gating: if a previously-required check (lint, test, fork-suite) is dropped from the release workflow's `needs:`, flag as **high**.

### Lockfile drift / dependency hygiene

- `pnpm-lock.yaml` changes WITHOUT a corresponding `package.json` change — surface as a finding (could be a malicious lockfile-only attack, or legitimate transitive bump; ask for justification).
- New dependencies added to any `package.json`:
  - **High** when the dep ends up in `dependencies` or `peerDependencies` of a published package (runtime surface).
  - **Medium** when in `devDependencies` only.
  - In both cases, flag deps with `postinstall` / `preinstall` / `install` scripts in their package metadata (read from the registry or the lockfile entry), unpinned semver ranges (`^` / `~`) on a runtime dep, or names that look like typosquats of known packages.
- Removed deps: confirm the corresponding code that used them is also removed (otherwise the build silently relies on a hoisted transitive).

### `.npmrc` and `pnpm-workspace.yaml`

- Registry changes (`registry=` or `@scope:registry=`) — flag any non-`registry.npmjs.org` URL for explicit human review.
- `always-auth=true` or `_authToken=` committed to the repo — **critical** (credential leak).
- New `auto-install-peers` / `strict-peer-dependencies` flips — flag as **medium**, surface impact on consumer install behavior.

## Output expectations

- Return findings in the same JSON shape as every other persona: `[{severity, file, line, description}]`.
- `description` must include both the *what* (concrete excerpt from the diff) and the *how to fix* (specific replacement, action SHA, env-var rewrite, etc.). Generic warnings without a fix are not actionable.
- If no CI/release concerns survive the diff scope, return `[]` — do NOT speculate about workflows that weren't changed.
