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

This TIB freezes the design of a read-only metric that answers the question directly.

## Goals / Non-Goals

**Goals**

- Add `computeAvailableLiquidityToTargetUtilization`: a borrow-free, never-throws read-only metric returning a single `bigint` of borrowable assets.
- Reuse the existing PublicAllocator discovery (`getMarketPublicReallocations`) — no fork of the reallocation algorithm.
- Keep it a standalone helper (not a `MorphoBlue` method), pure, in the helpers layer.

**Non-Goals**

- No calldata. This metric never produces a transaction; `computeReallocations` remains the builder.
- No mutation of `computeReallocations` or its options. (The earlier `maintainSupplyTargetUtilization` opt-in explored for this was dropped — the standalone metric does not need it.)
- No second-order precision. We return the literal `headroom + sharedLiquidity` sum, not the fixed-point-exact max borrow (see Assumptions).

## Proposed Solution

A pure helper:

```ts
computeAvailableLiquidityToTargetUtilization({
  reallocationData,
  marketId,
  targetUtilization = DEFAULT_SUPPLY_TARGET_UTILIZATION, // 90.5%
  options?,
}): bigint
```

It is the sum of **two** liquidity sources, with an asymmetric utilization rule between them:

1. **The target market's own headroom** — how much more can be borrowed on the market *as it stands today* before its utilization reaches `targetUtilization`. This is `Market.getBorrowToUtilization(targetUtilization)`. The target is **capped at the ceiling** (90.5%) — we never count borrow capacity that would push it past that line.
2. **Shared liquidity from sibling source markets** — what the PublicAllocator can reallocate in, with **source markets drained to 100% utilization** (`defaultMaxWithdrawalUtilization = WAD`). Sources have no ceiling; only the target does.

> The asymmetry is the whole point: **aggressive on the sources, conservative on the target.** Pulling a source to 100% is a curator action that is reversible and expected; pushing the *target* past 90.5% is the unhealthy state we are trying to measure the distance to.

### The two cases

```
utilization
  100% ─────────────────────────────────────
       │   target ABOVE ceiling
 90.5% ┝━━━━━━━━━━━━━━━━━━━━━━━━━━━ targetUtilization
       │   target BELOW ceiling
   0% ─────────────────────────────────────
```

**Case A — target utilization BELOW the ceiling** (the healthy, common case):

```
  returns:  ownHeadroom  +  sharedLiquidity
            └──────────┘    └────────────┘
       borrow that lifts    sources drained
       target up to 90.5%   to 100% util
```

```
 target market        sources (siblings)
 ┌───────────┐        ┌────┐ ┌────┐ ┌────┐
 │███████    │ 60%    │██  │ │███ │ │█   │   each pulled
 │  ↑        │        │ ↓  │ │ ↓  │ │ ↓  │   to 100%
 │  headroom │  →90.5%└────┘ └────┘ └────┘
 └───────────┘            └─── sharedLiquidity ───┘
```

**Case B — target utilization AT OR ABOVE the ceiling** → returns `0n`.

```
 target market
 ┌───────────┐
 │██████████ │ 95%   already past 90.5%
 └───────────┘       → no borrowable liquidity → 0n
```

There is nothing to add: the market is already at/over the line we cap on, so its own headroom is `0n`, and counting shared liquidity would be misleading (it would still leave the target over-utilized). We short-circuit and skip the (cheap but non-trivial) source discovery.

### Implementation

```ts
const market = reallocationData.getMarket(marketId).accrueInterest(options?.timestamp);

const ownHeadroom = market.getBorrowToUtilization(targetUtilization);
if (ownHeadroom === 0n) return 0n; // Case B: util ≥ ceiling

const sharedLiquidity = computeAvailableSharedLiquidity({
  reallocationData,
  marketId,
  options: { ...options, defaultMaxWithdrawalUtilization: MathLib.WAD, maxWithdrawalUtilization: {} },
});

return ownHeadroom + sharedLiquidity; // Case A
```

`getBorrowToUtilization` returns `0n` exactly when utilization ≥ target — that single equality is what discriminates the two cases, so no separate comparison is needed.

It builds on the sibling metric `computeAvailableSharedLiquidity` (sum of source withdrawals only, no target-side amount), passing the aggressive `WAD` cap to drain sources fully.

## Considered Alternatives

### Alternative 1: Add an opt-in flag to `computeReallocations`

The first iteration threaded a `maintainSupplyTargetUtilization` boolean through `ReallocationComputeOptions` and `computeReallocations`.

**Why rejected:** The metric takes no borrow amount and never builds calldata, so it shares almost nothing with `computeReallocations`'s control flow. Bolting it on widened the builder's option surface and its phase-2 branch for a read-only concern. A standalone helper is smaller, purer, and easier to test. The flag was fully reverted.

### Alternative 2: Cap sources at the same 90.5% ceiling as the target

Use the friendly 92% / configured withdrawal caps for sources too.

**Why rejected:** Under-reports. The PublicAllocator *can* legitimately drain a source to 100% to service a borrow; a curator dashboard wants the true upper bound. Sources and target play different roles — only the target's health ceiling matters for the metric's meaning.

### Alternative 3: Return the fixed-point-exact max borrow

The borrow `x` that solves `(B + x) / (S + L + x) = target` is slightly larger than `headroom + L`, because reallocated supply `L` also sits in the denominator.

**Why rejected:** Negligible difference at realistic utilizations, and the literal `headroom + L` sum is the quantity integrators reason about ("my headroom, plus the liquidity that can be pulled in"). Documented as a known approximation rather than chasing WAD-exactness for a display number.

## Assumptions & Constraints

- **Approximation, not WAD-exact.** The return is `ownHeadroom + sharedLiquidity`. The physically-exact max borrow is marginally higher (reallocated liquidity also raises the supply denominator). This is intentional and documented in JSDoc.
- **Pass `options.timestamp` from the fetch block.** Accrual otherwise falls back to the target market's `lastUpdate`, which can diverge from the source rows' fetch block — same constraint as `computeReallocations`.
- Pure helper, no I/O, no mutation. Additive public surface (one new export, building on `computeAvailableSharedLiquidity` shipped in the same PR). Semver: **minor**.
- `viem` stays the only peer dep. No new runtime dependencies.

## References

- `packages/morpho-sdk/src/helpers/sharedLiquidityMetrics.ts` — the two metrics.
- `packages/morpho-sdk/src/helpers/computeReallocations.ts` — the transactional counterpart (builds calldata, throws on insufficiency).
- `packages/morpho-sdk/src/entities/reallocationData.ts` — `getMarketPublicReallocations` (source-market discovery reused by both metrics).
- `DEFAULT_SUPPLY_TARGET_UTILIZATION` (90.5%) / `DEFAULT_WITHDRAWAL_TARGET_UTILIZATION` (92%) in `src/helpers/constant.ts`.
- Root [`AGENTS.md`](../../AGENTS.md) §1 (helpers layer / purity), §3 (types), §5 (testing), §6 (JSDoc).
