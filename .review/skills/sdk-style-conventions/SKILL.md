---
name: sdk-style-conventions
description: Use for imports, semantic helper reuse, generated sources, package source or version changes, changesets, or maintained runtime/peer dependents.
---

# SDK conventions and release intent

Read root `AGENTS.md` §7–8, the nearest instructions, Biome configuration, package manifests and relevant changesets. Check what the diff changes rather than rerunning a formatter mentally.

## Code conventions

- Enforce applicable mechanical rules not already settled by trustworthy checks. Relative imports need `.js` for NodeNext; type-only imports must not acquire needless runtime code. Reuse exported SDK types rather than redefining them.
- Prefer available semantic helpers from direct dependencies: isAddressEqual for equality and explicitly typed `_try` for optional failure. Lowercasing remains valid for normalized keys/output; successful undefined must not become indistinguishable from failure. Cite the helper and contract instead of asserting all native code is wrong.
- Generated GraphQL/build artifacts follow their input and generation path. For `liquidity-sdk-viem`, read graphql inputs and codegen configuration. An expected regenerated artifact is different from an unsupported manual edit; fixes belong at the authoritative input.

## Release contract

- Published behavior and internal source maintenance follow the root's patch/minor/major rules and require semver-relevant changesets. Additive exports and deprecations are minor; removed/renamed/retyped public contracts are major subject to the documented deprecation flow.
- Audit maintained direct runtime dependents whose latest release must resolve a changed dependency. Internal peers use explicit published semver and need a deliberate range/compatibility decision plus explicit affected-dependent changesets; Changesets does not infer that release for them.
- JSDoc-only source changes may intentionally carry a patch note; absence is not automatically a defect. Metadata, non-API docs, fixtures and tests do not require a release. Read the public contract before classifying an apparently documentation-only diff.
- Check bump size, migration guide and applicable release duties against root §7 and accepted exceptions. Historical generated changelog/version editing is not a substitute for the repository's release process. Major audit and minor dogfood requirements are evidence obligations when the change reaches that release boundary, not assumptions that every source PR has already published.

Record concrete rule violations and consumer/release consequences. Workflow/publish integrity and dependency install security are covered by `sdk-ci-release-security`; public API/deprecation compatibility is covered by `sdk-module-api-architecture`. The same reviewer owns all applicable checks.
