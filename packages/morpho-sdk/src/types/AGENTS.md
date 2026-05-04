# `types/`

Centralized type definitions and error classes. Barrel-exported via `index.ts`. Inherits [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Core types

- `BaseAction<TType, TArgs>` — discriminated union base, keyed on `type`.
- `Transaction<TAction>` — immutable `{ to, value, data, action }`. Returned from every action; deep-frozen.
- `Requirement` / `RequirementSignature` — permit/permit2 signing flow.
- `Metadata` — optional `{ origin, timestamp? }` for calldata tracing.
- `DepositAmountArgs` — union enforcing at least one of `amount` / `nativeAmount`. Reused for vault deposits and market collateral supply.
- `MarketParams` — Morpho Blue market params (`loanToken`, `collateralToken`, `oracle`, `irm`, `lltv`).
- `MorphoAuthorizationAction` — used for `morpho.setAuthorization()` pre-requisite transactions.

## Shared liquidity (`sharedLiquidity.ts`)

- `ReallocationWithdrawal` — source market + amount.
- `VaultReallocation` — vault address + fee + withdrawals.

Both map directly to `PublicAllocator.reallocateTo()` arguments.

## Errors (`error.ts`)

One class per error case. Never throw a generic `Error` from SDK source.

- **Market-specific:** `BorrowExceedsSafeLtvError`, `MissingMarketPriceError`, `ZeroCollateralAmountError`, `NativeAmountOnNonWNativeCollateralError`.
- **Reallocation-specific:** `NegativeReallocationFeeError`, `EmptyReallocationWithdrawalsError`, `NonPositiveReallocationAmountError`, `ReallocationWithdrawalOnTargetMarketError`, `UnsortedReallocationWithdrawalsError`.

## Adding a new operation

1. Add the action interface here, extending `BaseAction<TType, TArgs>`.
2. Extend the `TransactionAction` union.
3. Add a dedicated error class in `error.ts` for any new failure mode it introduces.
4. Mark all properties `readonly`.
