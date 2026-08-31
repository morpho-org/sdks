# `entities/`

`MorphoVaultV1` implements `VaultV1Actions`. `MorphoVaultV2` implements `VaultV2Actions`. `MorphoBlue` implements `BlueActions`. `MorphoMidnight` implements `MidnightActions`. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Responsibilities

- Fetch on-chain state (vault accrual data, market/position data).
- Compute derived values (e.g. `maxSharePrice` with slippage, LLTV buffer health).
- Validate `chainId` matches the client before any on-chain read or transaction construction. Entities do not enforce builder = signer at build time — callers MUST keep `userAddress` aligned with the signing account. The invariant is enforced at `sign()` time on the signature requirements (`encodeErc20Permit` / `encodeErc20Permit2Approve`) via `validateUserAddress`.
- Return lazy `{ buildTx, getRequirements }` handles — no side effects at construction.

## Routing

See [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md) routing summary.

## Shared liquidity

`MorphoBlue.borrow()`, `supplyCollateralBorrow()`, `withdraw()`, and `refinance()` accept optional Vault V2 reallocation plans. Consumer-supplied reallocation plans and vault allowlists accept any iterable and are normalized once before lazy or repeated use; ordered outputs remain readonly arrays. The entity validates their state-independent shape before returning requirements, and the pure action repeats the same validation before encoding. `getVaultV1ReallocationData` remains available for explicit low-level Bundler3 composition, but all Vault V1 shared-liquidity inputs, data, and planning methods are deprecated and will be removed in the next major. `getVaultV2BlueReallocationData` fetches the inputs accepted by high-level writes. Deprecated `getReallocationData` delegates to the V1 fetcher. Action encoding stays outside every entity fetch path.

`VaultV1ReallocationData` and its compatibility alias `ReallocationData` are deprecated with the
rest of the PublicAllocator V1 algorithm. `VaultV2BlueReallocationData` owns the successor
BluePublicAllocator state model. Public maps are readable snapshots for inspection; state
transitions stay on methods and return cloned instances of the same versioned class.
