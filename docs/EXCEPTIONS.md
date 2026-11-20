# Rule exceptions

This file records every scoped or temporary waiver of a rule in root or package
`AGENTS.md` files. Point here from the nearest `AGENTS.md`. Each entry names the
rule, exact scope, reason, approval source and removal condition. Remove an entry
in the PR that makes it obsolete. A waiver added or widened in a PR does not
justify that PR's own change: it must already allow the exact behavior on the
base branch and have been accepted through its own earlier PR.

Rules that define their own permanent carve-outs keep them inline, including
root §2.6 mocked-transport unit tests, §7 critical-security minimumReleaseAge
bypasses and tagged first-party actions in ci-release-security. Workflow-security
baselines remain in `.github/workflows/AGENTS.md`.

## WDK private-field validation gap

- **Waives:** [WDK private-field shape checks and fail-closed validation](../packages/wdk-protocol-lending-morpho-evm/AGENTS.md).
- **Scope:** `wdk-protocol-lending-morpho-evm/src/morpho-protocol-evm.ts` reads of `_provider` and `_chainId`.
- **Why:** Known gap, not a precedent: `_provider` is cast to `WdkProvider` without a shape check, and a missing or non-`bigint` `_chainId` skips the account chain comparison instead of throwing. The pinned WDK constructors always assign `_provider`. `_chainId` starts `undefined` and WDK fills it on the first `_getChainId` call, so the account comparison is skipped until then; the configured `chainId` is still compared with the validated context. New reads must fail closed, and adding these guards is welcome.
- **Approved in:** PR #747, which added the package's invariants.
- **Remove when:** `_provider` is shape-checked and missing or malformed `_chainId` fails closed rather than skipping account comparison.

## WDK Apache-2.0 license

- **Waives:** The monorepo licensing convention: every other package is MIT.
- **Scope:** `wdk-protocol-lending-morpho-evm` package `LICENSE` and `package.json#license`.
- **Why:** This is the only Apache-2.0 package in the monorepo; everything else is MIT. Keep its package license and license declaration.
- **Approved in:** PR #747, which recorded the license exception.
- **Remove when:** A separate relicensing decision record authorizes changing the package license.

## Deployless query test placement

