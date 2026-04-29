# MarketV1 (Morpho Blue) Operations

> Parent: [`src/actions/CLAUDE.md`](../CLAUDE.md)

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

Bundle action sequence:
```
1. reallocateTo(vault, fee, withdrawals, targetMarketParams, false)  ← per VaultReallocation
   ...repeat for each reallocation...
2. morphoBorrow(marketParams, amount, 0n, minSharePrice, receiver, false)
```

- `validateReallocations()` is called before encoding (fee >= 0, non-empty withdrawals, each amount > 0).
- `reallocationFee = sum(r.fee)` → set as `tx.value`.
- `reallocateTo` args: `[r.vault, r.fee, r.withdrawals.map(w => ({ marketParams, amount })), targetMarketParams, false]`.
- `reallocationFee` is tracked in `action.args.reallocationFee`.

### `marketV1SupplyCollateralBorrow`

Atomic bundled: collateral transfer + `morphoSupplyCollateral` + `morphoBorrow`.

- GeneralAdapter1 must be authorized on Morpho (`setAuthorization`).
- `morphoBorrow` args: `[marketParams, borrowAmount, 0n (shares), minSharePrice, receiver, false]`.
- `onBehalf` for supply collateral = user. Borrow `onBehalf` = initiator (handled by adapter).
- Supports `nativeAmount` wrapping for collateral.
- Zero loss: all collateral to Morpho, all borrowed tokens to receiver.

**With reallocations** (`reallocations?: VaultReallocation[]`):

Bundle action sequence:
```
1. (optional) nativeTransfer + wrapNative           ← if nativeAmount
2. (optional) erc20TransferFrom / permit actions     ← if ERC20 amount
3. morphoSupplyCollateral(marketParams, totalCollateral, onBehalf, [], false)
4. reallocateTo(vault, fee, withdrawals, targetMarketParams, false)  ← per VaultReallocation
   ...repeat for each reallocation...
5. morphoBorrow(marketParams, borrowAmount, 0n, minSharePrice, receiver, false)
```

- Reallocations are inserted **between** `morphoSupplyCollateral` and `morphoBorrow`.
- `tx.value = (nativeAmount ?? 0n) + reallocationFee` — combines native wrapping and reallocation fees.
- Same validation as `marketV1Borrow` via `validateReallocations()`.
- `reallocationFee` is tracked in `action.args.reallocationFee`.

### `marketV1Repay`

Routed through bundler3 via GeneralAdapter1. Two repay modes:
- **By assets** (`assets > 0, shares = 0`): repays exact asset amount (partial repay).
- **By shares** (`assets = 0, shares > 0`): repays exact shares (full repay, immune to interest accrual).

Exactly one of `assets`/`shares` must be non-zero (mutual exclusion validated).

- `transferAmount` controls ERC20 pull (may differ from `assets` in shares mode where entity computes upper-bound).
- `morphoRepay` args: `[marketParams, assets, shares, maxSharePrice, onBehalf, [], false]`.
- `maxSharePrice` is the upper-bound slippage protection (opposite of borrow's `minSharePrice`).
- No Morpho authorization needed (anyone can repay on behalf of anyone).
- No native wrapping support.
- `tx.value = 0n`.

Bundle action sequence:
```
1. (optional) erc20TransferFrom / permit actions  ← if transferAmount > 0
2. morphoRepay(marketParams, assets, shares, maxSharePrice, onBehalf, [], false)
```

### `marketV1WithdrawCollateral`

Direct call to `morpho.withdrawCollateral()`. No bundler needed — collateral flows out of Morpho directly.

- Caller (`msg.sender`) must be `onBehalf` or authorized by them on Morpho.
- No GeneralAdapter1 authorization needed.
- `withdrawCollateral` args: `[marketParams, amount, onBehalf, receiver]`.
- No ERC20 approval needed (collateral flows out of Morpho).
- No native wrapping, no slippage protection (1:1, no share conversion).
- `tx.value = 0n`.

### `marketV1RepayWithdrawCollateral`

Atomic bundled: ERC20 transfer + `morphoRepay` + `morphoWithdrawCollateral`.

**Bundle order is critical:** repay FIRST reduces debt, then withdraw. If reversed, Morpho reverts because the position would be insolvent at the time of withdraw.

- Same dual repay modes as `marketV1Repay` (assets or shares).
- Requires both loan token approval (for repay) and Morpho authorization (for withdraw).
- No native wrapping support.
- `tx.value = 0n`.

Bundle action sequence:
```
1. (optional) erc20TransferFrom / permit actions  ← if transferAmount > 0
2. morphoRepay(marketParams, assets, shares, maxSharePrice, onBehalf, [], false)
3. morphoWithdrawCollateral(marketParams, withdrawAmount, receiver, false)
```
## Common Pattern

1. **Validate** inputs (dedicated errors).
2. **Encode** calldata (`BundlerAction.encodeBundle` for bundler, `encodeFunctionData` for direct).
3. **Append metadata** if provided.
4. **Deep-freeze** and return `{ ...tx, action: { type, args } }`.
