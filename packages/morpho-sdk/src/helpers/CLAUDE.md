# Helpers Layer

> Full context: [CLAUDE.md](../../CLAUDE.md)

Utility functions shared across layers.

## Intent

- `addTransactionMetadata(tx, metadata)` — concatenates hex-encoded origin + optional timestamp to `tx.data`.
- Origin: max 4 bytes hex identifier for analytics tracing.
- Timestamp: 4-byte unix timestamp prepended before origin.

- `encodeForceDeallocateCall(deallocation, onBehalf)` — ABI-encodes a single `VaultV2.forceDeallocate` calldata entry.
- `Deallocation` interface: `{ adapter, assets, marketParams? }`. When `marketParams` is present, `data` is ABI-encoded `MarketParams` (Morpho Market V1 adapter); when omitted, empty bytes are used (e.g. Vault V1 adapters).

- `computeMaxRepaySharePrice(repayAssets, repayShares, market, slippageTolerance)` — computes maximum repay share price in RAY. Dual mode: by assets (derives shares via `toBorrowShares("Down")`) or by shares (derives assets via `toBorrowAssets("Up")`). Uses `WAD + slippage` (upper bound, opposite of borrow's lower bound). Capped at `MAX_ABSOLUTE_SHARE_PRICE`.

- `validatePositionHealthAfterWithdraw(positionData, withdrawAmount, lltv)` — validates position stays healthy after collateral withdrawal. Skips check when `borrowAssets === 0n` (no debt). Throws `MissingMarketPriceError` or `WithdrawMakesPositionUnhealthyError`.

- `validateRepayAmount(accrualPosition, repayAmount, marketId)` — validates repay amount does not exceed outstanding debt. Throws `RepayExceedsDebtError`.

- `validateRepayShares(accrualPosition, repayShares, marketId)` — validates repay shares do not exceed outstanding borrow shares. Throws `RepaySharesExceedDebtError`.

- `constant.ts` — shared constants:

  - `MAX_SLIPPAGE_TOLERANCE` = 10% (WAD/10). For vault deposit share price.
  - `DEFAULT_LLTV_BUFFER` = 0.5% (WAD/200). Hardcoded safety margin below LLTV for `supplyCollateralBorrow`.
  - `MAX_ABSOLUTE_SHARE_PRICE` = 100 RAY. Cap for `computeMaxRepaySharePrice`.

- `validateReallocations(reallocations: VaultReallocation[], targetMarketId: MarketId)` — validates reallocation parameters before encoding. Called by `marketV1Borrow` and `marketV1SupplyCollateralBorrow`. Checks (per reallocation, per withdrawal):
  1. `r.fee >= 0n` → throws `NegativeReallocationFeeError(vault)`.
  2. `r.withdrawals.length > 0` → throws `EmptyReallocationWithdrawalsError(vault)`.
  3. `w.amount > 0n` → throws `NonPositiveReallocationAmountError(vault, marketId)`.
  4. `w.marketParams.id !== targetMarketId` → throws `ReallocationWithdrawalOnTargetMarketError(vault, marketId)`.

## Key Constraints

- Pure functions. Return new objects — never mutate inputs.
- `encodeDeallocateData` is internal; only `encodeForceDeallocateCall`.
