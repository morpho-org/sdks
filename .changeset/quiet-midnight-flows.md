---
"@morpho-org/morpho-sdk": minor
"@morpho-org/test": patch
---

Add first-iteration Midnight action flows under `client.morpho.midnight(chainId)`, expose Midnight SDK API helpers through `morpho-sdk/midnight-api` and shared ABI/constant/error/utility entrypoints, and expose pure Midnight transaction builders for the markets-app taker, maker, redeem, repay/withdraw, and cancel flows.

The Midnight entity returns lazy `TransactionPlan` outputs. Call `prepare()` to resolve signature requests and prerequisite call requests, then call `prepared.build(signatures)` to produce the ordered executable calls while accepting fixed-rate API quote takeable offers directly. UI labels, rate display logic, and offer-chain presentation stay on the integrator side.

Midnight market transaction builders are synchronous and consume caller-provided `marketData` state, while `redeem` consumes a single caller-provided `positionData` snapshot that includes its hydrated market. Maker-offer action builders consume caller-provided `offersData` from `getOffersData(...)`, which creates the tree from the same entries accepted by `Tree.create(...)` and runs mempool validation. `getMarketData(...)`, `getPositionData(...)`, and `getOffersData(...)` remain async helpers so integrators can prepare state once, compose UI/validation around it, and then build transactions without hidden reads. Callers can pin several reads to one externally fetched block by forwarding its `blockNumber` through the fetch parameters.

Midnight Bundles token pulls use approval-based execution in this first iteration: `prepare()` includes ERC20 approval calls when needed, and encoded bundle calls pass `PermitKind.None`. ERC2612 token permits, Permit2 SignatureTransfer token pulls, unit-target take helpers, exposed taker `reduceOnly`, referral fee controls, max-continuous-fee controls, and generic collateral withdrawal lists are left to follow-up work.

Allow fork tests to select Anvil's Osaka hardfork so deployed Midnight bytecode using the `CLZ` opcode can be exercised end to end.

Borrow-side flows are explicit: `takeBorrow` and `makeBorrow` borrow without supplying collateral, while `supplyCollateralTakeBorrow` and `supplyCollateralMakeBorrow` perform collateral-supply plus borrow flows. Public maker flows are exposed through async entity methods such as `makeLend`, `makeBorrow`, and `supplyCollateralMakeBorrow`; they accept raw offer or group inputs, prepare and validate `offersData` internally, then return lazy requirement and transaction handles. Maker submit metadata exposes all submitted group ids, and the ratifier helpers enforce that the submitted tree uses one ratifier.

Named take transaction builders validate that their takeable offers match the expected maker side, and named maker entity flows validate that prepared maker trees match the expected maker side. Borrow takes require a positive `maxUnits`, repayment-withdrawal flows reject unknown collateral indexes before exposing requirements, and partial group cancellation rejects amounts outside the onchain offer-cap range. `getOffersData(...)` stays side-agnostic so callers can prepare any valid tree.

Validation runs before requirements are exposed: takeable offers must match the requested flow, redemption cannot exceed position credit, approval amounts and operators are checked before allowance short-circuits, and market inputs must belong to the selected Midnight deployment. Maker preparation also preserves caller-owned offer group arrays.

Bind security-sensitive flow artifacts to their preparation context: Ecrecover submissions use the canonical payload retained for the signed tree instead of trusting payload bytes supplied to `buildTx`, typed-data signing rejects wallets on another chain, and redemption accepts only owner-bound position snapshots for the requested account.
