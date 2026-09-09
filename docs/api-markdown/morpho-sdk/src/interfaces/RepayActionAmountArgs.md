[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / RepayActionAmountArgs

# Interface: RepayActionAmountArgs

Defined in: [packages/morpho-sdk/src/types/action.ts:328](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L328)

Repay funding sources for the **action layer** (`blueRepay` /
`blueRepayWithdrawCollateral`) — a flat, pre-resolved shape. The entity layer
([RepayAmountArgs](../type-aliases/RepayAmountArgs.md)) derives these from live market state; the action does no
amount arithmetic. The mode is discriminated on `shares`:

- **assets mode** (`shares` unset/`0n`): repays `transferAmount` assets
  (`= amount + nativeAmount`, additive like `blueSupply`), pulling `amount` ERC-20
  and wrapping `nativeAmount`. No residual.
- **shares mode** (`shares > 0n`): repays an exact borrow-share count (full close),
  pulling `transferAmount` ERC-20 (already net of native) and wrapping `nativeAmount`;
  the residual loan token is skimmed back to `receiver`.

`nativeAmount` requires the market's loan token to be the chain's wNative.

## Properties

### amount?

> `optional` **amount?**: `bigint`

Defined in: [packages/morpho-sdk/src/types/action.ts:330](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L330)

Assets-mode ERC-20 loan tokens pulled from the payer. Omit (or `0n`) in shares mode.

***

### nativeAmount?

> `optional` **nativeAmount?**: `bigint`

Defined in: [packages/morpho-sdk/src/types/action.ts:334](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L334)

Native ETH wrapped into wNative to help fund the repay. Loan token must be wNative.

***

### shares?

> `optional` **shares?**: `bigint`

Defined in: [packages/morpho-sdk/src/types/action.ts:332](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L332)

Shares-mode borrow shares to repay (full close). Omit (or `0n`) in assets mode.

***

### transferAmount

> **transferAmount**: `bigint`

Defined in: [packages/morpho-sdk/src/types/action.ts:340](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L340)

Loan tokens routed into `GeneralAdapter1`. Assets mode: the total repaid
(`amount + nativeAmount`). Shares mode: the ERC-20 pulled
(`toBorrowAssets(shares) − nativeAmount`).
