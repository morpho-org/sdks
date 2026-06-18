# TIB-2026-06-16: Shared-liquidity target-utilization metric

| Field      | Value                  |
| ---------- | ---------------------- |
| **Status** | Proposed               |
| **Date**   | 2026-06-16             |
| **Author** | @foulques              |
| **Scope**  | Package: `morpho-sdk`  |

---

## Context

Integrators (frontends, allocators, risk dashboards) repeatedly ask one question about a Morpho Blue market: **"how much can still be borrowed here before it gets unhealthy, counting liquidity the PublicAllocator could pull in from sibling markets?"**

`computeReallocations` already answers a *transactional* variant of this — given a concrete borrow/withdraw `amount`, it builds the `reallocateTo` calls and **throws** when liquidity is insufficient. That shape is wrong for a display metric:

- It needs an `amount` the caller is trying to find in the first place.
- It throws on insufficiency, so callers must wrap it in try/catch just to read a number.
- It returns calldata, not a quantity.

This TIB freezes the design of two read-only metrics that answer the question directly, exposed as methods on the `ReallocationData` entity the caller already holds.

## Goals / Non-Goals

**Goals**

- Add `ReallocationData.getPublicReallocationLiquidity(marketId, options?)`: the total liquidity the PublicAllocator can reallocate **into** a market from sibling markets — a `bigint` that never throws on insufficiency (returns `0n`). It still throws `UnknownReallocationMarketError` when the target market is absent.
- Add `ReallocationData.getAvailableLiquidityToTargetUtilization(marketId, targetUtilization?, options?)`: the liquidity available to bring a market to a target utilization — the max borrow keeping post-borrow utilization at or below the target on the **post-reallocation** supply (`getBorrowToUtilization({ supply + L, borrow }, targetUtilization)`) — also never throws on insufficiency (same absent-market exception).
- Reuse the existing PublicAllocator discovery (`getMarketPublicReallocations`) — no fork of the reallocation algorithm.
- Share the supply-target-utilization resolution with `computeReallocations` instead of duplicating it.

**Non-Goals**

- No calldata. These metrics never produce a transaction; `computeReallocations` remains the builder.
- No mutation of `computeReallocations`' behavior or its public options. (An earlier `maintainSupplyTargetUtilization` opt-in explored for this was dropped — see Considered Alternatives.)
- No modeling of the borrowed amount as new supply. Borrowing raises `totalBorrowAssets` but not `totalSupplyAssets`, so the metric measures borrow `x` against the post-reallocation supply `S + L` (`(B + x) / (S + L) ≤ targetUtilization`) — see Assumptions.

## Proposed Solution

### Placement: methods on `ReallocationData`, not standalone helpers

Both metrics only read from a `ReallocationData` instance (`getMarket`, `getMarketPublicReallocations`) and return a derived `bigint`. They live as **methods on the entity** the caller already obtains from `MorphoBlue.getReallocationData(...)`, next to the `getMarketPublicReallocations` they wrap. They stay pure (no I/O, no mutation), consistent with the entity layer's "compute derived values" role. They are intentionally **not** `MorphoBlue` methods (no chainId/fetch coupling) and **not** free helpers (they belong with the state they read).

### `getPublicReallocationLiquidity`

Sums the source-market withdrawals discovered by `getMarketPublicReallocations` — i.e. the liquidity the PublicAllocator can move into `marketId` from sibling markets. Bounded by each source's withdrawal-utilization cap (`defaultMaxWithdrawalUtilization`, default friendly 92%) and the target market's vault supply-cap headroom. The caller widens the source ceiling by passing `defaultMaxWithdrawalUtilization` (e.g. `MathLib.WAD` for the full drain). Never throws on insufficiency (`0n` when nothing is reallocatable); throws `UnknownReallocationMarketError` only when the target market is absent.

### `getAvailableLiquidityToTargetUtilization`

The liquidity available to bring `marketId` to `targetUtilization` (default `DEFAULT_SUPPLY_TARGET_UTILIZATION`, 90.5%): the max borrow that keeps post-borrow utilization at or below the target on the **post-reallocation** supply. It applies **one trigger gate**, then the borrow-to-utilization formula on `supply + L`:

```
supplyTargetUtilization = getSupplyTargetUtilization(marketId, options)   // per-market → default → 90.5%
L                       = getPublicReallocationLiquidity(marketId, options)

1. supplyTargetUtilization > targetUtilization
     → return market.getBorrowToUtilization(targetUtilization)            // reallocation would not trigger
2. otherwise
     → return getBorrowToUtilization({ supply + L, borrow }, targetUtilization)
       = zeroFloorSub(wMulDown(supply + L, targetUtilization), borrow)
```

Two facts about the metric's meaning:

1. **Below the reallocation trigger, only own liquidity counts.** The PublicAllocator only reallocates once a market crosses its `supplyTargetUtilization`. If the caller asks for a target *below* that trigger, no reallocation would happen, so the answer is the market's own borrow headroom alone.
2. **Otherwise, borrow-to-target on the post-reallocation supply.** Reallocated supply `L` is added to the market's supply, so the borrowable amount is `getBorrowToUtilization({ supply + L, borrow }, targetUtilization)`. Below the target this equals own headroom + `targetUtilization · L` — `L` only contributes its scaled share, since it also raises the denominator. At or above the target, `zeroFloorSub` clamps to `0n` when `L` is too small to bring utilization back under the target; borrowing more would only push it further over. (The earlier `targetUtilization === market.utilization` special case is subsumed: there `ownHeadroom` is `0` and the formula returns `targetUtilization · L`.)

