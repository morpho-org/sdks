---
"@morpho-org/morpho-sdk": minor
---

Add Midnight action flows under `client.morpho.midnight(chainId)`, expose Midnight SDK API helpers through `morpho-sdk/midnight-api` and shared ABI/constant/error/utility entrypoints, and expose pure Midnight transaction builders for fixed-rate taker, maker, redeem, repay/withdraw, and cancel flows.

The Midnight entity returns lazy action outputs with `getRequirements()` and synchronous `buildTx(...)` methods, matching the existing `morpho-sdk` action pattern while accepting fixed-rate API quote takes directly. UI labels, rate display logic, and offer-chain presentation stay on the integrator side.

Midnight market transaction builders are synchronous and consume caller-provided `marketData` state, with `redeem` also consuming caller-provided `positionData`. `getMarketData(...)` and block-accrued `getPositionData(...)` remain async fetch helpers so integrators can fetch state once, compose UI/validation around it, and then build transactions without hidden reads.

Midnight Bundles calls support ERC2612 and Permit2 token permits through the same `supportSignature` / `useSimplePermit` requirement flow as Blue, while preserving `PermitKind.None` for approval-based execution.

Borrow-side flows are explicit: `takeBorrow` and `makeBorrow` borrow without supplying collateral, while `supplyCollateralTakeBorrow` and `supplyCollateralMakeBorrow` perform collateral-supply plus borrow flows. The shared make-offer plumbing is internal to the entity; public maker flows are exposed through named actions such as `makeLend`, `makeBorrow`, and `supplyCollateralMakeBorrow`. `makeLend` accepts multiple precomputed make-offer inputs, including multi-market make-lend batches whose grouped offers share one loan token.
