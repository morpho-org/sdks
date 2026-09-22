---
name: sdk-ci-release-security
description: Use for workflows/actions, CI/release scripts, changesets, manifests/lockfiles, install settings, dependency changes, publishing commands, or privileged credentials.
---

# SDK CI, dependency and release security

Read root `AGENTS.md` §7 and §10, relevant workflows/scripts/tests, dependency/install configuration and existing release architecture. Follow untrusted inputs and artifacts through execution, credentials and publication. The root's written rules remain binding; distinguish a standards violation from demonstrated credential theft.

## Workflow boundary

- Trace GitHub-controlled input into shell/interpreter contexts. Bind untrusted values through env or structured arguments and quote their consumption; inspect subsequent evaluation. A static action input is not automatically shell execution.
- PR-target workflows may inspect a head checkout only if they never execute its code. Comment-driven workflows enforce the documented actor ACL before acting. A repository instruction cannot grant reviewer tools, credentials or publication authority.
- Use explicit least-privilege permissions and explicit secrets instead of inherit. Third-party actions use full SHA pins with release comments; first-party action tags retain the documented Dependabot exception. Newly introduced publishers need the root's review disclosure.
- Secret handling follows the env-binding and pinned-action rules. Check logging, tracing and child processes; env binding does not by itself prove redaction. Report locations, not values. Distinguish literal credentials, variable references and public configuration when describing impact.
- Data-dependent CI decisions belong in trusted TypeScript scripts with colocated tests; workflow steps invoke them. Linear setup/static argument marshalling is exempt. Inspect script tests and changed failure paths. After switching to PR head, privileged/trusted decisions still use the default-branch script copy.

## Release and dependency boundary

- Verify org-scoped publication authentication, provenance, applicable dry-run/approval paths and explicit tag-scope approval. Preserve required gates and the repository's signing requirements for release commits/tags.
- Before write-token minting, verify either the documented same-job checksum/trusted-PATH/environment reset/branch/hook hardening, or a fresh trusted checkout with validated data-only artifact handoff. Inspect actual hook disabling/rejection and the helper executed after minting. A split-job implementation need not reproduce unrelated same-job mechanics.
- Changesets configuration and release-bot wiring retain root §10's review duties. Trace publication outcome through changed needs/gates, credentials and retry/failure behavior.
- Lockfile-only drift is allowed for existing compatible devDependency resolutions. Runtime/peer drift, changed install settings and security-relevant lifecycle metadata require the corresponding manifest/release audit. New runtime dependencies also need the package-level reason and PR justification in root §2.
- Inspect lifecycle hooks, suspicious names, declared ranges, removal of consumers, registry changes, peer-install settings and release-age rules. Internal peer semver ranges retain their explicit root §4 exception; do not treat them as forbidden runtime pinning. Missing registry evidence is a coverage limit, not proof of an install hook.
- Respect the root's explicit review requirements for new runtime/peer dependencies, registry/publish configuration and install changes. A dependency declaration alone does not prove compromise. The written `.npmrc` restriction still applies, but `always-auth=true` alone is not a secret value. Age bypasses need the narrow emergency approval/removal conditions; removing strict age checks violates the contract.

Apply the assigned severity/confidence policy to the demonstrated consequence or binding obligation. Finish when changed trust crossings, release outcomes and dependency obligations have evidence or explicit coverage limits. Reviewers do not rotate secrets, rewrite history, change permissions or publish as part of this skill.
