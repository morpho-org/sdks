# `entities/`

`MorphoVaultV1` implements `VaultV1Actions`. `MorphoVaultV2` implements `VaultV2Actions`. `MorphoBlue` implements `BlueActions`. `MorphoMidnight` implements `MidnightActions`. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Responsibilities

- Fetch on-chain state (vault accrual data, market/position data).
- Compute derived values (for example vault `maxSharePrice` bounds and Blue LLTV-buffer health).
- Validate `chainId` matches the client before any on-chain read or transaction construction. Entities do not enforce builder = signer at build time — callers MUST keep `userAddress` aligned with the signing account. Signature requirements enforce the invariant at `sign()` time via `validateUserAddress`.
- Return lazy `{ buildTx, getRequirements }` handles — no side effects at construction.

## Routing

See [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md) routing summary.

## Shared liquidity

`MorphoBlue.borrow()`, `supplyCollateralBorrow()`, `withdraw()`, and `refinance()` accept optional
Vault V2 BluePublicAllocator reallocations. Consumer-supplied plans and vault allowlists accept any
iterable and are normalized once before lazy or repeated use; ordered outputs remain readonly
arrays. The entity validates state-independent shape before returning requirements, and the pure
action repeats validation before encoding.

`getVaultV2BlueReallocationData` fetches the inputs accepted by high-level writes.
`VaultV2BlueReallocationData` owns the BluePublicAllocator state model. Public maps are readable
snapshots for inspection; state transitions stay on methods and return cloned instances. Vault V1
shared-liquidity data and planning methods were removed in v6. Action encoding stays outside every
entity fetch path.
