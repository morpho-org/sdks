# `helpers/`

Pure protocol-specific utilities shared across layers. They return new objects and never mutate inputs. Inherits [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

Per-function contracts (arguments, return shapes, behavior) live as JSDoc on each function — that's the canonical source. This file documents only the layer-level invariants and the shape of the helper categories.

## Categories

- **Encoders** (ABI encoding plus input validation, no I/O) — e.g. `encodeForceDeallocateCall(deallocation, onBehalf)`. ABI-encodes a single `VaultV2.forceDeallocate` calldata entry and throws `NonPositiveAssetAmountError` on a non-positive `amount`. The `data` field carries ABI-encoded `MarketParams` for the Morpho Market V1 adapter, or empty bytes otherwise. Internal sub-helpers (e.g. `encodeDeallocateData`) are not exported.
- **Validators** (pure, throw typed errors) — `validateReallocations(...)`, `validateSlippageTolerance(...)`, `validatePositionHealth(...)`. Each enforces a public-API invariant: see the `error.ts` exports for the full list of error classes a caller may pattern-match on.
- **Math / share-price helpers** — `computeMaxRepaySharePrice`, `computeMinBorrowSharePrice`, etc. Use `MAX_SLIPPAGE_TOLERANCE` and cap at `MAX_ABSOLUTE_SHARE_PRICE`.
- **Shared-liquidity** — `computeReallocations` builds PublicAllocator reallocations for a borrow/withdraw; its `maintainSupplyTargetUtilization` option holds the target market at `supplyTargetUtilization` instead of relaxing it to 100% in the aggressive phase (source markets are still drained to supply that liquidity). Two read-only metrics (standalone helpers, not `MorphoBlue` methods) never throw on insufficiency: `computeAvailableSharedLiquidity` sums the raw reallocatable withdrawals at a given source withdrawal-utilization cap (returns `0n` when none), and `computeAvailableLiquidityToTargetUtilization` takes no borrow amount — for a target below `targetUtilization` (default `DEFAULT_SUPPLY_TARGET_UTILIZATION`) it returns the target's own borrow headroom to that ceiling plus the shared liquidity drained from sources at 100% utilization, and `0n` whenever the target is already at or above the ceiling.
- **Metadata** — `addTransactionMetadata(tx, metadata)` appends hex-encoded analytics bytes to `tx.data`: an optional 4-byte unix timestamp followed by a 4-byte origin (timestamp is omitted when `metadata.timestamp` is falsy). Callers gate on `metadata` being provided; the helper itself is a no-op when `tx.data` is empty.

## Constants

- `MAX_SLIPPAGE_TOLERANCE` = 10% (`WAD / 10`) — global slippage-tolerance ceiling, applied by `validateSlippageTolerance` to vault deposit share prices and to market borrow / repay slippage.
- `DEFAULT_LLTV_BUFFER` = 0.5% (`WAD / 200`) — hardcoded safety margin subtracted from LLTV in `validatePositionHealth` for `supplyCollateralBorrow` and post-withdraw checks.
