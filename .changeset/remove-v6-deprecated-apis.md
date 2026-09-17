---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": major
"@morpho-org/morpho-ts": major
"@morpho-org/blue-sdk": major
"@morpho-org/blue-sdk-viem": major
"@morpho-org/evm-simulation": minor
"@morpho-org/midnight-sdk": patch
"@morpho-org/morpho-test": patch
---

Remove all deprecated public symbols from the next majors of morpho-sdk, morpho-ts, blue-sdk,
blue-sdk-viem, and WDK. This includes Vault V1 PublicAllocator addresses, ABIs, models, fetchers,
augmentation, planners, action inputs, and compatibility aliases; deprecated utility, URL, permit,
deployless-fetch, capacity, adapter-id, error, signature, and facade aliases; and the deprecated WDK
requirement type. Use Vault V2 BluePublicAllocator APIs and each symbol's canonical replacement.

Remove morpho-sdk's low-level Bundler3 composition surface and the residual Bundler3 executor,
adapter, migration-adapter, address, deployment, action, requirement, ABI, and error exports from
morpho-sdk and morpho-ts, including the registry and ABI re-exports in blue-sdk and blue-sdk-viem.
This completes removal of the old migration-sdk-viem implementation, including its Aave and
Compound migration adapters. Remove the legacy MORPHO token/wrapper addresses and wrapper ABI
entries. The standalone BlueBundlesV1, VaultBundlesV1, and VaultExitBundlesV1 routes remain
supported. evm-simulation now checks retention only on those standalone bundle contracts; legacy
Bundler3 and adapter addresses are no longer guarded.

Remove Bundler3-specific Blue state too: `Holding` no longer exposes the GeneralAdapter ERC-20 or
Permit2 allowance, and `User` no longer exposes `isBundlerAuthorized`; their viem fetchers stop
reading those contracts. These fields and the low-level Bundler3 surfaces were stable APIs without
a published deprecation.

Some removals did not receive a published deprecation window: the stable low-level Bundler3 and
migration-adapter surfaces (including registry and ABI re-exports), compatibility errors, signature
helpers, types, and the WDK requirement alias first deprecated only during the v6 prerelease, and the
five v5 partial-refinance error classes. This is an intentional one-time lifecycle deviation;
consumers must migrate to the standalone bundle actions and canonical exports or stay on the
previous major versions. The deviation and its symbol scope are recorded in
`docs/tibs/TIB-2026-09-17-remove-bundler3-primitives-without-deprecation.md` and the matching
AGENTS.md release exception.

Keep liquidity-sdk-viem on its final Vault V1 PublicAllocator release, tested against morpho-sdk
v5.9.0. Patch maintained dependents and update internal peer ranges for the new morpho-ts, blue-sdk,
and blue-sdk-viem majors.

Add `UnsupportedRequirementSignatureError`, thrown by `selectRequirementSignatures` and
`getBundlesTokenPermit` when a requirement signature carries an action type the v6 flows do not
support (e.g. a stale v5 `permit2` signature). `getBundlesTokenPermit` previously threw
`UnexpectedRequirementSignatureError("permit")` for that case.
