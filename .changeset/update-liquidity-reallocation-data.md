---
"@morpho-org/liquidity-sdk-viem": major
---

Use `morpho-sdk` `ReallocationData` for shared-liquidity planning instead of `simulation-sdk` state, and remove the previous `delay` liquidity option.

The removed `delay` option previously added a one-hour inclusion margin before measuring target-market vault headroom. Shared-liquidity planning now uses the fetched block timestamp forwarded to `ReallocationData`; integrators that need a larger safety margin should apply it before constructing or submitting the borrow.

This package now peers on `@morpho-org/morpho-sdk@^3.0.0` because it imports `ReallocationData` from the new `@morpho-org/morpho-sdk/entities` subpath introduced by the pending morpho-sdk major.
