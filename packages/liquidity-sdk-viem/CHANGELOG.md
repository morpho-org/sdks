# @morpho-org/liquidity-sdk-viem

## 3.0.2

### Patch Changes

- [#731](https://github.com/morpho-org/sdks/pull/731) [`99d8ff8`](https://github.com/morpho-org/sdks/commit/99d8ff8305561b2d06c1a6874ce6a5c42176045f) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Fix market fetches to use the withdraw market when resolving allocation market data.

- Updated dependencies [[`401cf32`](https://github.com/morpho-org/sdks/commit/401cf3244b32fcb00f6c7676b2a43e34a0283cad), [`738421e`](https://github.com/morpho-org/sdks/commit/738421e4a428ce361d2fe551746b0c406a0fe31f), [`95b07ef`](https://github.com/morpho-org/sdks/commit/95b07ef56b8146f1084a35834243df4a7399a51d), [`6d59b5a`](https://github.com/morpho-org/sdks/commit/6d59b5abdcdab7f5da3df826ea4556899a5b765d), [`43e6cfc`](https://github.com/morpho-org/sdks/commit/43e6cfcf7eaab0355dccbe3f9f55c59cdac72f0a), [`797928c`](https://github.com/morpho-org/sdks/commit/797928cd09234c98ac3259f7a07e7961eb670755)]:
  - @morpho-org/blue-sdk@6.1.0
  - @morpho-org/morpho-sdk@3.1.1
  - @morpho-org/blue-sdk-viem@5.1.0
  - @morpho-org/morpho-ts@2.6.0

## 3.0.1

### Patch Changes

- [#742](https://github.com/morpho-org/sdks/pull/742) [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix npm source metadata by publishing full repository URLs and monorepo package directories.

- Updated dependencies [[`49b24e7`](https://github.com/morpho-org/sdks/commit/49b24e7e8ffc9e1ff6ea1381b81873de7cccdd83), [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7), [`49b24e7`](https://github.com/morpho-org/sdks/commit/49b24e7e8ffc9e1ff6ea1381b81873de7cccdd83)]:
  - @morpho-org/morpho-sdk@3.1.0
  - @morpho-org/blue-sdk@6.0.1
  - @morpho-org/blue-sdk-viem@5.0.1
  - @morpho-org/morpho-ts@2.5.3

## 3.0.0

### Major Changes

- [#655](https://github.com/morpho-org/sdks/pull/655) [`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Use `morpho-sdk` `ReallocationData` for shared-liquidity planning instead of `simulation-sdk` state, and remove the previous `delay` liquidity option.

  The removed `delay` option previously added a one-hour inclusion margin before measuring target-market vault headroom. Shared-liquidity planning now uses the fetched block timestamp forwarded to `ReallocationData`; integrators that need a larger safety margin should apply it before constructing or submitting the borrow.

  This package now peers on `@morpho-org/morpho-sdk@^3.0.0` because it imports `ReallocationData` from the new `@morpho-org/morpho-sdk/entities` subpath introduced by the pending morpho-sdk major.

### Patch Changes

- Updated dependencies [[`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0), [`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0), [`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0)]:
  - @morpho-org/morpho-sdk@3.0.0
  - @morpho-org/morpho-ts@2.5.2

## 2.0.1

### Patch Changes

- [#683](https://github.com/morpho-org/sdks/pull/683) [`905726e`](https://github.com/morpho-org/sdks/commit/905726ef7b257e5074f029310e11c5236093a34f) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Migrate Morpho API market identifier selections from the deprecated `uniqueKey` field to `marketId` aliases while preserving existing SDK output shapes.

## 2.0.0

### Patch Changes

- Updated dependencies [[`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987)]:
  - @morpho-org/blue-sdk@6.0.0
  - @morpho-org/blue-sdk-viem@5.0.0
  - @morpho-org/simulation-sdk@4.0.0
