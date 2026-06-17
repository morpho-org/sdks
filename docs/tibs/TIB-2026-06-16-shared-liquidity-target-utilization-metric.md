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

- Add `ReallocationData.getPublicReallocationLiquidity(marketId, options?)`: the total liquidity the PublicAllocator can reallocate **into** a market from sibling markets — a never-throws `bigint`.
- Add `ReallocationData.getAvailableLiquidityToTargetUtilization(marketId, utilization?, options?)`: the liquidity available to bring a market to a target utilization — the market's own borrow headroom **plus** that reallocatable liquidity — also never-throws.
- Reuse the existing PublicAllocator discovery (`getMarketPublicReallocations`) — no fork of the reallocation algorithm.
- Share the supply-target-utilization resolution with `computeReallocations` instead of duplicating it.

**Non-Goals**

- No calldata. These metrics never produce a transaction; `computeReallocations` remains the builder.
- No mutation of `computeReallocations`' behavior or its public options. (An earlier `maintainSupplyTargetUtilization` opt-in explored for this was dropped — see Considered Alternatives.)
- No second-order precision. We return the literal `ownHeadroom + reallocationLiquidity` sum, not the fixed-point-exact max borrow (see Assumptions).

## Proposed Solution

### Placement: methods on `ReallocationData`, not standalone helpers

Both metrics only read from a `ReallocationData` instance (`getMarket`, `getMarketPublicReallocations`) and return a derived `bigint`. They live as **methods on the entity** the caller already obtains from `MorphoBlue.getReallocationData(...)`, next to the `getMarketPublicReallocations` they wrap. They stay pure (no I/O, no mutation), consistent with the entity layer's "compute derived values" role. They are intentionally **not** `MorphoBlue` methods (no chainId/fetch coupling) and **not** free helpers (they belong with the state they read).

### `getPublicReallocationLiquidity`

Sums the source-market withdrawals discovered by `getMarketPublicReallocations` — i.e. the liquidity the PublicAllocator can move into `marketId` from sibling markets. Bounded by each source's withdrawal-utilization cap (`defaultMaxWithdrawalUtilization`, default friendly 92%) and the target market's vault supply-cap headroom. The caller widens the source ceiling by passing `defaultMaxWithdrawalUtilization` (e.g. `MathLib.WAD` for the full drain). Never throws; `0n` when nothing is reallocatable.

### `getAvailableLiquidityToTargetUtilization`

The liquidity available to bring `marketId` to `utilization` (default `DEFAULT_SUPPLY_TARGET_UTILIZATION`, 90.5%), combining the market's own borrow headroom with the reallocatable liquidity. It applies **three rules**:

```
ownHeadroom            = market.getBorrowToUtilization(utilization)
supplyTargetUtilization = getSupplyTargetUtilization(marketId, options)   // per-market → default → 90.5%

1. supplyTargetUtilization > utilization   → return ownHeadroom            // reallocation would not trigger
2. utilization === market.utilization      → return reallocationLiquidity  // no own headroom left
3. otherwise                               → return ownHeadroom + reallocationLiquidity
```

where `reallocationLiquidity = getPublicReallocationLiquidity(marketId, options)`.

The rules encode three facts about the metric's meaning:

1. **Below the reallocation trigger, only own liquidity counts.** The PublicAllocator only reallocates once a market crosses its `supplyTargetUtilization`. If the caller asks for a target *below* that trigger, no reallocation would happen, so the answer is the market's own borrow headroom alone.
2. **At the current utilization, only reallocatable liquidity counts.** When `utilization` equals the market's current utilization, `ownHeadroom` is `0` — there is no room to borrow from the market's own supply without exceeding the target — so only the reallocatable liquidity backs further borrow at that level.
3. **Otherwise, sum both.** Own headroom to the target plus the liquidity the PublicAllocator can pull in.

> Unlike the transactional `computeReallocations` fallback, this metric never relaxes the target market toward 100% and never force-drains source markets: it honours whatever source withdrawal cap the caller configures (friendly by default).

### Shared resolution helper

`computeReallocations` and `getAvailableLiquidityToTargetUtilization` both need the effective supply-target utilization for a market (per-market override → default override → `DEFAULT_SUPPLY_TARGET_UTILIZATION`). That resolution is factored into one helper, `getSupplyTargetUtilization(marketId, options)`, instead of being duplicated.

### Implementation

```ts
// ReallocationData.getAvailableLiquidityToTargetUtilization
const market = this.getMarket(marketId).accrueInterest(options?.timestamp);

const ownHeadroom = market.getBorrowToUtilization(utilization);

const supplyTargetUtilization = getSupplyTargetUtilization(marketId, options);
if (supplyTargetUtilization > utilization) return ownHeadroom;            // rule 1

const reallocationLiquidity = this.getPublicReallocationLiquidity(marketId, options);
if (utilization === market.utilization) return reallocationLiquidity;     // rule 2

return ownHeadroom + reallocationLiquidity;                               // rule 3
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

### Alternative 4: Return the fixed-point-exact max borrow

The borrow `x` that solves `(B + x) / (S + L + x) = target` is slightly larger than `ownHeadroom + L`, because reallocated supply `L` also sits in the denominator.

**Why rejected:** Negligible difference at realistic utilizations, and the literal `ownHeadroom + L` sum is the quantity integrators reason about ("my headroom, plus the liquidity that can be pulled in"). Documented as a known approximation rather than chasing WAD-exactness for a display number.

## Assumptions & Constraints

- **Approximation, not WAD-exact.** The return is `ownHeadroom + reallocationLiquidity`. The physically-exact max borrow is marginally higher (reallocated liquidity also raises the supply denominator). This is intentional and documented in JSDoc.
- **Pass `options.timestamp` from the fetch block.** Accrual otherwise falls back to the target market's `lastUpdate`, which can diverge from the source rows' fetch block — same constraint as `computeReallocations`.
- Pure entity methods, no I/O, no mutation. Additive public surface (two new `ReallocationData` methods + one internal helper). Semver: **minor**.
- `viem` stays the only peer dep. No new runtime dependencies.

## References

- `packages/morpho-sdk/src/entities/reallocationData.ts` — `getPublicReallocationLiquidity`, `getAvailableLiquidityToTargetUtilization`, and the `getMarketPublicReallocations` discovery they reuse.
- `packages/morpho-sdk/src/helpers/utilization.ts` — `getSupplyTargetUtilization`, shared with `computeReallocations`.
- `packages/morpho-sdk/src/helpers/computeReallocations.ts` — the transactional counterpart (builds calldata, throws on insufficiency).
- `DEFAULT_SUPPLY_TARGET_UTILIZATION` (90.5%) / `DEFAULT_WITHDRAWAL_TARGET_UTILIZATION` (92%) in `src/helpers/constant.ts`.
- Root [`AGENTS.md`](../../AGENTS.md) §1 (entity layer / purity), §3 (types), §5 (testing), §6 (JSDoc).
