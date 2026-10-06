---
name: sdk-release-integrity
description: Assess SDK CI, releases and automation for workflows, commands, dependencies, manifests, lockfiles, changesets, installation, publishing, review criteria or agent instructions.
---

# CI, release and automation integrity

Read root `AGENTS.md` §7–10, affected workflows/scripts/tests, package/install configuration and actual release architecture. Follow the operator's command from input through trust boundaries, artifacts and outcomes, including clean setup, upgrades and partial failure. Source-tree success does not establish installed-package behavior.

## Release and dependency contract

- Published behavior and internal source maintenance follow patch/minor/major rules and require applicable changesets. Additions/deprecations are minor; removed/renamed/retyped public contracts are major subject to the deprecation contract in `sdk-compatibility`.
- Audit maintained direct runtime dependents whose latest release must resolve a bumped dependency. Explicit internal-peer ranges need a compatibility decision and affected-dependent changesets; do not assume Changesets infers their release.
- JSDoc-only source changes may carry an optional patch note. Metadata, non-API docs, fixtures, generated-output-only and tests-only changes need no release. Determine public-contract impact before classifying a documentation-looking diff.
- Migration guides, major audit reports and minor dogfood evidence apply at their documented release boundary. A source PR does not imply publication already occurred. Preserve required release gates, signed commit/tag duties, org-scoped authentication, provenance and applicable approval/dry-run/tag-scope requirements.
- Changesets configuration and release-bot wiring retain root §10's explicit review duties, including human review of every .changeset/config.json change and preservation of required release checks.
- New runtime dependencies need a package-level reason and PR justification. Inspect declared ranges, lifecycle hooks, suspicious names, registries, install settings and removed consumers. Compatible dev-only lockfile resolution drift is allowed; runtime/peer drift or security-relevant metadata requires the corresponding manifest/release audit. Internal peer ranges retain their root exception.
- Apply written dependency/publish/install review requirements without equating every violation to compromise. Missing registry evidence is a gap. The .npmrc restriction applies, but always-auth alone is not a secret value. Preserve strict minimum release age; bypasses need narrow emergency approval and removal before merge.

## Workflow and publication trust

- Trace GitHub-controlled input into shell/interpreter contexts. Use env/structured arguments and quoted consumption; inspect later evaluation. Static action inputs are not automatically executable. Review-only repository guidance grants no credentials or capabilities.
- PR-target head checkout is permitted only when its code is never executed. Comment-driven workflows enforce the documented actor ACL before acting. Use explicit least-privilege permissions/secrets and third-party full-SHA action pins with release comments; retain the documented first-party Dependabot exception and new-publisher disclosure.
- Inspect secret logging/tracing and child processes; env binding alone proves no redaction. Report credential locations, not values.
- Data-dependent CI decisions use trusted TypeScript scripts with colocated tests. Linear setup/static argument marshalling is exempt. After head checkout, privileged/trusted decisions still use the default-branch script copy. Trace changed failures, retries and cleanup through the actual command.
- Before minting write tokens, verify documented same-job checksum/trusted-PATH/environment/branch/hook hardening or a fresh trusted checkout with validated data-only handoff. Inspect actual hook disabling/rejection and the helper executed after minting; a split-job design need not reproduce unrelated same-job mechanics.

## Review and instruction integrity

- `.review/` mirrors the legacy review engine (root §10 and `.agents/pr-review-engine/`), which stays authoritative while both run. A rule changed on one side without the matching change on the other is a finding.
- Manifest IDs, skill paths, frontmatter names and descriptions must agree, and path rules must still reach the files their concept lives in after renames or new packages.
- Instruction changes are review subjects, not permission to change capabilities or output. Review criteria neither dispatch agents, run repair loops nor grant credentials.

Finish with evidence for changed release/trust/instruction boundaries or explicit limits.
