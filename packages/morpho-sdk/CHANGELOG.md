# @morpho-org/morpho-sdk

## 1.1.0

### Minor Changes

- 226f8c7: Drop the `deallocation <= withdraw` check on VaultV2 `forceWithdraw`. The check incorrectly rejected flows where the amount deallocated upstream exceeds what the user ultimately withdraws (e.g. when a deallocation fee is taken on top of the requested amount). The dedicated `DeallocationsExceedWithdrawError` is also removed.

## 1.0.1

### Patch Changes

- Fix published package entrypoint so the root import `@morpho-org/morpho-sdk` resolves to the compiled output. `1.0.0` shipped with `"main": "src/index.ts"` because the `publishConfig.main` / `publishConfig.types` overrides are a `pnpm publish` extension and were not applied when the tarball was built with `npm publish`. The tarball only contains `lib/`, so consumers hit cascading `Cannot find module './actions'` errors and had to fall back to deep imports like `@morpho-org/morpho-sdk/lib/index.js`. `main` and `types` are now declared at the top level of `package.json`, so the root import resolves to `lib/index.js` / `lib/index.d.ts` regardless of which package manager publishes the tarball.

## 1.0.0

### Major Changes

- First stable open-source release of `@morpho-org/morpho-sdk`. Marks the public availability of the SDK on npm under its final name, with full support for VaultV1 (MetaMorpho), VaultV2, and MarketV1 (Morpho Blue) operations. From this version onward, the SDK follows Semantic Versioning: breaking changes require a major bump.

### Patch Changes

- 5ce90e1: Fix `vaultV1MigrateToV2` to validate `userAddress` against the connected client account (SDK-101). The V1→V2 migration bundle pulls V1 shares from `msg.sender` via `erc20TransferFrom` but mints V2 shares to `userAddress`; without this check, a malicious frontend could redirect the resulting V2 shares to an attacker after the user approves GeneralAdapter1 for their V1 shares. Now throws `MissingClientPropertyError` or `AddressMismatchError`, mirroring the existing pattern on `MorphoMarketV1`.
- f8ce526: Enforce builder = signer on MarketV1 `repayWithdrawCollateral` (SDK-100 / MORP2-69). `validateUserAddress` now throws `MissingClientPropertyError("account")` when the client has no connected account, in addition to the existing `AddressMismatchError` on mismatch. This closes a mixed-account hazard where a quote built by one address but signed by another could atomically repay the builder's debt while withdrawing the signer's collateral. The invariant is documented at the integration entry points (README, BUNDLER3.md) as a build-time guard — it is not a defense against a malicious builder, since the signer remains responsible for reviewing what they sign.
- ab8b89b: Project interest accrual +10 minutes when validating position health in `repayWithdrawCollateral`. Asset-mode repay burns `toBorrowShares(assets, "Down")`; as interest accrues between build and execute, fewer shares are burned than the `lastUpdate`-pinned simulation predicted, leaving a larger residual debt on-chain. Validation could pass off-chain but the on-chain withdraw would revert. The 10-minute projection produces a conservative upper bound on residual debt; the projection is clamped to `lastUpdate` to avoid `InvalidInterestAccrual` on fork-pinned clocks.

## 0.7.0

### Minor Changes

