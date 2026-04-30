# Helpers Layer

> Full context: [AGENTS.md](../../AGENTS.md)

Utility functions shared across layers.

## Intent

- `addTransactionMetadata(tx, metadata)` — concatenates hex-encoded origin + optional timestamp to `tx.data`.
- Origin: max 4 bytes hex identifier for analytics tracing.
- Timestamp: 4-byte unix timestamp prepended before origin.

- `encodeForceDeallocateCall(deallocation, onBehalf)` — ABI-encodes a single `VaultV2.forceDeallocate` calldata entry.
- `Deallocation` interface: `{ adapter, assets, marketParams? }`. When `marketParams` is present, `data` is ABI-encoded `MarketParams` (Morpho Market V1 adapter); when omitted, empty bytes are used (e.g. Vault V1 adapters).

- `constant.ts` — shared constants:

  - `MAX_SLIPPAGE_TOLERANCE` = 10% (WAD/10). For vault deposit share price.
  - `DEFAULT_LLTV_BUFFER` = 0.5% (WAD/200). Hardcoded safety margin below LLTV for `supplyCollateralBorrow`.

- `validateReallocations(reallocations, targetMarketId)` — validates reallocation params: fee >= 0, non-empty withdrawals, positive amounts, no withdrawal on the borrow target market, and withdrawal market IDs must be strictly ascending (required by `PublicAllocator.reallocateTo`). Throws `NegativeReallocationFeeError`, `EmptyReallocationWithdrawalsError`, `NonPositiveReallocationAmountError`, `ReallocationWithdrawalOnTargetMarketError`.

## Key Constraints

- Pure functions. Return new objects — never mutate inputs.
- `encodeDeallocateData` is internal; only `encodeForceDeallocateCall`.
