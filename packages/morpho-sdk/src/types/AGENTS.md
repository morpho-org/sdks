# `types/`

Centralized type definitions and error classes. Barrel-exported via `index.ts`. Inherits [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Core types

- `BaseAction<TType, TArgs>` — discriminated union base, keyed on `type`.
- `Transaction<TAction>` — immutable `{ to, value, data, action }`. Returned from every action; deep-frozen.
- `Requirement` / `RequirementSignature` — prerequisite signing flow for permit/permit2 and Midnight offer roots.
- `TransactionPlan<TPrimaryAction, TRequestOptions, TRequest, TSignatures>` — lazy entity output whose `prepare()` call resolves typed prerequisite requests and whose prepared form builds an executable plan.
- `PreparedTransactionPlan<TPrimaryAction, TRequest, TSignatures>` — resolved, typed review surface containing signature requests, call requests, and semantic intents.
- `ExecutableTransactionPlan<TPrimaryAction, TRequest>` — ordered prerequisite and primary calls ready for submission.
- `Metadata` — optional `{ origin, timestamp? }` for calldata tracing.
- `DepositAmountArgs` — union enforcing at least one of `amount` / `nativeAmount`. Reused for vault deposits, market collateral supply, and market loan-asset supply.
- `AssetsOrSharesArgs` — discriminated union `{ assets } | { shares }`. Used by withdraw (supply-side).
- `RepayAmountArgs` / `RepayActionAmountArgs` — repay funding shapes (native-aware). `RepayAmountArgs` (entity surface) is a union `DepositAmountArgs | { shares }`; the entity derives every amount from live market state. `RepayActionAmountArgs` (action surface) is a **flat, pre-resolved** interface `{ amount?, shares?, nativeAmount?, transferAmount }` — the action does no amount arithmetic. Mode is discriminated on `shares`: assets mode is additive like supply (`transferAmount = amount + nativeAmount`, ERC-20 pulled = `amount`); shares mode repays exact shares (ERC-20 pulled = `transferAmount`, already net of native).
- `MarketParams` — Morpho Blue market params (`loanToken`, `collateralToken`, `oracle`, `irm`, `lltv`).
- `BlueAuthorizationAction` — used for `morpho.setAuthorization()` pre-requisite transactions.
- `Midnight*Action` — Midnight fixed-rate action metadata for bundled taker flows, direct collateral/credit flows, maker-offer submission, and maker prerequisite transactions.

## Shared liquidity (`sharedLiquidity.ts`)

- `ReallocationWithdrawal` — source market + amount.
- `VaultReallocation` — vault address + fee + withdrawals.

Both map directly to `PublicAllocator.reallocateTo()` arguments.

## Errors (`error.ts`)

One class per error case. Never throw a generic `Error` from SDK source.

- **Market-specific:** `BorrowExceedsSafeLtvError`, `MissingMarketPriceError`, `ZeroCollateralAmountError`, `NativeAmountOnNonWNativeAssetError`, `NativeAmountExceedsTransferAmountError`, `ZeroSupplyAmountError`, `NegativeSupplyAmountError`, `NegativeSupplyMaxSharePriceError`, `NonPositiveWithdrawAmountError`, `NegativeWithdrawMinSharePriceError`, `MutuallyExclusiveWithdrawAmountsError`, `WithdrawExceedsSupplyError`, `WithdrawSharesExceedSupplyError`.
- **Reallocation-specific:** `NegativeReallocationFeeError`, `EmptyReallocationWithdrawalsError`, `NonPositiveReallocationAmountError`, `ReallocationWithdrawalOnTargetMarketError`, `UnsortedReallocationWithdrawalsError`, `ReallocationWithdrawExceedsMarketSupplyError`.

## Adding a new operation

1. Add the action interface here, extending `BaseAction<TType, TArgs>`.
2. Extend the `TransactionAction` union.
3. Add a dedicated error class in `error.ts` for any new failure mode it introduces.
4. Mark all properties `readonly`.