- 1b740cf: Rename `@morpho-org/consumer-sdk` to `@morpho-org/morpho-sdk` and prepare the package for public open-source release. Consumers must update all import paths from `@morpho-org/consumer-sdk` to `@morpho-org/morpho-sdk`; the legacy package is deprecated on npm. `viem` is now a declared peer dependency (`^2.0.0`) and must be installed alongside the SDK. Adds `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, and `BUNDLER3.md` documenting bundler3 / GeneralAdapter1 flows and security features. Public npm releases now publish with Sigstore provenance (verify via `npm audit signatures`).
- 8a9429d: Bump Morpho SDK dependencies: `@morpho-org/blue-sdk` → `^5.23.0`, `@morpho-org/blue-sdk-viem` → `^4.6.3`, `@morpho-org/bundler-sdk-viem` → `^4.3.3`, `@morpho-org/morpho-ts` → `^2.5.1`, `@morpho-org/simulation-sdk` → `^3.4.2`.

## 0.6.0

### Minor Changes

- 866a4c9: Add `vaultV1MigrateToV2` atomic migration action that transfers a user's VaultV1 (MetaMorpho) position to VaultV2 in a single bundler3 transaction. The flow transfers V1 shares via `erc20TransferFrom`, redeems them via `erc4626Redeem`, and deposits the resulting assets into V2 via `erc4626Deposit` — all through GeneralAdapter1. Includes `migrateToV2()` entity method on `MorphoVaultV1`, slippage protection (`minSharePrice`/`maxSharePrice`), new error classes (`NonPositiveMinSharePriceError`, `NonPositiveSharesAmountError`, `VaultAssetMismatchError`), and comprehensive test coverage.

## 0.5.1

### Patch Changes

- c2ea532: Bump `viem` peer dependency to `^2.48.1`.
- b1b4cb3: Pin GitHub Actions refs to commit SHAs for supply chain hardening.

## 0.5.0

### Minor Changes

- 2bb4058: Add MarketV1 (Morpho Blue) support with full suite of operations: `supplyCollateral`, `borrow`, `supplyCollateralBorrow`, `repay`, `withdrawCollateral`, and `repayWithdrawCollateral`. All actions are routed through bundler3 via GeneralAdapter1 with slippage protection (`minSharePrice`/`maxSharePrice`), LLTV buffer validation, and comprehensive position health checks. Includes shared liquidity reallocations via PublicAllocator for borrow operations, new `MorphoMarketV1` entity with `fetchMarket`/`fetchPosition`, and deployless read support.

### Patch Changes

- 3e045c0: Fix total borrow calculation to include +1 wei adjustment for share-to-asset rounding in debt validation after borrowing.
- 537539a: Fix chain ID validation in VaultV1 and VaultV2 `getData` methods.

## 0.4.0

### Minor Changes

- 1b5f2bd: Add VaultV1 (MetaMorpho) support with `deposit`, `withdraw`, and `redeem` operations. Deposit is routed through bundler3 with general adapter enforcement (`maxSharePrice` protection against inflation attacks). Withdraw and redeem are direct vault calls. Both VaultV1 and VaultV2 deposits now support optional `nativeAmount` parameter for native token wrapping via `GeneralAdapter1.wrapNative()` on wNative vaults (e.g. deposit ETH directly into a WETH vault). Includes new `MorphoVaultV1` entity, action builders, dedicated error classes, and comprehensive test coverage.

## 0.3.0

### Minor Changes

- 33af11e: Add `forceWithdraw` and `forceRedeem` VaultV2 operations that allow users to free liquidity from non-liquidity adapters (e.g., Morpho Market V1 adapters, Vault V1 adapters) and withdraw or redeem in a single atomic transaction via VaultV2's native `multicall`. `forceWithdraw` is asset-based (specify exact assets to withdraw), while `forceRedeem` is share-based (specify exact shares to redeem). A penalty is taken from the caller for each deallocation to discourage allocation manipulation, applied as a share burn that keeps the share price stable. Includes new `Deallocation` type, `encodeForceDeallocateCall` helper, dedicated error classes (`EmptyDeallocationsError`, `DeallocationsExceedWithdrawError`), and entity-level integration on `MorphoVaultV2`.

## 0.2.0

### Minor Changes

- c499a72: Add fetch parameters

### Patch Changes

- 824ba5a: fix: prevent fund loss in deposit flow when signature params diverge from deposit params

## 0.1.8

### Patch Changes

- 8fc6bb5: Add supportDeployless option in morpho client

## 0.1.7

### Patch Changes

- 0f25e4a: Update morpho SDKs

## 0.1.6

### Patch Changes

- 0f55974: Introduce useSimplePermit in getRequirements

## 0.1.5

### Patch Changes

- 6f1fd28: Update morpho SDKs (fix maxDeposit with marketV1AdapterV2)

## 0.1.4

### Patch Changes

- dd9564a: fix: fetchToken for permit with viem client from morpho

## 0.1.3

### Patch Changes

- e36e454: fix use chainId in params for fetch data

## 0.1.2

### Patch Changes

- 91cf75d: Remove specific permit dai flow and use permit2 instead

## 0.1.1

### Patch Changes

- 93ccfc0: Fix sufficient allowant on permit2 flow
- 5db470d: Update morpho sdks to latest version

## 0.1.0

### Minor Changes

- 858f0e4: Introduce off-chain signature requirements: (permit, permit dai, permit2)
  New e2e and unit test
  Update viem to 2.41.2

## 0.0.4

### Patch Changes

- 501b65d: Fix workflow release

## 0.0.3

### Patch Changes

- 9c13b20: Change user in example

## 0.0.2

### Patch Changes

- 6fd03c8: Add disclaimer in readme
