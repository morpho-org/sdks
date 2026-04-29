# Types Layer

> Full context: [CLAUDE.md](../../CLAUDE.md)

Centralized type definitions. Barrel-exported via `index.ts`.

## Intent

- `BaseAction<TType, TArgs>` — discriminated union base, keyed on `type`.
- `Transaction<TAction>` — immutable `{ to, value, data, action }`.
- `Requirement` / `RequirementSignature` — permit/permit2 sign flow.
- `Metadata` — optional `{ origin, timestamp? }` for calldata tracing.
- `DepositAmountArgs` — union type enforcing at least one of `amount` / `nativeAmount`. Reused for vault deposits and market collateral supply.
- `MarketParams` — Morpho Blue market params (`loanToken`, `collateralToken`, `oracle`, `irm`, `lltv`).
- `MorphoAuthorizationAction` — for `morpho.setAuthorization()` pre-requisite transactions.
- **Shared liquidity types** in `sharedLiquidity.ts`:
  - `ReallocationWithdrawal` — `{ readonly marketParams: MarketParams; readonly amount: bigint }`. Single withdrawal from a source market.
  - `VaultReallocation` — `{ readonly vault: Address; readonly fee: bigint; readonly withdrawals: readonly ReallocationWithdrawal[] }`. Maps 1:1 to a `PublicAllocator.reallocateTo()` call. Fee is in native ETH.
- `MarketV1BorrowAction` and `MarketV1SupplyCollateralBorrowAction` include `reallocationFee: bigint` in their args to track total fees paid (0n when no reallocations).
- `RepayAmountArgs` — union type: `{ assets: bigint }` (partial repay by assets) or `{ shares: bigint }` (full repay by shares). Exactly one mode.
- `MarketV1RepayAction` — `{ assets, shares, onBehalf, maxSharePrice }`. Exactly one of assets/shares is non-zero.
- `MarketV1WithdrawCollateralAction` — `{ amount, receiver }`.
- `MarketV1RepayWithdrawCollateralAction` — `{ repayAssets, repayShares, withdrawAmount, maxSharePrice, onBehalf, receiver }`.
- Custom errors in `error.ts` — one class per error case. Includes native wrapping validation (`NativeAmountOnNonWNativeVaultError`, `ChainWNativeMissingError`, `NegativeNativeAmountError`, `ZeroDepositAmountError`), market-specific: `BorrowExceedsSafeLtvError`, `MissingMarketPriceError`, `ZeroCollateralAmountError`, `NativeAmountOnNonWNativeCollateralError`, repay/withdraw-specific: `NonPositiveRepayAmountError`, `NonPositiveWithdrawCollateralAmountError`, `WithdrawExceedsCollateralError`, `WithdrawMakesPositionUnhealthyError`, `RepayExceedsDebtError`, `RepaySharesExceedDebtError`, and reallocation-specific: `NegativeReallocationFeeError`, `EmptyReallocationWithdrawalsError`, `NonPositiveReallocationAmountError`, `ReallocationWithdrawalOnTargetMarketError`, `UnsortedReallocationWithdrawalsError`.


## Key Constraints

- All properties `readonly`. No mutable interfaces.
- New operation → add its action interface here + extend `TransactionAction` union.
- New error case → dedicated class in `error.ts`, never generic `Error`.
