# `types/`

Centralized type definitions and error classes. Barrel-exported via `index.ts`. Inherits [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Core types

- `BaseAction<TType, TArgs>` — discriminated union base, keyed on `type`.
- `Transaction<TAction>` — immutable `{ to, value, data, action }`. Returned from every action; deep-frozen.
- `Requirement` / `RequirementSignature` — prerequisite signing flow for ERC-2612, Permit2
  AllowanceTransfer, Permit2 SignatureTransfer, Morpho authorization, and Midnight offer roots.
- `ActionOutput` — lazy entity output with `getRequirements()` plus synchronous `buildTx(...)`.
- `Metadata` — optional `{ origin, timestamp? }` for calldata tracing.
- `DepositAmountArgs` — union enforcing at least one of `amount` / `nativeAmount`. Used by vault
  deposits and public low-level composition. Direct BlueBundlesV1 native funding is exclusive with
  ERC-20 funding rather than additive.
- `AssetsOrSharesArgs` — discriminated union `{ assets } | { shares }`. Used by withdraw (supply-side).
- `MarketParams` — Morpho Blue market params (`loanToken`, `collateralToken`, `oracle`, `irm`, `lltv`).
- `BlueAuthorizationAction` — used for `morpho.setAuthorization()` prerequisite transactions.
  High-level Blue writes authorize BlueBundlesV1; low-level Bundler3 composition may authorize
  GeneralAdapter1.
- `Midnight*Action` — Midnight fixed-rate action metadata for bundled taker flows, direct collateral/credit flows, maker-offer submission, and maker prerequisite transactions.

## Shared liquidity (`sharedLiquidity.ts`)

- All Vault V1 shared-liquidity types are deprecated and will be removed in the next major,
  including `PublicAllocatorOptions`, `PublicReallocation`, `ReallocationWithdrawal`,
  `VaultV1Reallocation`, `VaultReallocation`, and `ReallocationComputeOptions`.
- `VaultV1Reallocation` — vault address + fee + sorted withdrawals; maps to `reallocateTo()` for
  low-level PublicAllocator V1 composition. `VaultReallocation` is its deprecated compatibility
  alias. Neither is accepted by v6 high-level Blue writes.
- `VaultV2BlueReallocation` — BluePublicAllocator vault/source/target-adapter/assets/WAD-scaled-penalty input; maps 1:1 to `reallocate()` or `allocateFromIdle()` while deriving target market params from the enclosing Blue action.
- `VaultV2BluePublicAllocatorOptions` — canonical Vault V2 discovery and planner options for timestamp, enablement, vault allowlisting, friendly source-market utilization, and the maximum proportional penalty.
- `BlueReallocationPlan` — homogeneous V1-or-V2 iterable retained for deprecated low-level
  compatibility helpers. High-level Blue writes accept `VaultV2BlueReallocation` directly; the V1
  branch will be removed in the next major.

## Errors (`error.ts`)

One class per error case. Never throw a generic `Error` from SDK source.

- **Generic input bounds:** `NegativeInputError` for values that must be non-negative, `NonPositiveInputError` for values that must be positive, and `InputExceedsMaxError` for protocol upper bounds such as BluePublicAllocator's `uint128` assets and WAD-scaled `uint64` penalty. All expose the invalid `field` and `value`; reuse them across Vault, Blue, and Midnight instead of adding operation-specific scalar-bound errors.
- **Market-specific:** `BorrowExceedsSafeLtvError`, `MissingMarketPriceError`, `NativeAmountOnNonWNativeAssetError`, `MutuallyExclusiveWithdrawAmountsError`, `WithdrawExceedsSupplyError`, `WithdrawSharesExceedSupplyError`.
- **Reallocation-specific:** `EmptyReallocationWithdrawalsError`, `InvalidReallocationShapeError` when a reallocation entry passed to a high-level Blue write is not a valid Vault V2 reallocation (a non-object entry or one carrying Vault V1 `withdrawals`/`fee` fields), `MixedReallocationVersionsError` (deprecated compatibility export, no longer thrown), `InvalidReallocationAddressError` for malformed BluePublicAllocator vault or adapter addresses, `InvalidReallocationSourceTypeError` for an absent, incomplete, or unknown BluePublicAllocator source, `InconsistentReallocationPenaltyError` for conflicting penalties on one vault, `ReallocationWithdrawalOnTargetMarketError`, `UnsortedReallocationWithdrawalsError`, `ReallocationWithdrawExceedsMarketSupplyError`.

## Adding a new operation

1. Add the action interface here, extending `BaseAction<TType, TArgs>`.
2. Extend the `TransactionAction` union.
3. Reuse the generic input-bound errors for scalar validation; add a dedicated class in `error.ts` only for a distinct domain failure mode.
4. Mark all properties `readonly`.
