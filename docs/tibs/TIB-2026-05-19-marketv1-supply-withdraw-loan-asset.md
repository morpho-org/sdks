# TIB-2026-05-19: MarketV1 supply / withdraw of the loan asset

| Field      | Value                  |
| ---------- | ---------------------- |
| **Status** | Proposed               |
| **Date**   | 2026-05-19             |
| **Author** | @foulques              |
| **Scope**  | Package: `morpho-sdk`  |

---

## Context

`morpho-sdk` already exposes the borrower-side of every Morpho Blue MarketV1 path (`supplyCollateral`, `borrow`, `repay`, `withdrawCollateral`, and the composites `supplyCollateralBorrow` / `repayWithdrawCollateral`). The **supplier-side of the loan asset** is missing: there is no `marketV1Supply` and no `marketV1Withdraw`. `Morpho.sol` exposes these natively (`supply` / `withdraw`) and `GeneralAdapter1` already wraps them (`morphoSupply` / `morphoWithdraw`), but integrators must drop down to raw calldata or lower-level encoding helpers — which contradicts the SDK's contract that all market operations are reachable through layered `Client → Entity → Action` builders.

Two consequences:

- Liquidity providers cannot participate in a Morpho market through the SDK without leaving the typed surface (no `Transaction<TAction>`, no `getRequirements`, no PublicAllocator reallocation help).
- Suppliers who hit on-market illiquidity on a withdraw cannot reuse the SDK's shared-liquidity machinery (`getReallocationData` / `getReallocations` / `computeReallocations`) — that machinery is hard-coded to borrow semantics today.

This TIB freezes the design decision for the missing pair before the implementation lands.

## Goals / Non-Goals

**Goals**

- Add `marketV1Supply` and `marketV1Withdraw` to the public surface of `@morpho-org/morpho-sdk`, mirroring the existing action / entity / requirement layering.
- Route both through bundler3 / `GeneralAdapter1` (`morphoSupply` / `morphoWithdraw`) so they compose with the rest of the bundle action set.
- Support **native ETH wrapping** on supply when the loan token is the chain's wNative — same contract as `marketV1SupplyCollateral`.
- Support **optional PublicAllocator reallocations** on withdraw, so a withdraw whose amount exceeds on-market liquidity can succeed by first pulling liquidity from other markets of the same loan asset.
- Reuse `computeReallocations` for the withdraw direction (single source of truth), not a fork of the helper.
- Maintain 100% JSDoc and tests (unit colocated + fork e2e) on the new surface in the same PR.

**Non-Goals**

- No `shares` mode on supply. `assets`-only, matching `marketV1SupplyCollateral`. A "deposit exact shares" use case has no real demand and would add surface for zero gain.
- No `unwrapNative` after withdraw. `morphoWithdraw` sends the ERC-20 loan token to `receiver`; a caller wanting native ETH chains an `unwrapNative` manually or waits for a future `marketV1WithdrawNative`.
- No `marketV1SupplyWithdraw` composite. Supplying and withdrawing the same loan token in one bundle has no atomicity benefit (the two operations are inverses) — keeping them separate avoids surface explosion.
- No change to the existing `borrow` reallocation flow. The shared helper is extended, not rewritten; the borrow call site stays identical except for the new explicit `operation: "borrow"` discriminator.

## Proposed Solution

### Surface

Two new action builders, two new entity methods on `MorphoMarketV1`, and a typed action variant per `BaseAction`.

| Builder | Bundle | Slippage | Authorization | Reallocation | Native |
| --- | --- | --- | --- | --- | --- |
| `marketV1Supply` | `[nativeTransfer + wrapNative]? → [erc20TransferFrom \| permit/permit2] → morphoSupply` | `maxSharePrice` (anti-inflation) | — | — | Yes (loan token == wNative) |
| `marketV1Withdraw` | `[reallocateTo × N] → morphoWithdraw` | `minSharePrice` | `setAuthorization(generalAdapter1)` | Yes | — |

`tx.value = nativeAmount ?? 0n` for supply, `reallocationFee` for withdraw.

### Native wrapping on supply

Reproduces the wNative-collateral pattern from `marketV1SupplyCollateral` against the loan token:

- `nativeAmount > 0n` ⇒ prepend `nativeTransfer(bundler3 → generalAdapter1)` + `wrapNative(generalAdapter1)`; the supplied `totalAssets = amount + nativeAmount` reaches Morpho as wNative.
- `amount > 0n` and `nativeAmount > 0n` is supported (mixed flow).
- `nativeAmount > 0n` and `loanToken !== wNative` throws `NativeAmountOnNonWNativeAssetError`.
- Chain without configured `wNative` throws `ChainWNativeMissingError`.

The validation lives in `validateNativeAsset(chainId, asset)` — a single action-agnostic helper used by both the loan-side (supply) and collateral-side (supplyCollateral, supplyCollateralBorrow) paths. The legacy `validateNativeLoan` / `validateNativeCollateral` are removed; `NativeAmountOnNonWNativeCollateralError` is kept as a deprecated alias of `NativeAmountOnNonWNativeAssetError` so existing `instanceof` checks keep working.

A withdraw with native unwrap is **out of scope** for this PR. It requires routing `morphoWithdraw` to `receiver=generalAdapter1` and then chaining `unwrapNative(generalAdapter1 → user)`. The asymmetry exists because withdraw is a single bundler call today; adding the unwrap path adds another action plus a residual-skim consideration. Tracked as a future builder (`marketV1WithdrawNative`) when demand emerges.

### Reallocation on withdraw

PublicAllocator reallocations apply identically: they prepend `reallocateTo(vault, fee, withdrawals[], targetMarketParams)` actions before `morphoWithdraw`, and their fees accumulate in `tx.value`. `validateReallocations(target=withdrawMarketId)` is reused as-is — sort, no-target-market, non-empty, non-negative fee, strictly-ascending market IDs.

The shared-liquidity planner `computeReallocations` gains an `operation: "borrow" | "withdraw"` discriminator. The signature becomes:

```ts
computeReallocations({
  reallocationData,
  marketId,
  operation: "borrow" | "withdraw",
  amount,
  options?,
});
```

The algebra differs by operation. Let `B = totalBorrowAssets`, `S = totalSupplyAssets`, `target = supplyTargetUtilization`, `x = amount` (borrow amount or withdraw amount):

| Operation | `newTotalBorrowAssets` | `newTotalSupplyAssets` | `requiredAssets` (to hit `target`) | `absoluteShortfall` |
| --- | --- | --- | --- | --- |
| `borrow` | `B + x` | `S` | `(B + x) / target − S` | `max(0, (B + x) − S)` |
| `withdraw` | `B` | `S − x` | `B / target − (S − x)` | `max(0, B − (S − x))` |

In both cases reallocated assets are added on the supply side: `S' = S' + reallocated`. The withdraw branch never inflates `B`, but the `x` in the supply-side shrinkage is what produces a non-trivial `requiredAssets` even when target ≥ pre-state utilization.

The same two-phase strategy applies (friendly utilization-target reallocations first, then aggressive 100%-utilization fallback). `InsufficientSharedLiquidityError` continues to fire when the aggregate reallocatable liquidity strictly under-covers the absolute shortfall — protecting integrators from paying PublicAllocator fees on a withdraw that would still revert.

### Withdraw modes

`marketV1Withdraw` supports both `assets` and `shares` modes (mirrors `marketV1Repay`). Shares mode is essential for closing a supplier position cleanly across interest accrual. **No `erc20Transfer` skim is needed** in either mode because `morphoWithdraw(...receiver)` sends the assets computed on-chain directly to `receiver`; the user under-receives versus an off-chain estimate by definition and nothing lingers in the adapter.

### Types

```ts
interface MarketV1SupplyAction extends BaseAction<"marketV1Supply", {
  market: Hex;
  amount: bigint;
  onBehalf: Address;
  maxSharePrice: bigint;
  nativeAmount?: bigint;
}> {}

interface MarketV1WithdrawAction extends BaseAction<"marketV1Withdraw", {
  market: Hex;
  assets: bigint;
  shares: bigint;
  receiver: Address;
  minSharePrice: bigint;
  reallocationFee: bigint;
}> {}
```

`RepayAmountArgs` is generalized to `AssetsOrSharesArgs = { assets: bigint } | { shares: bigint }` and re-exported under the old name as an alias so existing consumers keep working without semver churn.