> Unlike the transactional `computeReallocations` fallback, this metric never relaxes the target market toward 100% and never force-drains source markets: it honours whatever source withdrawal cap the caller configures (friendly by default).

### Shared resolution helper

`computeReallocations` and `getAvailableLiquidityToTargetUtilization` both need the effective supply-target utilization for a market (per-market override → default override → `DEFAULT_SUPPLY_TARGET_UTILIZATION`). That resolution is factored into one helper, `getSupplyTargetUtilization(marketId, options)`, instead of being duplicated.

### Implementation

```ts
// ReallocationData.getAvailableLiquidityToTargetUtilization
const market = this.getMarket(marketId).accrueInterest(options?.timestamp);

const supplyTargetUtilization = getSupplyTargetUtilization(marketId, options);
if (supplyTargetUtilization > targetUtilization)
  return market.getBorrowToUtilization(targetUtilization);                // rule 1

// Borrow-to-target on the post-reallocation supply. zeroFloorSub clamps to 0n
// when the market is already above target and L can't bring it back under.
const availableLiquidity = this.getPublicReallocationLiquidity(marketId, options);
return MarketUtils.getBorrowToUtilization(                                // rule 2
  {
    totalSupplyAssets: market.totalSupplyAssets + availableLiquidity,
    totalBorrowAssets: market.totalBorrowAssets,
  },
  targetUtilization,
);
```

## Considered Alternatives

### Alternative 1: Add an opt-in flag to `computeReallocations`

The first iteration threaded a `maintainSupplyTargetUtilization` boolean through `ReallocationComputeOptions` and `computeReallocations` (holding the target market at its supply target instead of relaxing it to 100% in the aggressive phase).

**Why rejected:** The metric takes no borrow amount and never builds calldata, so it shares almost nothing with `computeReallocations`'s control flow. Bolting it on widened the builder's option surface and its phase-2 branch for a read-only concern. A read-only metric on `ReallocationData` is smaller, purer, and easier to test. The flag was fully reverted.

### Alternative 2: Standalone helpers in the `helpers/` layer

The metrics were first shipped as free `compute*` helpers (`computeAvailableSharedLiquidity`, `computeAvailableLiquidityToTargetUtilization`) re-exported from the package root.

**Why rejected (review feedback):** they only operate on a `ReallocationData` instance and wrap its `getMarketPublicReallocations`, so they read more naturally as methods on that class (next to the data they consume) than as helpers that take the entity as an argument. Moving them also keeps the public helper surface minimal.

### Alternative 3: Force-drain sources to 100% utilization

Always pass `defaultMaxWithdrawalUtilization = WAD` so the metric reports the absolute upper bound of reallocatable liquidity.

**Why rejected:** it over-reports for the common dashboard case and hard-codes a policy the caller may not want. Honouring the configured/default withdrawal cap (friendly 92%) and letting the caller opt into the aggressive `WAD` bound is more flexible and matches `getMarketPublicReallocations`' own default.

### Alternative 4: Return the naive additive sum `ownHeadroom + L`

Add the full reallocatable liquidity `L` to the own headroom without scaling.

**Why rejected:** it overstates the borrowable amount by `(1 − targetUtilization) · L`. Borrowing `x` raises `totalBorrowAssets` but not `totalSupplyAssets`, so post-borrow utilization is `(B + x) / (S + L)`; solving `≤ targetUtilization` gives `x ≤ ownHeadroom + targetUtilization · L`, not `ownHeadroom + L`. The un-scaled sum would let utilization exceed the target and, above the target, report a positive number where the exact max borrow is `0`. Scaling by `targetUtilization` is the chosen design.

## Assumptions & Constraints

- **Exact for Morpho borrow semantics.** The return is `getBorrowToUtilization({ supply + L, borrow }, targetUtilization)` = `zeroFloorSub(wMulDown(supply + L, targetUtilization), borrow)`, the max borrow `x` keeping post-borrow utilization `(borrow + x) / (supply + L)` at or below the target. Borrowing raises `totalBorrowAssets` only, not `totalSupplyAssets`, so `x` is not in the denominator; an above-target market clamps to `0n` when reallocation cannot bring it back under. Below the target this equals own headroom + `targetUtilization · L` (to within 1 wei of fixed-point flooring).
- **Pass `options.timestamp` from the fetch block.** Accrual otherwise falls back to the target market's `lastUpdate`, which can diverge from the source rows' fetch block — same constraint as `computeReallocations`.
- Pure entity methods, no I/O, no mutation. Additive public surface (two new `ReallocationData` methods + one internal helper). Semver: **minor**.
- `viem` stays the only peer dep. No new runtime dependencies.

## References

- `packages/morpho-sdk/src/entities/reallocationData.ts` — `getPublicReallocationLiquidity`, `getAvailableLiquidityToTargetUtilization`, and the `getMarketPublicReallocations` discovery they reuse.
- `packages/morpho-sdk/src/helpers/utilization.ts` — `getSupplyTargetUtilization`, shared with `computeReallocations`.
- `packages/morpho-sdk/src/helpers/computeReallocations.ts` — the transactional counterpart (builds calldata, throws on insufficiency).
- `DEFAULT_SUPPLY_TARGET_UTILIZATION` (90.5%) / `DEFAULT_WITHDRAWAL_TARGET_UTILIZATION` (92%) in `src/helpers/constant.ts`.
- Root [`AGENTS.md`](../../AGENTS.md) §1 (entity layer / purity), §3 (types), §5 (testing), §6 (JSDoc).
