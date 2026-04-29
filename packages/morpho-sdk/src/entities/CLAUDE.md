# Entity Layer

> Full context: [CLAUDE.md](../../CLAUDE.md)

`MorphoVaultV1` implements `VaultV1Actions`. `MorphoVaultV2` implements `VaultV2Actions`. `MorphoMarketV1` implements `MarketV1Actions`.

## Intent

- Fetches on-chain data (vault accrual data for V1/V2, market/position data for MarketV1).
- Computes derived values (e.g. `maxSharePrice` with slippage, LLTV buffer health check).
- Delegates transaction building to pure action functions.
- Returns `{ buildTx, getRequirements }` — lazy evaluation, no side effects at construction.

## Shared Liquidity (Reallocations)

`MorphoMarketV1.borrow()` and `MorphoMarketV1.supplyCollateralBorrow()` accept an optional `reallocations: VaultReallocation[]` parameter. The entity passes it through to the action layer without modification — reallocation encoding and validation happen in the action functions. The entity is responsible for computing `minSharePrice` from slippage tolerance and providing the `accrualPosition` for LLTV health checks.

## Key Constraints

- Validate `chainId` match before any on-chain call.
- Never encode calldata here — that belongs in Actions.
- Vault deposits go through the bundler (both V1 and V2). Withdraw/redeem are direct vault calls. ForceWithdraw/ForceRedeem (V2 only) go through VaultV2's native multicall.
- MarketV1: most operations (`supplyCollateral`, `borrow`, `supplyCollateralBorrow`, `repay`, `repayWithdrawCollateral`) are routed through bundler3 via GeneralAdapter1. Exception: `withdrawCollateral` is a direct Morpho call (no bundler, no GA1 authorization).
