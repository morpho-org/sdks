# `entities/`

`MorphoVaultV1` implements `VaultV1Actions`. `MorphoVaultV2` implements `VaultV2Actions`. `MorphoBlue` implements `BlueActions`. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Responsibilities

- Fetch on-chain state (vault accrual data, market/position data).
- Compute derived values (e.g. `maxSharePrice` with slippage, LLTV buffer health).
- Validate `chainId` matches the client before any on-chain read or transaction construction. Entities do not enforce builder = signer at build time — callers MUST keep `userAddress` aligned with the signing account. The invariant is enforced at `sign()` time on the signature requirements (`encodeErc20Permit` / `encodeErc20Permit2`) via `validateUserAddress`.
- Return lazy `{ buildTx, getRequirements }` handles — no side effects at construction.

## Routing

See [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md) routing summary.

## Shared liquidity

`MorphoBlue.borrow()` and `supplyCollateralBorrow()` accept optional `reallocations: VaultReallocation[]`. The entity passes them through to the action layer; encoding and validation happen there. `getReallocationData` may fetch the inputs needed to compute reallocations, but action encoding stays outside the entity fetch path.

`ReallocationData` is the entity-level state container for public allocator simulations. Its public maps are readable snapshots for inspection; state transitions stay on its methods and return cloned `ReallocationData` instances.
