# `entities/`

`MorphoVaultV1` implements `VaultV1Actions`. `MorphoVaultV2` implements `VaultV2Actions`. `MorphoMarketV1` implements `MarketV1Actions`. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Responsibilities

- Fetch on-chain state via the public client (vault accrual data, market/position data).
- Compute derived values (e.g. `maxSharePrice` with slippage, LLTV buffer health).
- Validate `chainId` against `client.viemClient.chain.id` before any read or build (`validateChainId`). No `userAddress` check here — the public client has no account; address verification belongs to `Requirement.sign(...)` (see [`src/actions/AGENTS.md`](../actions/AGENTS.md)).
- Return lazy `{ buildTx, getRequirements }` handles — no side effects at construction.

## Routing

See [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md) routing summary.

## Shared liquidity

`MorphoMarketV1.borrow()` and `supplyCollateralBorrow()` accept optional `reallocations: VaultReallocation[]`. The entity passes them through to the action layer; encoding and validation happen there. `getReallocationData` may fetch the inputs needed to compute reallocations, but action encoding stays outside the entity fetch path.
