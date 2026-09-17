# TIB-2026-09-17: Remove never-deprecated Bundler3 primitives in the pending majors

| Field          | Value                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                          |
| **Date**       | 2026-09-17                                                                                        |
| **Author**     | @foulques                                                                                         |
| **Scope**      | `morpho-sdk` 6.0.0, `wdk-protocol-lending-morpho-evm` 2.0.0, `morpho-ts` 3.0.0, `blue-sdk` 7.0.0, `blue-sdk-viem` 6.0.0 |
| **Supersedes** | TIB-2026-08-25 Bundler3-primitive retention only                                                  |

---

## Context

[`TIB-2026-08-25`](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md) routes high-level Blue writes
through `BlueBundlesV1` and lists "Removing Bundler3 primitives used by other SDK products or
advanced composition" as a non-goal, so the low-level Bundler3 surface (`BundlerAction`, the
`./bundler` subpath, executor and adapter ABIs, the `bundler3` registry tree, GeneralAdapter
requirement helpers, and the Bundler3-specific `Holding`/`User` state) stayed public and stable.
[`TIB-2026-08-28-retire-vault-v1-shared-liquidity`](./TIB-2026-08-28-retire-vault-v1-shared-liquidity.md)
superseded that TIB for Vault V1 planning only and kept the same non-goal.

Once every high-level route in the pending majors is served by the standalone `BlueBundlesV1`,
`VaultBundlesV1`, and `VaultExitBundlesV1` contracts, no SDK product composes Bundler3 calls. The
remaining surface is an arbitrary-composition escape hatch whose only in-repo consumer was the retired
`migration-sdk-viem` implementation. Keeping it exported through the majors would either freeze a
second, untested route for a further release cycle or require a v5.x / v6.x deprecation minor solely
to mark symbols nobody routes through. AGENTS.md §7 mandates the 4-step deprecation flow and both
existing route exceptions state that no break outside their route inherits them, so this removal
needs its own recorded decision.

## Goals / Non-Goals

**Goals**

- Ship the pending majors without any low-level Bundler3 or migration-adapter surface.
- Record the exact symbol scope of the deviation so reviewers can bound it.
- Keep the previous majors installable for integrations that still compose Bundler3 calls.

**Non-Goals**

- Removing or changing the standalone `BlueBundlesV1`, `VaultBundlesV1`, or `VaultExitBundlesV1`
  routes.
- Removing raw Blue, Vault V1, or Vault V2 protocol ABI, address, or fetch exports unrelated to
  Bundler3.
- Widening the deviation to any symbol not listed below. Later removals follow §7 or get their own
  TIB.

## Current Solution

`morpho-sdk` 5.x exports `BundlerAction` and the `./bundler` subpath, Bundler3 executor, adapter,
and migration-adapter ABIs, addresses, and deployments, `getGeneralAdapterRequirements*` helpers,
Bundler3-only requirement, signature, action, and error types, and the five partial-refinance error
classes. `morpho-ts` 2.x carries the `bundler3` registry tree and legacy MORPHO token-wrapper
entries; `blue-sdk` 6.x re-exports that tree and models `Holding.permit2BundlerAllowance`,
`User.isBundlerAuthorized`, and the `Permit2Allowance`/`IPermit2Allowance` types; `blue-sdk-viem`
5.x re-exports the ABIs and reads GeneralAdapter allowance and bundler authorization in its fetchers.
None of these carry `@deprecated` JSDoc in a published release.

## Decision

The pending majors remove the surfaces below in a single step, skipping the successor-introduction,
`@deprecated`, and one-minor coexistence steps of the §7 flow. The deviation is a one-time exception
bounded to this list:

- `morpho-sdk` 6.0.0: the `./bundler` subpath and `BundlerAction` composer; Bundler3 executor,
  adapter, and Aave/Compound migration-adapter ABIs, addresses, deployments, and `BUNDLER3.md`;
  `getGeneralAdapterRequirements*` helpers and the Bundler3-only requirement, signature, action, and
  error types; legacy MORPHO token/wrapper addresses and wrapper ABI entries; the
  `BorrowAmountAndSharesExclusiveError`, `RefinanceExceedsCollateralError`,
  `RefinanceExceedsBorrowSharesError`, `RefinanceExceedsBorrowAssetsError`, and
  `RefinanceSharesMissingBorrowAssetsError` classes; and the compatibility errors, signature helpers,
  types, and facade aliases first deprecated only during the 6.0.0 prerelease.
- `wdk-protocol-lending-morpho-evm` 2.0.0: `BlueApprovalOrSignatureRequirement` and the
  Bundler3-routed input shapes first deprecated only during the 2.0.0 prerelease.
