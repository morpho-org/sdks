# MarketV1 (Morpho Blue) Operations

> Parent: [`src/actions/AGENTS.md`](../AGENTS.md)

Pure transaction builders for Morpho Blue market interactions.

## Functions

### `marketV1SupplyCollateral`

Always routed through bundler3 via GeneralAdapter1.

| Scenario            | Actions                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| ERC20-only          | `erc20TransferFrom` + `morphoSupplyCollateral`                                   |
| With `nativeAmount` | `nativeTransfer` + `wrapNative` + (optional `erc20TransferFrom`) + `morphoSupplyCollateral` |

- `DepositAmountArgs`: at least one of `amount` / `nativeAmount`.
- Collateral token must be wNative for native wrapping.
- Spender for ERC20 approval: **GeneralAdapter1** (not Morpho contract).
- Zero loss: exact `totalCollateral` reaches Morpho.

### `marketV1Borrow`

Routed through bundler3 via `morphoBorrow`. Specifies exact asset amount (`shares = 0`).

- GeneralAdapter1 must be authorized on Morpho (`setAuthorization`).
- Uses `minSharePrice` (computed from market state + slippage tolerance) for slippage protection.
- `morphoBorrow` args: `[marketParams, amount, 0n (shares), minSharePrice, receiver, false]`.

**With reallocations** (`reallocations?: VaultReallocation[]`):
Bundle: `[reallocateTo × N] → morphoBorrow`. Each `reallocateTo` calls `PublicAllocator.reallocateTo(vault, fee, withdrawals, targetMarket)`. Fees summed as `tx.value`. Validated via `validateReallocations()`.

### `marketV1SupplyCollateralBorrow`

Atomic bundled: collateral transfer + `morphoSupplyCollateral` + `morphoBorrow`.

- GeneralAdapter1 must be authorized on Morpho (`setAuthorization`).
- `morphoBorrow` args: `[marketParams, borrowAmount, 0n (shares), minSharePrice, receiver, false]`.
- `onBehalf` for supply collateral = user. Borrow `onBehalf` = initiator (handled by adapter).
- Supports `nativeAmount` wrapping for collateral.
- Zero loss: all collateral to Morpho, all borrowed tokens to receiver.

**With reallocations** (`reallocations?: VaultReallocation[]`):
Bundle: `[nativeWrap?] → [erc20Transfer?] → morphoSupplyCollateral → [reallocateTo × N] → morphoBorrow`. Reallocations inserted between supply and borrow. `tx.value = (nativeAmount ?? 0n) + reallocationFee`.

## Common Pattern

1. **Validate** inputs (dedicated errors).
2. **Encode** calldata via `BundlerAction.encodeBundle`.
3. **Append metadata** if provided.
4. **Deep-freeze** and return `{ ...tx, action: { type, args } }`.