### Errors

Nine new classes, one per failure mode (`src/types/error.ts`):

- `NegativeSupplyAmountError`
- `NegativeSupplyMaxSharePriceError`
- `ZeroSupplyAmountError`
- `NonPositiveWithdrawAmountError`
- `NegativeWithdrawMinSharePriceError`
- `MutuallyExclusiveWithdrawAmountsError`
- `WithdrawExceedsSupplyError`
- `WithdrawSharesExceedSupplyError`

The native-asset validator was unified: `validateNativeCollateral` / `validateNativeLoan` are replaced by a single action-agnostic `validateNativeAsset(chainId, asset)`, throwing `NativeAmountOnNonWNativeAssetError`. `NativeAmountOnNonWNativeCollateralError` is kept as a deprecated alias of the new class (instance check still works).

Messages follow the canonical `"<what> <values>. <Imperative remediation>."` shape established by `BorrowExceedsSafeLtvError`.

### Implementation phases

- **Phase 1 — Types + errors.** Extend `src/types/action.ts` (action interfaces + `AssetsOrSharesArgs`) and `src/types/error.ts`. Unblocks barrel re-exports for the rest of the work.
- **Phase 2 — Helpers.** Add `computeMaxSupplySharePrice` and `computeMinWithdrawSharePrice` in `src/helpers/slippage.ts`; `validateWithdrawAmount`, `validateWithdrawShares`, and the unified `validateNativeAsset` in `src/helpers/validate.ts`. Unit tests colocated.
- **Phase 3 — `computeReallocations` extension.** Add the `operation` discriminator; update the borrow caller to pass `"borrow"`; cover the withdraw branch with new tests.
- **Phase 4 — Action builders.** `src/actions/marketV1/supply.ts` and `src/actions/marketV1/withdraw.ts` + colocated unit tests + barrel update.
- **Phase 5 — Entity wiring.** Two new methods on `MorphoMarketV1` (`supply`, `withdraw`); generalize `getReallocations` to take `{ amount, operation }`.
- **Phase 6 — Fork tests.** Anvil mainnet at the pinned block; reuse `CbbtcUsdcMarketV1`, `SteakhouseUsdcVaultV1`, `WbtcUsdcSourceMarket`, `WstethUsdcSourceMarket` from existing fixtures. Cover happy paths, modes, native, permit2, reallocation single/multi/fee, `InsufficientSharedLiquidityError`, missing `setAuthorization`.
- **Phase 7 — Docs + changeset.** Update package and sub-folder `CLAUDE.md` routing tables; add a minor changeset.

## Considered Alternatives

### Alternative 1: Fork `computeReallocations` into a withdraw-specific helper

Add `computeWithdrawReallocations` alongside the existing function.

**Why rejected:** Violates the "single source of truth per concept" rule from the root `AGENTS.md` §1. The two operations share the entire reallocation algorithm — only the pre-state computation differs. Forking risks drift (a fix to the borrow planner that silently misses the withdraw planner) for negligible code-clarity gain.

### Alternative 2: `shares` mode on supply

Mirror `marketV1Repay`'s assets-or-shares dichotomy on the supply side too.

**Why rejected:** No realistic use case. Repay shares mode exists to immunize a full position close against interest accrual between transaction construction and execution; supply has no such "close" semantics, and supplying exact shares from off-chain calldata is brittle (requires the upper-bound transfer / skim machinery that repay needs but supply does not). The asymmetry with `supplyCollateral` would also confuse the surface.

### Alternative 3: Skim residual after `morphoWithdraw` in shares mode

Add an `erc20Transfer` skim like `marketV1Repay`'s shares-mode bundle.

**Why rejected:** `Morpho.withdraw(...,receiver)` already sends the on-chain-computed asset amount directly to `receiver`. There is no residual in `GeneralAdapter1`. The skim would be a no-op on every call. Verified against `GeneralAdapter1.morphoWithdraw` ABI and the `Morpho.sol` reference.

### Alternative 4: Build a unified `marketV1WithdrawNative` in the same PR

Bundle the native-unwrap path with `withdraw` to ship a complete native story.

