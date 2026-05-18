# @morpho-org/morpho-sdk

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
