---
"@morpho-org/morpho-sdk": minor
---

Add Midnight action flows under `client.morpho.midnight(chainId)`, expose Midnight SDK API helpers through `morpho-sdk/midnight-api` and shared ABI/constant/error/utility entrypoints, and expose pure Midnight transaction builders for fixed-rate taker, maker, redeem, repay/withdraw, and cancel flows.

The Midnight entity returns lazy action outputs with `getRequirements()` and synchronous `buildTx(...)` methods, matching the existing `morpho-sdk` action pattern while accepting fixed-rate API quote takeable offers directly. UI labels, rate display logic, and offer-chain presentation stay on the integrator side.

Midnight market transaction builders are synchronous and consume caller-provided `marketData` state, with `redeem` also consuming caller-provided `positionData`. Maker-offer action builders consume caller-provided `offersData` from `getOffersData(...)`, which creates the tree from the same entries accepted by `Tree.create(...)` and runs mempool validation. `getMarketData(...)`, block-accrued `getPositionData(...)`, and `getOffersData(...)` remain async helpers so integrators can prepare state once, compose UI/validation around it, and then build transactions without hidden reads.

Midnight Bundles calls support ERC2612 and Permit2 token permits through the same `supportSignature` / `useSimplePermit` requirement flow as Blue, while preserving `PermitKind.None` for approval-based execution.

Borrow-side flows are explicit: `takeBorrow` and `makeBorrow` borrow without supplying collateral, while `supplyCollateralTakeBorrow` and `supplyCollateralMakeBorrow` perform collateral-supply plus borrow flows. Public maker flows are exposed through named synchronous actions such as `makeLend`, `makeBorrow`, and `supplyCollateralMakeBorrow`; they accept precomputed `offersData` prepared from one or more standalone offers or groups. Maker submit metadata exposes all submitted group ids, and the ratifier helpers enforce that the submitted tree uses one ratifier.

Named take transaction builders validate that their takeable offers match the expected maker side, and named maker entity flows validate that prepared maker trees match the expected maker side. `getOffersData(...)` stays side-agnostic so callers can prepare any valid tree.
