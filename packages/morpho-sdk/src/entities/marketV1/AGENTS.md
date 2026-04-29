# MarketV1 (Morpho Blue) Entity

> Parent: [`src/entities/AGENTS.md`](../AGENTS.md)

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

## Key Constraints

- Validate `chainId` match before any on-chain call.
- Never encode calldata here — that belongs in Actions.
- All operations (`supplyCollateral`, `borrow`, `supplyCollateralBorrow`) are routed through bundler3 via GeneralAdapter1.
