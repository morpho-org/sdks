# MarketV1 (Morpho Blue) Entity

> Parent: [`src/entities/CLAUDE.md`](../CLAUDE.md)

`MorphoMarketV1` implements `MarketV1Actions`. Client -> Actions for Morpho Blue markets.

## Constructor

`MorphoMarketV1(client, marketParams: MarketParams, chainId)`.

## Methods

### `getMarketData` / `getPositionData`

Fetch on-chain state via `fetchMarket` / `fetchAccrualPosition`.
`AccrualPosition` provides health metrics: `maxBorrowAssets`, `ltv`, `isHealthy`, `borrowAssets`, `collateral`.

### `supplyCollateral`

Always routed through bundler3 via GeneralAdapter1. Requirements = approve GeneralAdapter1 (uses `getRequirements` orchestrator).
When `nativeAmount` is provided, native token is wrapped via `nativeTransfer` + `wrapNative`.

### `borrow`

Routed through bundler3 via `morphoBorrow`. Requires GeneralAdapter1 authorization on Morpho (`setAuthorization`).
Uses `minSharePrice` (computed from market borrow state + slippage tolerance) for slippage protection.

### `supplyCollateralBorrow`

Always bundler. Validates:

1. Input amounts (positive, non-zero collateral).
2. LLTV buffer: `totalBorrowAfter <= maxSafeBorrow` where `maxSafeBorrow = collateralValue * (LLTV - buffer)`.
   - `ORACLE_PRICE_SCALE = 1e36`. Buffer default = 0.5%, max = 10%.
   - Throws `BorrowExceedsSafeLtvError` with the max safe additional borrow amount.
   - Throws `MissingMarketPriceError` if oracle price unavailable.
3. Native wrapping: collateral token must be wNative.

`getRequirements` returns:

- ERC20 approval for GeneralAdapter1 (collateral token).
- `morpho.setAuthorization(generalAdapter1, true)` tx if not yet authorized (reads via `publicActions`).

### `repay`

Routed through bundler3 via GeneralAdapter1. Two modes via `RepayAmountArgs`:
- **By assets** (`{ assets }`): partial repay by exact asset amount.
- **By shares** (`{ shares }`): full repay by exact share count (immune to interest accrual between tx construction and execution).

Validates: assets/shares > 0, slippage tolerance, `validateRepayAmount`/`validateRepayShares`.
Computes `maxSharePrice` via `computeMaxRepaySharePrice` (upper-bound slippage protection).
In shares mode, `transferAmount = market.toBorrowAssets(shares, "Up")` (upper-bound for ERC20 pull).

`getRequirements` returns loan token approval for GeneralAdapter1.
Does NOT require Morpho authorization (guard-rail: repay doesn't need it).

### `withdrawCollateral`

Direct call to `morpho.withdrawCollateral()`. No bundler needed — collateral flows out of Morpho directly to the user. The caller (`msg.sender`) must be `onBehalf`.
Validates position health after withdrawal via `validatePositionHealthAfterWithdraw` (LLTV buffer).

No `getRequirements` — no ERC20 approval or GeneralAdapter1 authorization needed.

### `repayWithdrawCollateral`

Atomic repay + withdraw. Validates combined health: simulates repay via `accrualPosition.repay(assets, shares)`, then checks withdrawal safety on the resulting position.

`getRequirements` returns both loan token approval and Morpho authorization.

**Builder = signer is mandatory here.** The bundle mixes explicit `onBehalf = userAddress` (`morphoRepay`) with the implicit initiator used by `erc20TransferFrom` and `morphoWithdrawCollateral` (the latter exposes no `onBehalf` parameter on GA1). If the address that built the tx differed from the address that signs it, the signer's tokens would repay someone else's debt and their collateral would be withdrawn to a builder-chosen receiver. `validateUserAddress` enforces this on every `MorphoMarketV1` method.

## Key Constraints

- Validate `chainId` match before any on-chain call.
- Never encode calldata here — that belongs in Actions.
- Most operations (`supplyCollateral`, `borrow`, `supplyCollateralBorrow`, `repay`, `repayWithdrawCollateral`) are routed through bundler3 via GeneralAdapter1. Exception: `withdrawCollateral` is a direct Morpho call.
