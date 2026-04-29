# Entity Layer

> Full context: [AGENTS.md](../../AGENTS.md)

`MorphoVaultV1` implements `VaultV1Actions`. `MorphoVaultV2` implements `VaultV2Actions`. `MorphoMarketV1` implements `MarketV1Actions`.

## Intent

- Fetches on-chain data (vault accrual data for V1/V2, market/position data for MarketV1).
- Computes derived values (e.g. `maxSharePrice` with slippage, LLTV buffer health check).
- Delegates transaction building to pure action functions.
- Returns `{ buildTx, getRequirements }` — lazy evaluation, no side effects at construction.

## Shared Liquidity (Reallocations)

`MorphoMarketV1.borrow()` and `supplyCollateralBorrow()` accept an optional `reallocations: VaultReallocation[]`. The entity passes it through to the action layer — encoding and validation happen there.

## Key Constraints

- Validate `chainId` match before any on-chain call.
- Never encode calldata here — that belongs in Actions.
- Vault deposits go through the bundler (both V1 and V2). Withdraw/redeem are direct vault calls.
- MarketV1: all operations (`supplyCollateral`, `borrow`, `supplyCollateralBorrow`) are routed through bundler3 via GeneralAdapter1.
