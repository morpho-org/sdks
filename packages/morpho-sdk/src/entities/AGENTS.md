# `entities/`

`MorphoVaultV1` implements `VaultV1Actions`. `MorphoVaultV2` implements `VaultV2Actions`. `MorphoBlue` implements `BlueActions`. `MorphoMidnight` implements `MidnightActions`. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Responsibilities

- Fetch on-chain state (vault accrual data, market/position data).
- Compute derived values (for example vault `maxSharePrice` bounds and Blue LLTV-buffer health).
- Validate `chainId` matches the client before any on-chain read or transaction construction. Entities do not enforce builder = signer at build time — callers MUST keep `userAddress` aligned with the signing account. Signature requirements enforce the invariant at `sign()` time via `validateUserAddress`.
- Return lazy `{ buildTx, getRequirements }` handles — no side effects at construction.
- **`buildTx` is stateless — it never reads in-memory state written by `getRequirements()` or `sign()`** (see root §1 "Stateless, immutable, composable"). An `ActionOutput` must not close over a mutable cache that `sign()` populates and `buildTx` later reads; everything `buildTx` needs comes from its own arguments, including data carried on the `RequirementSignature` objects it is handed. A payload that only signing can compute (e.g. Midnight's encoded offer-root payload) travels on the signature's `args`, so a requirement signed on one entity instance can be submitted from another (`MorphoMidnight.buildSubmitOffersTx` reads `signature.args.payload`, not a side Map). Snapshots a flow derives from (`vaultData`, `positionData`) are handle inputs, never values `getRequirements()` fetched and stashed. Each Vault, Blue, and Midnight flow that consumes a signature keeps a "prepared on one handle finalizes on a fresh handle" test; see [`ADR-2026-09-23-stateless-entity-flows`](../../../../docs/adrs/ADR-2026-09-23-stateless-entity-flows.md) for the acceptance checklist.

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
snapshots for inspection; state transitions stay on methods and return cloned instances. Action
encoding stays outside every entity fetch path.
