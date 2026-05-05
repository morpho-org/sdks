# `entities/`

`MorphoVaultV1` implements `VaultV1Actions`. `MorphoVaultV2` implements `VaultV2Actions`. `MorphoMarketV1` implements `MarketV1Actions`. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Responsibilities

- Build a viem `Client` at construction via `client.getViemClient(chainId)` (throws `UnsupportedChainError` if no transport is configured).
- Fetch on-chain state through that client (vault accrual data, market/position data).
- Compute derived values (e.g. `maxSharePrice` with slippage, LLTV buffer health).
- Return lazy `{ buildTx, getRequirements }` handles — no side effects at construction beyond the client build.

No per-method `validateChainId` — chain id is fixed at entity construction time. No `userAddress` check at the entity layer — address verification belongs to `Requirement.sign(...)` (see [`src/actions/AGENTS.md`](../actions/AGENTS.md)).

## Routing

See [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md) routing summary.

## Shared liquidity

`MorphoMarketV1.borrow()` and `supplyCollateralBorrow()` accept optional `reallocations: VaultReallocation[]`. The entity passes them through to the action layer; encoding and validation happen there. `getReallocationData` may fetch the inputs needed to compute reallocations, but action encoding stays outside the entity fetch path.
