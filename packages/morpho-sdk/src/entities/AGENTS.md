# `entities/`

`MorphoVaultV1` implements `VaultV1Actions`. `MorphoVaultV2` implements `VaultV2Actions`. `MorphoBlue` implements `BlueActions`. `MorphoMidnight` implements `MidnightActions`. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Responsibilities

- Fetch on-chain state (vault accrual data, market/position data).
- Compute derived values (for example vault `maxSharePrice` bounds and Blue LLTV-buffer health).
- Validate `chainId` matches the client before any on-chain read or transaction construction. Entities do not enforce builder = signer at build time — callers MUST keep `userAddress` aligned with the signing account. Signature requirements enforce the invariant at `sign()` time via `validateUserAddress`.
- Return lazy `{ buildTx, getRequirements }` handles — no side effects at construction.
- **`buildTx` is stateless — it never reads in-memory state written by `getRequirements()` or `sign()`** (see [Architecture](../../AGENTS.md#architecture)). An `ActionOutput` must not close over a mutable cache that `sign()` populates and `buildTx` later reads; everything `buildTx` needs comes from its own arguments, including data carried on the `RequirementSignature` objects it is handed. Data that only signing can compute travels on the signature's `args`, so a requirement signed on one entity instance can be submitted from another. Snapshots a flow derives from (`vaultData`, `positionData`) are handle inputs, never values `getRequirements()` fetched and stashed. Each Vault and Blue flow that consumes a signature keeps a "prepared on one handle finalizes on a fresh handle" test; see [`ADR-2026-09-23-stateless-entity-flows`](../../../../docs/adrs/ADR-2026-09-23-stateless-entity-flows.md) for the acceptance checklist.

## Routing

See [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md) routing summary.

## Midnight input construction

Blue and Vault write methods construct complete checked operation inputs before returning a lazy
handle. Standalone actions have complete-params constructors for their own input shapes and error
ordering, and both paths share internal encoders. The handle retains its constructed input;
`buildTx()` validates fresh signatures, not static fields already checked by the constructor.
Dynamic checks remain at their I/O boundaries.

Midnight operation constructors in `midnight/parse.ts` accept complete raw entity params and own
field labels, validation order, defaults and cross-field constraints. Direct collateral, redemption
and repayment handles consume the complete result and call internal encoders rather than assembling
field witnesses or revalidating through standalone builders. Position, balance and health checks
remain dynamic in the entity. Direct collateral supply keeps zero-owner errors lazy in
`getRequirements()` and `buildTx()`.

Midnight taker handles parse static market, offer, target, referral and funding constraints once.
Feasibility checks retain their dynamic clock, fee, liquidity and position checks, and select from
the owned offers. Filtered subsets go directly to internal encoders without re-entering a public
builder or repeating static validation.

Midnight maker constructors in `midnight/prepare.ts` accept each operation's complete raw params and
return its complete publication and requirement inputs. Tree intent, maker/deployment/ratifier
bindings, publication state reads, state validation, optional mempool validation, payload encoding,
funding relationships and bundle parsing stay in their existing order inside that boundary. Entity
bodies consume the complete result, not independently branded maker stages. Maker and cancellation
handles then call the internal encoder, not the public builder. Direct cancellation retains the
`groups` API, no requirements or deadline, and its optional metadata reference timestamp.

## Shared liquidity

`MorphoBlue.borrow()`, `supplyCollateralBorrow()`, `withdraw()`, and `refinance()` accept optional
Vault V2 BluePublicAllocator reallocations. Consumer-supplied plans and vault allowlists accept any
iterable and are normalized once before lazy or repeated use; ordered outputs remain readonly
arrays. Each Blue entity write passes its complete raw params to an operation-specific constructor
at handle construction and retains its complete readonly result. Standalone Blue actions have their
own complete raw-params constructors where input shapes or error order differ. Both paths share
internal builders that independently validate fresh signatures supplied at build time.

`getVaultV2BlueReallocationData` fetches the inputs accepted by high-level writes.
`VaultV2BlueReallocationData` owns the BluePublicAllocator state model. Public maps are readable
snapshots for inspection; state transitions stay on methods and return cloned instances. Action
encoding stays outside every entity fetch path.
