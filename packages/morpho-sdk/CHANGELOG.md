# @morpho-org/morpho-sdk

## 2.1.1

### Patch Changes

- [#596](https://github.com/morpho-org/sdks/pull/596) [`79443e5`](https://github.com/morpho-org/sdks/commit/79443e5814e939428b7e5bbeb30729903305cf81) Thanks [@0xbulma](https://github.com/0xbulma)! - `addTransactionMetadata` now strips a leading `"0x"` from `metadata.origin` before validating and appending it. Previously, passing `"0xcafe"` and `"cafe"` produced different calldata: `"0xcafe"` was rejected by the upstream `isHex` check (which receives the raw fragment) while `"cafe"` was accepted. With this change, both inputs produce the same 4-byte origin appended to `tx.data`. Length validation (max 8 hex chars) is applied to the raw fragment, so `"0xdeadbeef00"` (10 raw hex chars) is still rejected.

## 2.1.0

### Minor Changes

- [#677](https://github.com/morpho-org/sdks/pull/677) [`0f71108`](https://github.com/morpho-org/sdks/commit/0f71108d40854e1bb9186e52c6ce94aa4ab91912) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Export `getRequirementsAction` on the public surface. The helper encodes a pre-signed permit / permit2 requirement followed by a transfer to an arbitrary `recipient`, and was previously `@internal` (reachable only via deep dist paths). Exposing it lets action builders outside this package — e.g. the Aave V3 → Vault V2 migration in `morpho-apps` — route the pulled asset to a non-default recipient such as `AaveV3CoreMigrationAdapter`, without copying the permit/permit2 encoding logic.

  Also exports `Permit2ExpirationMissingError`, the typed error `getRequirementsAction` now throws when a `permit2` requirement signature is missing `args.expiration` (previously a generic `Error`).

### Patch Changes

- [#578](https://github.com/morpho-org/sdks/pull/578) [`e27f9bd`](https://github.com/morpho-org/sdks/commit/e27f9bdffccdfe950104b0507c5252fa3d15ab27) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Fix MarketV1 share-mode `repay` and `repayWithdrawCollateral` reverting on dormant markets: `transferAmount` and `maxSharePrice` are now sized from the accrued market snapshot instead of the stale `lastUpdate` state, so full-repay matches its accrual-immune contract.

- [#681](https://github.com/morpho-org/sdks/pull/681) [`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - **`blue-sdk`** — Fix `VaultV2._wrap` / `_unwrap` (and everything layered on them: `toAssets`, `toShares`, `maxWithdraw`, plus `previewWithdrawShares` in `deallocation.ts`) overstating assets whenever management or performance fees are pending. The previous math paired **post-accrue** `totalAssets` (from `accrueInterestView`) with **pre-accrue** `totalSupply` (still missing the fee shares the next accrual will mint), overshooting the share price by `~ pendingFeeShares / totalSupply`. Conversions now pair stored `_totalAssets` with stored `totalSupply` — both pre-accrue, internally consistent. Call `AccrualVaultV2.accrueInterest(timestamp)` for post-accrue math; it rolls `_totalAssets` forward and mints pending fee shares into `totalSupply` atomically. `AccrualVaultV2.maxDeposit`'s relative-cap check now reads `_totalAssets` instead of `totalAssets`.

  **Breaking:** `VaultV2.totalAssets` is removed (it always equalled `_totalAssets` after the fix). Read `_totalAssets` instead.

  **`blue-sdk-viem`** — `fetchVaultV2` no longer calls `vault.totalAssets()` (deployless and multicall paths), saving one RPC read per fetch.

  **`morpho-sdk`** — `MorphoVaultV2.deposit` and `MorphoVaultV1.migrateToV2` previously sized `maxSharePrice` from `vaultData.toShares(amount)` directly. With the conversion fix above, that share count is now pre-accrue, so the bound was below the actual onchain share price at execution and every bundled deposit reverted with `SlippageExceeded` (`0x8199f5f3`) inside `GeneralAdapter1`. Both entities now forward-accrue the target VaultV2 by 2h before computing the bound, mirroring `MorphoMarketV1.repay`'s shares-mode pattern.

- Updated dependencies [[`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987)]:
  - @morpho-org/blue-sdk@6.0.0
  - @morpho-org/blue-sdk-viem@5.0.0
  - @morpho-org/simulation-sdk@4.0.0
  - @morpho-org/bundler-sdk-viem@5.0.0

## 2.0.0

### Major Changes

- [#631](https://github.com/morpho-org/sdks/pull/631) [`2520c09`](https://github.com/morpho-org/sdks/commit/2520c093ddbfb284805c02b375d35493e32d3f25) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Rename VaultV1 and VaultV2 deposit parameters from `accrualVault` to `vaultData`.

- [#666](https://github.com/morpho-org/sdks/pull/666) [`c4d5a28`](https://github.com/morpho-org/sdks/commit/c4d5a28120a1bf764478023720d8fc30b6e91286) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Stop hard-enforcing `userAddress` matches the connected client account on
  transaction builders. `MorphoMarketV1` (`supplyCollateral`, `borrow`,
  `repay`, `withdrawCollateral`, `repayWithdrawCollateral`,
  `supplyCollateralBorrow`) and `MorphoVaultV1.migrateToV2` no longer call
  `validateUserAddress` at the builder layer — callers may now build a tx
  for any `userAddress` regardless of the client's connected account (or
  with a public client that has no account at all).

  The builder = signer invariant is now enforced exclusively at `sign()`
  time on the signature requirements. `Requirement.sign` and
  `ERC20PermitAction.sign` are typed against viem's `WalletClient` instead
  of the more permissive `Client` — **this is a TypeScript-breaking
  surface change** and is the reason this release is marked `major`.
  Downstream code that previously passed a value typed as `Client` to
  `sign()` will no longer compile and must switch to a `WalletClient`
  (e.g. `createWalletClient(...)` or `publicClient.extend(walletActions)`).
  Runtime behavior is unchanged for callers already passing a wallet
  client with the matching account.

  `encodeErc20Permit` / `encodeErc20Permit2` call `validateUserAddress`
  internally to reject any `sign(client, userAddress)` where the client
  account is missing or differs from `userAddress` with
  `MissingClientPropertyError` / `AddressMismatchError`. Signing on behalf
  of a different address is the only path where the divergence is a real
  security concern, so the check stays exactly there.

  `validateUserAddress` remains exported from `@morpho-org/morpho-sdk` and
  is no longer dead code — it is the canonical check used by the signature
  requirements above.

### Minor Changes

- [#656](https://github.com/morpho-org/sdks/pull/656) [`5584ce5`](https://github.com/morpho-org/sdks/commit/5584ce5e5c70ef19d35304cc1e74b106a08821d7) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Deprecate `MorphoClient` in favor of `morphoViemExtension`. Extend a viem public (or wallet) client with `morphoViemExtension(...)` and use `client.morpho.vaultV1 / vaultV2 / marketV1` instead of constructing `MorphoClient` directly. `MorphoClient` will be removed in the next major release.

### Patch Changes

- [#654](https://github.com/morpho-org/sdks/pull/654) [`217ba29`](https://github.com/morpho-org/sdks/commit/217ba29c1a80284795a9d01250e55750ad9d0f00) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Internal: `getRequirementsAction` now takes the transfer recipient as an
  explicit `recipient` parameter instead of resolving it from `chainId`. The
  function is `@internal` and not part of the public surface; all in-repo
  callers (`marketV1` supply/repay paths, `vaultV1`/`vaultV2` deposit, and
  `vaultV1` migrate-to-v2) have been updated to pass `recipient: generalAdapter1`
  directly. No behavior change — same destination address, just no longer
  hard-coded inside the helper.

- [#648](https://github.com/morpho-org/sdks/pull/648) [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh packages that need a release after direct dependency, peer dependency, or source compatibility changes.

  - Update direct runtime dependency ranges for packages using `@noble/hashes`, `zod`, `@velora-dex/sdk`, `mutative`, `viem-deal`, and `viem-tracer`.
  - Widen React and TypeScript peer ranges in the Wagmi adapters only where the updated development dependencies require it, while preserving the previous lower-bound support.
  - Keep the SDK source compatible with the refreshed toolchain and libraries, including TypeScript 6, `@noble/hashes` 2.x subpath imports, TanStack Query/Wagmi inference changes, and viem error formatting; related tests/assertions were updated to match the refreshed dependencies.

- Updated dependencies [[`9dce8b7`](https://github.com/morpho-org/sdks/commit/9dce8b7047266badf7c7c813074a08f51ccb8c0a), [`81825a8`](https://github.com/morpho-org/sdks/commit/81825a8864d8c4228c8476380d1ad7e76a5ee1c0), [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e)]:
  - @morpho-org/blue-sdk@5.23.3
  - @morpho-org/blue-sdk-viem@4.6.6
  - @morpho-org/simulation-sdk@3.4.4
