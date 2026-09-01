# `helpers/`

Pure protocol-specific utilities shared across layers. They return new objects and never mutate inputs. Inherits [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

Per-function contracts (arguments, return shapes, behavior) live as JSDoc on each function — that's the canonical source. This file documents only the layer-level invariants and the shape of the helper categories.

## Categories

- **Encoders** (ABI encoding plus input validation, no I/O) — e.g. `encodeForceDeallocateCall(deallocation, onBehalf)`. ABI-encodes a single `VaultV2.forceDeallocate` calldata entry and throws `NonPositiveInputError` on a non-positive `amount`. The `data` field carries ABI-encoded `MarketParams` for the Morpho Market V1 adapter, or empty bytes otherwise. Internal sub-helpers (e.g. `encodeDeallocateData`) are not exported.
- **Validators** (pure, throw typed errors) — `validateReallocations(...)`, `validateSlippageTolerance(...)`, `validatePositionHealth(...)`. Each enforces a public-API invariant: see the `error.ts` exports for the full list of error classes a caller may pattern-match on.
- **Math / share-price helpers** — helpers for vault share-price bounds and public low-level
  composition use `MAX_SLIPPAGE_TOLERANCE` and cap at `MAX_ABSOLUTE_SHARE_PRICE`. The
  high-level Blue write methods do not use these helpers or accept slippage inputs.
- **Shared-liquidity** — `computeVaultV1Reallocations` builds PublicAllocator V1 reallocations for
  low-level composition. It, its compatibility alias `computeReallocations`, the PublicAllocator V1
  validator, and the other Vault V1 planning and low-level composition helpers are deprecated and
  will be removed in the next major. Vault V2 planning and state transitions live on
  `VaultV2BlueReallocationData`, whose outputs are the only reallocation inputs accepted by
  high-level Blue writes. `getSupplyTargetUtilization(marketId, options)` resolves the per-market →
  default → `DEFAULT_SUPPLY_TARGET_UTILIZATION` supply target for V1. Read-only liquidity metrics
  live on the corresponding versioned reallocation-data entity, not in this layer.
- **Metadata** — `addTransactionMetadata(tx, metadata)` appends hex-encoded analytics bytes to `tx.data`: an optional 4-byte unix timestamp followed by a 4-byte origin (timestamp is omitted when `metadata.timestamp` is falsy). Callers gate on `metadata` being provided; the helper itself is a no-op when `tx.data` is empty.

## Constants

- `MAX_SLIPPAGE_TOLERANCE` = 10% (`WAD / 10`) — slippage-tolerance ceiling for surfaces that still
  expose share-price protection, notably vault deposits. It does not apply to high-level Blue
  writes.
- `DEFAULT_LLTV_BUFFER` = 0.5% (`WAD / 200`) — hardcoded safety margin subtracted from LLTV for
  borrow, collateral-withdraw, and migration legs of the combined Blue write methods.
