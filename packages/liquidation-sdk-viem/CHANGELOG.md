# @morpho-org/liquidation-sdk-viem

## 4.0.1

### Patch Changes

- [#722](https://github.com/morpho-org/sdks/pull/722) [`d2882d6`](https://github.com/morpho-org/sdks/commit/d2882d6535bfbd5dad09e022062b6f07f5fb2a53) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Deprecate `@morpho-org/liquidation-sdk-viem` for application consumers. See [DEPRECATION.md](./DEPRECATION.md) for the npm deprecation message, maintained `@morpho-org/morpho-sdk` replacement primitives, and the liquidation-specific bot surface that is not retained.

- Updated dependencies [[`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0)]:
  - @morpho-org/morpho-ts@2.5.2

## 4.0.0

### Major Changes

- [#675](https://github.com/morpho-org/sdks/pull/675) [`a7a1547`](https://github.com/morpho-org/sdks/commit/a7a15476316f71d3675ce2d85e0720a5999ca9c2) Thanks [@Jean-Grimal](https://github.com/Jean-Grimal)! - Remove USD0 / USD0++ liquidation support. These collateral assets are no longer
  used on Morpho. Dropped:

  - `Usual` namespace and `src/tokens/usual.ts`.
  - `usd0`, `usd0++`, `usd0usd0++` entries on the `ChainAddresses` augmentation
    and the matching custom-address registrations on Ethereum mainnet.
  - `curvePools` constant (only consumed by the removed swap helpers).
  - `LiquidationEncoder.curveSwapUsd0Usd0PPForUsdc`,
    `LiquidationEncoder.swapUSD0PPToUSDC`, and the now-unused curve helpers
    `getCurveWithdrawalAmount`, `getCurveSwapOutputAmountFromInput`,
    `getCurveSwapInputAmountFromOutput`, `removeLiquidityFromCurvePool`, and
    `curveSwap`.

  `getCurveSwapIndex0Token` and the Spectra-driven `spectraCurveSwap` are kept
  since they remain in use by the Spectra integration.

### Patch Changes

- [#683](https://github.com/morpho-org/sdks/pull/683) [`905726e`](https://github.com/morpho-org/sdks/commit/905726ef7b257e5074f029310e11c5236093a34f) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Migrate Morpho API market identifier selections from the deprecated `uniqueKey` field to `marketId` aliases while preserving existing SDK output shapes.

## 3.0.0

### Patch Changes

- Updated dependencies [[`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987)]:
  - @morpho-org/blue-sdk@6.0.0

## 2.22.1

### Patch Changes

- [#648](https://github.com/morpho-org/sdks/pull/648) [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh packages that need a release after direct dependency, peer dependency, or source compatibility changes.

  - Update direct runtime dependency ranges for packages using `@noble/hashes`, `zod`, `@velora-dex/sdk`, `mutative`, `viem-deal`, and `viem-tracer`.
  - Widen React and TypeScript peer ranges in the Wagmi adapters only where the updated development dependencies require it, while preserving the previous lower-bound support.
  - Keep the SDK source compatible with the refreshed toolchain and libraries, including TypeScript 6, `@noble/hashes` 2.x subpath imports, TanStack Query/Wagmi inference changes, and viem error formatting; related tests/assertions were updated to match the refreshed dependencies.

- Updated dependencies [[`9dce8b7`](https://github.com/morpho-org/sdks/commit/9dce8b7047266badf7c7c813074a08f51ccb8c0a), [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e)]:
  - @morpho-org/blue-sdk@5.23.3
