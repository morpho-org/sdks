# TIB-2026-07-02: Native ETH wrapping in Blue repay, with entity-resolved flat action args

| Field      | Value                 |
| ---------- | --------------------- |
| **Status** | Accepted              |
| **Date**   | 2026-07-02            |
| **Author** | @foulques             |
| **Scope**  | Package: `morpho-sdk` |

---

> This TIB retrospectively records the design shipped in PR
> [#840](https://github.com/morpho-org/sdks/pull/840); the rule it decides is codified in
> [`packages/morpho-sdk/AGENTS.md`](../../packages/morpho-sdk/AGENTS.md) (routing summary) and the
> `actions/blue` / `entities/blue` / `types` sub-folder `AGENTS.md` files.

## Context

The Blue supply-side flows (`blueSupply`, `blueSupplyCollateral`, `blueSupplyCollateralBorrow`) and
the vault deposits already accept **native ETH**: the caller attaches `nativeAmount`, and the bundle
wraps it to the chain's wNative via `GeneralAdapter1` (`nativeTransfer → wrapNative`) before the
Morpho call. The two repay flows — `blueRepay` and `blueRepayWithdrawCollateral` — did **not**. A
caller repaying a wNative-loan position (e.g. WETH) had to pre-wrap ETH to WETH in a separate
transaction, breaking the "one bundle" ergonomics the supply side already offered.

The repay action args were also shaped around a `transferAmount` field with a helper
(`validateRepayParams`) enforcing `transferAmount === assets` in assets mode. That invariant is
**false** the moment native wrapping makes assets mode additive: the total repaid becomes
`amount + nativeAmount`, so the ERC-20 pulled (`amount`) no longer equals the total routed. Bolting
native onto the old shape would have meant a more complex resolver, not a simpler one.

This TIB freezes the decision for both the native-wrapping feature and the accompanying args
reshape.

## Goals / Non-Goals

**Goals**

- Add optional native-ETH wrapping to `blueRepay` and `blueRepayWithdrawCollateral` (action layer)
  and to `MorphoBlue.repay` / `repayWithdrawCollateral` (entity layer), valid only when the loan
  token is the chain's wNative.
- Match the `blueSupply` devex: assets mode is **additive** (`repaid = amount + nativeAmount`).
- Move **all** amount arithmetic into the entity layer. The action becomes a pure, synchronous
  bundle assembler that does zero arithmetic — it receives pre-resolved amounts and only assembles
  and validates cheap invariants.
- Preserve the two repay modes (assets = partial, shares = full/accrual-immune) and every
  fund-safety invariant: approval targets `GeneralAdapter1` and covers only the ERC-20 portion
  actually pulled; a fully-native repay emits no approval; shares mode skims the residual to
  `receiver`.
- Ship with full JSDoc, colocated unit tests, Anvil fork integration tests, and a major changeset;
  adapt the `wdk-protocol-lending-morpho-evm` consumer.

**Non-Goals**

- No `unwrapNative` on the withdraw-collateral leg. `repayWithdrawCollateral` withdraws the
  **collateral** token, which is not the loan/wNative token; auto-unwrap there is meaningless.
- No change to the shares-mode accrual model. The 2h forward-accrued upper-bound transfer + residual
  skim is preserved as-is; native only carves a slice out of that same envelope.
- No new runtime dependencies. `viem` stays the only peer dep of `morpho-sdk`.
- No touching the already-shipped supply/borrow/withdraw wrapping paths.

## Current Solution

Before this change, the repay entity args were `{ assets } | { shares }` and the action args were
`{ assets, shares, transferAmount }`. `validateRepayParams` enforced `transferAmount === assets`
(assets mode) or `transferAmount > 0n` (shares mode). There was no native path: repaying a WETH
position required the caller to hold WETH ERC-20.

## Proposed Solution

The load-bearing decision is a **clean split across the `Entity → Action` boundary**: the entity
reads live market/position state and resolves every amount; the action is a dumb, arithmetic-free
encoder that trusts the pre-resolved amounts.

### Two surfaces

- **Entity-facing** (`RepayAmountArgs`, what integrators pass to `MorphoBlue.repay`):

  ```ts
  type RepayAmountArgs = DepositAmountArgs | { shares: bigint; nativeAmount?: bigint };
  // DepositAmountArgs = { amount, nativeAmount? } | { nativeAmount, amount? }
  ```

- **Action-facing** (`RepayActionAmountArgs`, what the entity passes to `blueRepay`) — a **flat,
  pre-resolved** interface, deliberately *not* a discriminated union:

  ```ts
  interface RepayActionAmountArgs {
    amount?: bigint;
    shares?: bigint;
    nativeAmount?: bigint;
    transferAmount: bigint;
  }
  ```

### The two modes

Mode is discriminated at runtime on `shares > 0n`.

| Mode | Repaid to Morpho | ERC-20 pulled | Wrapped | Action `transferAmount` (in) | Residual |
| --- | --- | --- | --- | --- | --- |
| **assets** (partial) | `amount + nativeAmount` | `amount` | `nativeAmount` | `amount + nativeAmount` | none (exact) |
| **shares** (full) | exact `shares` | `borrowAssets − nativeAmount` | `nativeAmount` | `borrowAssets − nativeAmount` | skimmed to `receiver` |

where `borrowAssets = market.toBorrowAssets(shares, "Up")` computed on a **2h forward-accrued**
market snapshot (upper bound on the on-chain repay price).

**Crossover / output convention.** The action's *output* `transferAmount` is
`erc20Amount + nativeAmount` — the **total loan tokens routed to `GeneralAdapter1`** — in **both**
modes. This is exactly the convention the supply flows use (`blueSupply` outputs `amount =
totalAssets = amount + nativeAmount`, `nativeAmount` separate), so the simulation layer recovers the
ERC-20 pulled uniformly as `transferAmount − nativeAmount`.

### Action (arithmetic-free)

```ts
const isSharesMode = shares > 0n;
const repayAssets = isSharesMode ? 0n : transferAmount;
const erc20Amount = isSharesMode ? transferAmount : amount;
```

Guards only — validation, not the state-derived arithmetic the action refuses to do: `maxSharePrice
> 0`, `nativeAmount >= 0`, `amount >= 0`, `shares >= 0`, `amount`/`shares` mutual exclusivity, and
mode-aware funding checks: assets mode requires `transferAmount === amount + nativeAmount`
(`TransferAmountNotEqualToAssetsError`) and a positive total; shares mode requires a non-negative
`transferAmount` and positive funding `transferAmount + nativeAmount > 0n`
(`NonPositiveRepayAmountError`). These cheap equality/positivity checks protect direct callers of the
exported builder from stranding over-pulled tokens on `GeneralAdapter1` or encoding an unfunded repay;
the entity path always satisfies them.

Bundle:

```
[nativeTransfer(bundler3 → generalAdapter1, nativeAmount) → wrapNative(nativeAmount, generalAdapter1)]?
  → [erc20TransferFrom | permit/permit2 (erc20Amount)]?      // skipped when erc20Amount === 0n
  → morphoRepay(repayAssets, repayShares, maxSharePrice, onBehalf)
  → [erc20Transfer(maxUint256 → receiver) skim]?             // shares mode only
  (→ morphoWithdrawCollateral(withdrawAmount, receiver))     // repayWithdrawCollateral only, after repay
```

`tx.value = nativeAmount` (matches the wrapped amount; the encoder derives the same value from the
`nativeTransfer` call).

### Entity (resolves everything)

- **assets mode:** guard `amount < 0n` (reject a negative amount that a larger `nativeAmount` would
  otherwise mask into a positive sum), `repayAssets = amount + nativeAmount`, `validateRepayAmount`,
  `erc20Amount = amount`.
- **shares mode:** `validateRepayShares`, `borrowAssets = toBorrowAssets(shares, "Up")` on the
  2h-accrued market, guard `nativeAmount <= borrowAssets` (`NativeAmountExceedsTransferAmountError`),
  `erc20Amount = borrowAssets − nativeAmount`.
- `getRequirements` emits the ERC-20 approval/permit for the pulled portion only (`erc20Amount`), and
  returns `[]` for that leg when `erc20Amount === 0n` (a fully-native repay needs no approval).
- Native wrapping requires `loanToken === chain wNative`; `validateNativeAsset(chainId, loanToken)`
  is chainId-aware and therefore stays inline in the action as well as the entity.

### Why `validateRepayParams` / `resolveRepayAmounts` are removed

The old `transferAmount === assets` invariant is false under additive native wrapping. Rather than a
complex pure resolver, the amounts are derived **inline in the entity** — which already holds live
state — and the action trusts them. This honours root `AGENTS.md` §1 (actions are arithmetic-free)
and keeps the logic minimal. `NonPositiveTransferAmountError` remained exported but deprecated
throughout v5 and is removed in v6 after that deprecation window. `TransferAmountNotEqualToAssetsError`
is retained and **still thrown**: it now guards the assets-mode action funding invariant
(`transferAmount === amount + nativeAmount`, see below). A new exported
`NativeAmountExceedsTransferAmountError` covers the shares-mode carve-out.

### Implementation phases

- **Phase 1 — Types + errors.** Flat `RepayActionAmountArgs`; redefine `RepayAmountArgs`;
  `nativeAmount?` on both action output types; add `NativeAmountExceedsTransferAmountError`; deprecate
  `NonPositiveTransferAmountError`; repurpose `TransferAmountNotEqualToAssetsError` as the assets-mode
  action funding guard.
- **Phase 2 — Actions.** Native wrap block + arithmetic-free reconstruction + guards in `repay.ts`
  and `repayWithdrawCollateral.ts`; remove `validateRepayParams` and its barrel exports.
- **Phase 3 — Entity.** Inline amount resolution + guards in `MorphoBlue.repay` /
  `repayWithdrawCollateral`; `getRequirements` approves the ERC-20 portion only.
- **Phase 4 — Tests.** Colocated unit tests (assets/shares × ERC-20/native/fully-native, error
  paths); entity tests for both methods; Anvil fork round-trips for native repay on `WstethWethBlue`.
- **Phase 5 — Docs + consumer + changeset.** JSDoc, sub-folder `AGENTS.md`, README; adapt
  `wdk-protocol-lending-morpho-evm` (`assets → amount`); major changeset for `morpho-sdk`, patch for
  the wdk dependent.

## Considered Alternatives

### Alternative 1: Keep a discriminated-union action arg shape

Model the action args as `DepositAmountArgs | { shares, transferAmount, nativeAmount? }` (the first
iteration in the PR).

**Why rejected:** `transferAmount` means different things per mode (total in assets mode via the
additive sum; net-ERC-20 envelope in shares mode), so a single union member could not carry both
cleanly, and the entity had to branch to populate it anyway. A flat interface discriminated at
runtime on `shares > 0n` lets the entity fill one shape and gives the simulation layer one output
shape. This is the devex correction that produced the final design.

### Alternative 2: Keep amount resolution in a pure `resolveRepayAmounts` helper

Retain a pure helper that validates and derives the amounts, called by the action.

**Why rejected:** the derivation needs live market state (the 2h-accrued `toBorrowAssets`), which the
entity already fetches; a "pure helper" would just be the entity method with state passed in. Inlining
it into the entity removed a redundant layer and kept the action arithmetic-free. Matches "pas de
logique complexe" — the action does no math at all.

### Alternative 3: Ship the flat args with no action-level consistency guard

Rely solely on the entity always passing consistent args, and let the action encode whatever flat
args it receives — no `transferAmount === amount + nativeAmount` (assets) or funding
(`transferAmount + nativeAmount > 0n`, shares) check.

**Why rejected:** `blueRepay` / `blueRepayWithdrawCollateral` are exported public API; a direct caller
passing self-inconsistent pre-resolved args would strand over-pulled loan tokens on `GeneralAdapter1`
(assets mode has no residual skim) or encode an under/unfunded repay that reverts. The pre-PR local
review **and** the Codex automated review independently flagged this, and the pre-reshape code guarded
it via `TransferAmountNotEqualToAssetsError`. The checks are cheap equality/positivity validation — not
the state-derived arithmetic the action avoids — so they were **adopted**, not deferred. The entity
path is unaffected because it always produces consistent, funded args.

### Alternative 4: `unwrapNative` on `repayWithdrawCollateral`

Auto-unwrap the withdrawn asset to native ETH.

**Why rejected:** the withdrawn asset is the **collateral** token, not the loan/wNative token; there
is nothing to unwrap on the repay leg. A native-out withdraw is a separate concern (see the MarketV1
supply/withdraw TIB's `WithdrawNative` note).

## Assumptions & Constraints

- Native wrapping is valid **only** when `loanToken === getChainAddresses(chainId).wNative`;
  otherwise `NativeAmountOnNonWNativeAssetError` (or `ChainWNativeMissingError` when the chain has no
  configured wNative). This gate is chainId-dependent, so it lives in the action, not a pure helper.
- Shares mode keeps the existing 2h forward-accrual upper bound and residual skim; native only reduces
  the ERC-20 slice of that same envelope, so `nativeAmount <= borrowAssets` is required.
- The change is **breaking**: `assets → amount` rename on the entity surface, `RepayActionAmountArgs`
  retyped from a union to a flat interface, and `validateRepayParams` / `resolveRepayAmounts` removed
  from the public surface ⇒ **major** for `@morpho-org/morpho-sdk`. The only in-repo consumer
  (`wdk-protocol-lending-morpho-evm`) is adapted and bumped **patch**.
- `viem` stays the only peer dep of `morpho-sdk`.

## Security

- **Accounting balances in both modes.** The adapter is funded by `wrapNative(nativeAmount)` +
  `erc20TransferFrom(erc20Amount)`, which equals `repayAssets` (assets mode) or covers `borrowAssets`
  (shares mode, 2h upper bound); `morphoRepay` consumes exactly (assets) or at most (shares) that, and
  the shares-mode skim returns the intended residual. No shortfall, no unintended residue.
- **Approval hygiene.** The ERC-20 approval/permit targets `GeneralAdapter1` (never the Morpho
  contract) and is for the ERC-20 portion actually pulled; a fully-native repay pulls nothing and
  emits no approval requirement.
- **wNative gate + chainId.** Native repay on a non-wNative loan token is rejected before encoding;
  `chainId` is validated on the entity path; the actions remain pure/synchronous (no state reads, no
  `async`, no input mutation).
- **Consistent negative-input rejection.** A negative `amount` (assets mode) or a negative shares-mode
  `transferAmount` throws `NonPositiveRepayAmountError` from both `getRequirements` and `buildTx`,
  instead of the entity leaking a negative approval while only `buildTx` threw.
- **Action-level funding validation.** The exported builders reject self-inconsistent pre-resolved
  args: assets mode requires `transferAmount === amount + nativeAmount`
  (`TransferAmountNotEqualToAssetsError`), shares mode requires positive funding
  (`transferAmount + nativeAmount > 0n`) — so a direct caller cannot strand over-pulled loan tokens on
  `GeneralAdapter1` or encode an underfunded repay that reverts.

## Future Considerations

- **Native-out withdraw** (`unwrapNative` tail) for loan-asset withdraw flows when an integrator asks
  — tracked separately from the repay legs.

## References

- PR [#840](https://github.com/morpho-org/sdks/pull/840) — implementation.
- `packages/morpho-sdk/src/actions/blue/supply.ts` — native-wrap reference (additive `totalAssets`).
- `packages/morpho-sdk/src/actions/blue/repay.ts` / `repayWithdrawCollateral.ts` — the reshaped
  builders.
- `packages/morpho-sdk/src/entities/blue/blue.ts` — `repay` / `repayWithdrawCollateral` resolution.
- [`TIB-2026-05-19`](./TIB-2026-05-19-marketv1-supply-withdraw-loan-asset.md) — sibling loan-asset
  supply/withdraw decision (native-wrap + slippage precedent).
- [`Morpho.sol`](https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol) — `repay`
  reference.
- [`GeneralAdapter1.sol`](https://github.com/morpho-org/bundler3/blob/main/src/adapters/GeneralAdapter1.sol)
  — `morphoRepay` / `wrapNative` reference.
- Root [`AGENTS.md`](../../AGENTS.md) §1 (layering), §3 (types), §5 (testing), §6 (JSDoc), §7 (release).