- **Waives:** Root [§5 unit-test colocation](../AGENTS.md#5-testing).
- **Scope:** Fixtures and helpers for `src/queries` in `midnight-sdk` and `blue-sdk-viem`, and their tests under each package's `test/` directory.
- **Why:** `src/queries` holds only compiler-generated artifacts from Solidity sources under `contracts/` (excluding `interfaces/`) and re-export-only `index.ts` barrels; `bun run compile` fails on anything else. Query fixtures and helpers therefore live under `test/`, with their tests as fork tests named `*.integration.test.ts`, since the unit project only runs `src/**/*.test.ts`.
- **Approved in:** PR #508, which rejected source-less deployless query artifacts.
- **Remove when:** Query fixtures and helpers can have colocated unit tests without violating the generated-artifact-only boundary and with those tests routed by the unit project.

## ERC-3643 ABI compatibility

- **Waives:** The [blue-sdk-viem rule requiring non-Blue ABI literals to live in morpho-ts](../packages/blue-sdk-viem/AGENTS.md).
- **Scope:** `erc3643Abi` and `erc3643IdentityRegistryAbi` in `blue-sdk-viem/src/abis.ts`.
- **Why:** These non-Blue ABIs stay local because no supported `morpho-ts` version in the `^3.0.0 || ^4.0.0` peer range exports them. Importing them from a new release would require raising the minimum peer version.
- **Approved in:** PR #671, which added ERC-3643 transfer-eligibility detection.
- **Remove when:** The minimum `morpho-ts` peer version supported by `blue-sdk-viem` exports these ABIs, for example at its next major.

## Liquidity SDK deprecation window

- **Waives:** Only the three-month source-removal wait in Phase 4 of [ADR-2026-05-13-sdk-package-deprecation-lifecycle](./adrs/ADR-2026-05-13-sdk-package-deprecation-lifecycle.md), referenced by root [§7 deprecation flow](../AGENTS.md#7-releases--versioning).
- **Scope:** Removal of `packages/liquidity-sdk-viem`, the source of `@morpho-org/liquidity-sdk-viem`, covering all published versions through 4.2.2. No other package removal inherits this exception.
- **Why:** The package is frozen on the `morpho-sdk` 5.9.0 Vault V1 graph and has no workspace consumers. Source removal is allowed once every published version carries the Phase 3 npm deprecation notice `Deprecated: use the Vault V2 BluePublicAllocator APIs in @morpho-org/morpho-sdk`; published versions must stay on npm.
- **Approved in:** PR #893, with maintainer approval from Foulques (GitHub @Foulks-Plb).
- **Remove when:** The three-month Phase 4 wait has elapsed, so the source removal no longer relies on this waiver.

## Experimental TransactionPlan APIs

- **Waives:** The major-bump and deprecation-step requirements of root [§7 releases and versioning](../AGENTS.md#7-releases--versioning), for the beta scope defined by [ADR-2026-11-04-transaction-plan-format](./adrs/ADR-2026-11-04-transaction-plan-format.md).
- **Scope:** From the first `morpho-sdk` release that ships TransactionPlan, only public exports defined under `packages/morpho-sdk/src/transactionPlan/` and tagged `@experimental`. The directory is the symbol scope; tags outside it grant no exemption, and other packages or directories need their own scoped exception.
- **Why:** These beta APIs may break with a minor changeset describing the break instead of a major bump or deprecation steps; stored-format version guards still apply. All TransactionPlan code lives in that directory, with every public export tagged during beta; only `src/index.ts` re-exports and tests under `test/` may live outside, and other code must not import from it.
- **Approved in:** PR #686, which accepted ADR-2026-11-04-transaction-plan-format.
- **Remove when:** All scoped symbols have graduated from beta. Removing `@experimental` graduates a symbol for good; tagging an already-released stable symbol needs maintainer approval.

## Midnight `cancelOffers` retyping in morpho-sdk v10

- **Waives:** Only the deprecation steps of root [§7 deprecation flow](../AGENTS.md#7-releases--versioning) (introduce a successor, deprecate, maintain both for one minor). The major bump, the changeset and the migration guide remain required.
- **Scope:** The `cancelOffers` method of `client.morpho.midnight(chainId)` in `@morpho-org/morpho-sdk` 10.0.0: its parameters change from `{ accountAddress, cancellations, deadline }` to `{ accountAddress, groups }` and its action from `MidnightCancelAndMakeAction` to `MidnightCancelOffersAction`. No other symbol, package or version inherits this exception.
- **Why:** [ADR-2026-11-17-midnight-direct-offer-cancellation](./adrs/ADR-2026-11-17-midnight-direct-offer-cancellation.md) moves offer cancellation from MidnightBundlesV2 to a direct Midnight call so a wallet policy can approve it by method name. Keeping the old shape for a deprecation period would leave a bundle cancel route alive and several names for one intent; the name is kept and retyped in the major instead, and `MIGRATION-v9-to-v10.md` shows the call before and after.
- **Approved in:** The documentation-only PR that added this entry and accepted ADR-2026-11-17-midnight-direct-offer-cancellation, ahead of the implementation in PR #933, with maintainer approval from Jinsuk (GitHub @jinmel).
- **Remove when:** `@morpho-org/morpho-sdk` 10.0.0 is published, so the retyping no longer relies on this waiver.

## evm-simulation report-returning simulate

- **Waives:** The successor, deprecation and one-minor coexistence steps of root [§7 deprecation flow](../AGENTS.md#7-releases--versioning).
- **Scope:** Only `simulate` in `@morpho-org/evm-simulation` 9.0.0: its return type, which changes from throwing SDK failures to returning `SimulationReport` or `SimulationInputReport`, and its signature, which changes to `simulate(client, params, options?)` with the removal of `params.chainId`, `SimulationConfig`, `ChainSimulationConfig` and `InvalidChainIdError`, and of `ChainSimulationClientConfig` and `ChainSimulationConfigEntry`, which 8.9.0 publishes without deprecation; also the removal of `findings` and the renaming of `SimulationRejectedError` to `SimulationExecutionError` with no alias, both published in 8.8.0. No other symbol, package or version inherits this exception.
- **Why:** A report-returning successor would be a second entry point every consumer adopts and then leaves; the major changeset, migration guide and dependent audit stay required, and 8.x stays published. 8.x releases, such as 8.9.0 with the CCIP-Read fix and the client configuration, can ship from main until the first breaking 9.0 PR adds the release hold.
- **Approved in:** [ADR-2026-11-17-evm-simulation-failure-report](./adrs/ADR-2026-11-17-evm-simulation-failure-report.md), with maintainer approval from Jinsuk Park (GitHub @jinmel): "I authorize retyping simulate() in 9.0.0 with no overlap minor", extended to the signature: "I want to ship this changes in current major release: make the viemClient a consumer obligation to provide, not within the evm-simulation. So simulate() should accept the `client` variable as first argument." For `findings` and `SimulationRejectedError`, published in 8.8.0 before any release hold: "just bump to 9.0.0" (@jinmel, 2026-11-18). For 8.9.0's client configuration, the client-first authorization above, confirmed after it merged: "I think enforcing a client configuration is too harsh. can we just keep it under documentation?" (@jinmel, 2026-11-18).
- **Remove when:** `@morpho-org/evm-simulation` 9.0.0 is published, so the retype no longer relies on this waiver.
