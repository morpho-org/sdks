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

`getVaultV1ReallocationData` remains available for explicit low-level Bundler3 composition, but it
and all Vault V1 shared-liquidity inputs, data, and planning methods are deprecated and will be
removed in the next major. `getVaultV2BlueReallocationData` fetches the inputs accepted by
high-level writes; deprecated `getReallocationData` delegates to the V1 fetcher. PublicAllocator V1
plans are not accepted by v6 high-level Blue writes. Action encoding stays outside every entity
fetch path.

`VaultV1ReallocationData` and its compatibility alias `ReallocationData` are deprecated with the
rest of the PublicAllocator V1 algorithm. `VaultV2BlueReallocationData` owns the successor
BluePublicAllocator state model. Public maps are readable snapshots for inspection; state
transitions stay on methods and return cloned instances of the same versioned class.