- `morpho-ts` 3.0.0: the `bundler3` tree in `addresses` and `deployments`, migration-adapter
  entries, and legacy MORPHO token/wrapper entries.
- `blue-sdk` 7.0.0: the `bundler3` registry re-exports, `ERC20_ALLOWANCE_RECIPIENTS`'s
  `bundler3.generalAdapter1` key, `Holding.permit2BundlerAllowance`, `User.isBundlerAuthorized`,
  `Permit2Allowance`, and `IPermit2Allowance`.
- `blue-sdk-viem` 6.0.0: the Bundler3 ABI re-exports and the GeneralAdapter allowance and bundler
  authorization reads in `fetchHolding`/`fetchUser`.

Everything else keeps the §7 4-step flow. The exception does not waive major changesets, migration
guides, the maintained-dependent audit and bumps, or continued availability of the previous majors.

## Invariants

- No published package in the pending majors exports a symbol whose purpose is arbitrary Bundler3
  composition or Bundler3-specific Blue state.
- `BlueBundlesV1`, `VaultBundlesV1`, and `VaultExitBundlesV1` remain the only bundle routes; their
  public method and action names are unchanged by this decision.
- `evm-simulation` retention checks cover the standalone bundle contracts only; legacy Bundler3 and
  adapter addresses are not guarded.
- The previous majors (`morpho-sdk` 5.x, `wdk-protocol-lending-morpho-evm` 1.x, `morpho-ts` 2.x,
  `blue-sdk` 6.x, `blue-sdk-viem` 5.x) remain published and installable.
- `liquidity-sdk-viem` stays pinned to the previous majors until a separate decision migrates it.

## Rejected alternatives

- **Publish a deprecation minor for the Bundler3 primitives first.** Rejected: no SDK product
  routes through them after the high-level switch, so the minor would only delay the majors by a
  release cycle to mark symbols that already have no supported successor other than the standalone
  routes; consumers who compose arbitrary bundles get the same guidance (stay on the previous major)
  either way.
- **Keep the primitives exported through the majors as unsupported advanced APIs.** Rejected: it
  preserves an untested second route (TIB-2026-08-28 rejected the same shape for Vault V1 planning)
  and implies an ongoing compatibility commitment the SDK does not intend to honor.
- **Fold the removal into the BlueBundlesV1 route exception.** Rejected: that exception explicitly
  states no break outside its route inherits it; widening it silently would erase the boundary
  reviewers rely on.

## Breaking Changes & Migration

Major bumps for `morpho-sdk`, `wdk-protocol-lending-morpho-evm`, `morpho-ts`, `blue-sdk`, and
`blue-sdk-viem`, and a minor bump for `evm-simulation` (narrowed retention guard), all in the
`remove-v6-deprecated-apis` changeset. Migration guidance lives in each package's guide:
`packages/morpho-sdk/MIGRATION-v5-to-v6.md` ("Removed without a deprecation window" and "Removed
low-level Bundler3 and migration surfaces"), `packages/wdk-protocol-lending-morpho-evm/MIGRATION.md`,
`packages/morpho-ts/MIGRATION-v2-to-v3.md`, `packages/blue-sdk/MIGRATION-v6-to-v7.md`
("Deprecation-window exception"), and `packages/blue-sdk-viem/MIGRATION-v5-to-v6.md`. Integrations
that still compose arbitrary Bundler3 calls stay on the previous majors or encode against the
contracts independently.

## Acceptance Criteria

- [ ] Every symbol listed under Decision is absent from the pending majors' public barrels and
      facade subpaths; a repo-wide search finds no consumer.
- [ ] No removal outside that list skips the §7 flow.
- [ ] AGENTS.md §7 carries an exception bullet pointing to this TIB, phrased like the two existing
      route exceptions and ending with the "no break outside this scope inherits this exception"
      clause.
- [ ] Each affected package's migration guide states that the removal did not receive a published
      deprecation window.
- [ ] The `remove-v6-deprecated-apis` changeset lists the removed surfaces and bumps every affected
      package.

## References

- [TIB-2026-08-25: Route Blue actions through BlueBundlesV1](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md)
- [TIB-2026-08-28: Retire Vault V1 shared liquidity](./TIB-2026-08-28-retire-vault-v1-shared-liquidity.md)
- [TIB-2026-08-28: VaultExitBundlesV1 force withdraw for Vault V2](./TIB-2026-08-28-vault-exit-force-withdraw.md)
- [TIB-0003: SDK package deprecation lifecycle](./TIB-0003-sdk-package-deprecation-lifecycle.md)
