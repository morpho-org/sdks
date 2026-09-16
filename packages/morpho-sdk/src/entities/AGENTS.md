# `entities/`

`MorphoVaultV1` implements `VaultV1Actions`. `MorphoVaultV2` implements `VaultV2Actions`. `MorphoBlue` implements `BlueActions`. `MorphoMidnight` implements `MidnightActions`. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Responsibilities

- Fetch on-chain state (vault accrual data, market/position data).
- Compute derived values (e.g. `maxSharePrice` with slippage, LLTV buffer health).
- Validate `chainId` matches the client before any on-chain read or transaction construction. Entities do not enforce builder = signer at build time — callers MUST keep `userAddress` aligned with the signing account. The invariant is enforced at `sign()` time on the signature requirements (`encodeErc20Permit` / `encodeErc20Permit2Approve`) via `validateUserAddress`.
- Return lazy `{ buildTx, getRequirements }` handles — no side effects at construction.
- **`buildTx` is stateless — it never reads in-memory state written by `getRequirements()` or `sign()`** (see root §1 "Stateless, immutable, composable"). An `ActionOutput` must not close over a mutable cache that `sign()` populates and `buildTx` later reads; everything `buildTx` needs comes from its own arguments, including data carried on the `RequirementSignature` objects it is handed. A payload that only signing can compute (e.g. Midnight's encoded offer-root payload) travels on the signature's `args`, so a requirement signed on one entity instance can be submitted from another (`MorphoMidnight.buildSubmitOffersTx` reads `signature.args.payload`, not a side Map).

## Routing

See [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md) routing summary.

## Shared liquidity

`MorphoBlue.borrow()`, `supplyCollateralBorrow()`, `withdraw()`, and `refinance()` accept optional homogeneous V1-or-V2 reallocation plans; mixing versions is rejected. All Vault V1 shared-liquidity inputs, data, and planning methods are deprecated and will be removed in the next major; new integrations use Vault V2. Consumer-supplied reallocation plans and vault allowlists accept any iterable and are normalized once before lazy or repeated use; ordered outputs remain readonly arrays. The entity validates their state-independent shape before returning requirements, and the pure action repeats the same validation before encoding. Action encoding stays outside every entity fetch path.

`VaultV1ReallocationData` and its compatibility alias `ReallocationData` are deprecated with the
rest of the PublicAllocator V1 algorithm. `VaultV2BlueReallocationData` owns the successor
BluePublicAllocator state model. Public maps are readable snapshots for inspection; state
transitions stay on methods and return cloned instances of the same versioned class.
