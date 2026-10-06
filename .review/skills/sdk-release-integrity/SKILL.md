---
name: sdk-release-integrity
description: CI, release and automation integrity in morpho-org/sdks-internal. Use when a change touches GitHub workflows or actions, scripts/ci, scripts/release or scripts/publish (and the helpers they import, scripts/paths.ts and scripts/generate-midnight-package-version.ts), package.json dependencies or versions, pnpm-lock.yaml, .npmrc, pnpm-workspace.yaml, changesets, publishing, or the review and agent instructions (.review, .agents, .claude, AGENTS.md, SKILL.md files). Checks semver and changesets, dependency trust, workflow permissions and secrets, publish integrity, and that review criteria stay in sync with their source. Not for package API design (sdk-compatibility).
---

# CI, release and automation integrity

CI holds privileged tokens and releases publish under the org's name, so a
workflow or dependency change can leak secrets or ship a poisoned package.
Review only workflows and settings the diff changes; don't speculate about
others.

Apply each section only when its condition holds.

## 1. Semver and changesets

**Applies when** the diff changes published package source, a package
version, or `.changeset/`.

- Behavior-affecting source changes ship a `.changeset/*.md` whose bump
  matches the contract change: patch for fixes and internal maintenance,
  minor for additions and deprecations, major for removed, renamed or retyped
  public symbols.
- No changeset for repo metadata, non-API docs, fixtures, generated outputs or
  tests only. A JSDoc-only change may ship a patch; its absence is low unless
  the export's contract changed.
- A package bump is checked against its dependents. Maintained packages with a
  direct runtime dependency on it get a patch when their latest release must
  resolve the new version (for example `blue-sdk` address or ABI updates
  patch `morpho-sdk`). Internal peer ranges are explicit semver, so Changesets
  won't bump peer dependents: check the range and add their changesets.
- A major also needs a migration guide. `.changeset/config.json` changes are
  flagged for human review every time.

## 2. Dependencies and installs

**Applies when** the diff changes a `package.json` dependency,
`pnpm-lock.yaml`, `.npmrc` or `pnpm-workspace.yaml`.

- A new runtime or peer dependency of a published package is high by default
  and needs a package-level reason in the PR body (§2 rule 9); a dev-only one
  is medium. In both, flag `preinstall`, `install` or `postinstall` scripts,
  `^` or `~` ranges on runtime dependencies, and names that resemble
  typosquats. A removed dependency's users are removed too.
- A lockfile change without a manifest change is fine when every changed
  resolution is an existing dev dependency still within its range. It is a
  finding when it changes runtime or peer resolutions, leaves a declared
  range, changes install settings, or adds or removes packages with install
  scripts.
- `.npmrc`: `always-auth=true` or a committed `_authToken=` is critical; a
  registry other than `registry.npmjs.org` needs human review. Flipping
  `auto-install-peers` or `strict-peer-dependencies` is medium.
- A `minimumReleaseAgeExclude` entry is high unless it is the §7 critical
  security exception (exact `<package>@<version>`, advisory, severity and
  publish date in the PR body, removal tracked) or has explicit maintainer
  approval and is removed before merge. Removing `minimumReleaseAgeStrict` is
  always high.

## 3. Workflow trust

**Applies when** the diff changes `.github/workflows/`, `.github/actions/`,
`scripts/ci/`, `scripts/release/`, `scripts/publish/`, `scripts/workflow.ts`, or
the helpers `scripts/release/` imports (`scripts/paths.ts`,
`scripts/generate-midnight-package-version.ts`).

- **Injection (critical).** Attacker-controllable context
  (`github.event.*`, `github.head_ref`, comment bodies, branch names) is bound
  through `env:` and used as `$VAR`, never interpolated into `run:`,
  `shell:` or action arguments.
- **Trusted execution.** `pull_request_target` never checks out and runs PR
  head code. Comment-triggered workflows gate on `author_association`
  (`OWNER`, `MEMBER`, `COLLABORATOR`) before acting on text. Steps that run
  against the PR head use the default-branch copy of a script.
- **Logic is tested code (high).** A `run:` block that parses data, filters
  or counts records, computes outputs or decides pass/fail belongs in a
  TypeScript script under `scripts/ci/` (or `scripts/publish/` for npm publish
  checks the public repository also runs) with a colocated `*.test.ts`
  (pattern: `scripts/ci/claude-review-gate.ts`). Linear setup steps and
  marshalling static inputs are exempt. A new or changed CI script needs its
  test; a new one written as `.mjs` or `.js` is medium.
- **Pinning (high).** Third-party actions pin a full commit SHA with the tag
  in a trailing comment. First-party `actions/*` and `github/*` may use tags.
  Name the publisher of a newly used action so a maintainer can confirm it.
- **Permissions (high).** Every workflow declares `permissions:`, default
  `contents: read`, with job-level scopes where jobs differ. `id-token: write`
  only for OIDC or provenance publishing. `secrets: inherit` is forbidden.