**Why rejected:** Larger surface for a feature with no immediate demand; would expand the bundle from one action to three plus a re-routing of `receiver=generalAdapter1` and an extra ERC-20 → native skim consideration. Better as a follow-up TIB once an integrator asks for it.

## Assumptions & Constraints

- `AccrualPosition` (from `@morpho-org/blue-sdk`) exposes `supplyShares` and a derived `supplyAssets` via `Market.toSupplyAssets(supplyShares)`. Confirmed at `packages/blue-sdk/src/position/Position.ts:79`.
- The fork fixtures already in `packages/morpho-sdk/test/fixtures/marketV1.ts` and the `SteakhouseUsdcVaultV1` setup used by the existing borrow-reallocation fork tests are sufficient for the new fork tests. No new pinned block needed.
- `viem` stays the only peer dep of `@morpho-org/morpho-sdk`. No new runtime dependencies.
- The change is additive on the public surface (two new exports + new errors + new action union members). Semver: **minor**.

## Security

- **Slippage is bounded on both sides.** Supply uses `maxSharePriceE27 = (assets / shares) × (WAD + slippage)` (upper bound, RAY-scaled), so a malicious actor inflating the share price via a donation between transaction construction and execution cannot dilute the supplier. Withdraw uses `minSharePriceE27 = (assets / shares) × (WAD − slippage)` (lower bound), capping the loss to slippage tolerance. Both helpers cap at `MAX_ABSOLUTE_SHARE_PRICE` like the existing repay helper.
- **Authorization is enforced.** `withdraw` requires `setAuthorization(generalAdapter1, true)` on Morpho. `getRequirements` returns the typed authorization tx so integrators send it before the bundle; if they don't, the bundle reverts on the Morpho-side auth check.
- **Reallocation fees are paid only when they can actually unblock the withdraw.** `computeReallocations` continues to throw `InsufficientSharedLiquidityError` when the aggregate reallocatable liquidity strictly under-covers the absolute shortfall — preventing the user from paying ETH fees to the PublicAllocator on a withdraw that would still revert.
- **`validateReallocations` is reused unchanged.** Strict-ascending market IDs, no withdrawal on the target market, non-empty withdrawals, non-negative fee.
- **Input validation runs before any encoding.** Every error is a named class (`Error` subclass) that integrators can pattern-match on; messages never leak raw `Error` strings from upstream.

## Future Considerations

- **`marketV1WithdrawNative`** — auto-unwrap on withdraw when `loanToken === wNative`. Requires routing through `generalAdapter1` as the bundler receiver and adding `unwrapNative` at the bundle tail. Track when an integrator asks.
- **Supply on behalf of a different address.** Already supported via `onBehalf`; verify in fork tests that the entity passes the user's address by default.
- **Withdraw to a different receiver.** Supported by the action; the entity passes `receiver = userAddress` by default. A future ergonomic shortcut on the entity (`withdraw({ receiver })`) is possible if needed.
- **Withdraw is signer-bound (no `onBehalf`).** The bundled `morphoWithdraw` call on GeneralAdapter1 uses the transaction initiator as the position holder — mirror `marketV1Borrow`. A separate `onBehalf` argument is rejected upstream by the action signature to avoid the simulation/UI lie noted in the third review pass.

## References

- `packages/morpho-sdk/src/actions/marketV1/borrow.ts` — closest existing template (slippage + reallocation).
- `packages/morpho-sdk/src/actions/marketV1/repay.ts` — assets/shares mode reference.
- `packages/morpho-sdk/src/actions/marketV1/supplyCollateral.ts` — native wrap reference.
- `packages/morpho-sdk/src/helpers/computeReallocations.ts` — extended in Phase 3.
- `packages/morpho-sdk/src/helpers/slippage.ts` — extended in Phase 2.
- [`Morpho.sol`](https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol) — `supply` / `withdraw` reference.
- [`GeneralAdapter1.sol`](https://github.com/morpho-org/bundler3/blob/main/src/adapters/GeneralAdapter1.sol) — `morphoSupply` / `morphoWithdraw` reference.
- Root [`AGENTS.md`](../../AGENTS.md) §1 (layering), §3 (types), §5 (testing), §6 (JSDoc), §7 (release).