- **Secrets (high).** Secrets are `env:`-bound, never interpolated into
  `run:`, and only passed to SHA-pinned third-party actions (first-party
  `actions/*` and `github/*` may use tags). Widening a secret's reach is
  high, critical on the write-token or publish path: loosening the
  `main`/`next` gate on `version-pr` and `publish`, moving a write or publish
  secret into the ungated `test` job, or exposing any secret to a fork
  trigger. The RPC URLs already on every branch are the accepted baseline. A
  new secret name needs a row in `.github/workflows/AGENTS.md` (medium).

## 4. Publishing and release commits

**Applies when** the diff changes publish, tagging, release-commit or
artifact-validation steps.

- Publishing keeps `--provenance` (or the Changesets provenance path) and an
  org-scoped `NODE_AUTH_TOKEN`, never a personal token. Removing provenance is
  at least medium, high for runtime or peer packages. A `next`/`latest` tag
  change needs an `environment:` with required reviewers.
- Artifact identity is read the way the consumer reads it: the pacote read in
  `scripts/publish/read-tarball-identity.ts`, never `tar -x`, `tar -t | grep` or a
  hand-written tar or path parser. Replacing or demoting the pacote read is
  critical; new parsing logic or a loosened rule in
  `scripts/publish/verify-tarball-collisions.ts` is high.
- Release commits stay GitHub-signed through `createCommitOnBranch`;
  replacing it with local `git commit` and push is critical. A write-scoped
  token is minted only after either same-job hardening (helper checksum and
  `$PATH` verified, `$GITHUB_ENV` and `$GITHUB_PATH` truncated, hooks checked
  or disabled) or a split-job boundary with a fresh checkout and a validated
  data-only artifact. Enabled hooks before that step are critical.
- Removing a required check from a release workflow's `needs:` is high.

## 5. Review criteria and agent instructions

**Applies when** the diff changes `.review/`, `.agents/`, `.claude/`,
`.codex/`, an `AGENTS.md` or a `SKILL.md`.

- While both reviewers run, the personas and `AGENTS.md` are the source and
  `.review/` mirrors them. A rule changed in one changes in the other in the
  same PR, keeping its conditions and exceptions; a mirrored rule that would
  flag what its source allows is a finding.
- `.review/manifest.json` registers each skill with a matching path, `name`
  and description, and its path rules reach the files where violations would
  appear.
- Persona changes keep the inventory in sync: the engine roster, `AGENTS.md`
  §10 tables, `applies:` frontmatter and `> Applied by personas:` callouts,
  and for a conditional persona its trigger flag in the engine's Step 4. A
  persona's `name:` equals its filename and frontmatter has no `<` or `>`.
- Commands: each caller in `.agents/commands/` has its `.claude/commands/`
  symlink, and a removed caller loses it. The engine itself is never
  symlinked there.
- A `../references/X.md` an agent cites exists, and each reference is cited.
- Deterministic logic (line math, scope filters, ledger merges) lives in a
  `scripts/` helper, not only in `SKILL.md` prose.
- Persona frontmatter keeps its contract: `kind: baseline` declares no
  `trigger:`, `kind: conditional` declares one that Step 4 defines, and every
  persona has `applies:`, `out-of-scope:`, `focus:` and severity calibration.
- Reference pointers (`> Applied by personas:`, `applies:`, section anchors)
  resolve in both directions.
- Report contract breaks, not wording preferences.

## Severity

- **Critical:** script injection from attacker-controllable context; a
  write token or publish path reachable from a fork-accessible trigger; loss
  of GitHub-signed release commits; enabled hooks before a write-token step;
  publish identity read outside the consumer's own reader.
- **High:** any other secret exposed to a fork-accessible trigger; an
  unpinned third-party action; a missing or widened `permissions:` scope; `secrets: inherit`; `pull_request_target` running PR
  code; a write token minted without hardening or a split-job boundary; a
  required check dropped from a release workflow's `needs:`; untested
  data-deriving logic in an inline `run:` block; a new runtime or
  peer dependency; a missing or wrong changeset for a published change;
  persona contract breaks, an undeclared Step 4 trigger flag, or inventory
  drift.
- **Medium:** a new secret without an inventory row; a new dev dependency; a
  provenance or SBOM step removed from a dev-only path; a dangling reference
  pointer or a missing or uncited reference; the engine symlinked into
  `.claude/commands/`; deterministic logic only in `SKILL.md` prose; a new CI
  script written as `.mjs` or `.js`; a `.review/` rule out of step with its
  source.
- **Low:** wording that changes no enforced rule.

## Report

Each finding names the workflow, step, manifest or file, what an attacker or
a release could do because of it, and the specific fix: the `env:` rewrite,
the SHA, the scope, the changeset. Say whether you checked registry metadata
or only the lockfile.
