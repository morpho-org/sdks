[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateRepayShares

# Function: validateRepayShares()

> **validateRepayShares**(`params`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:324](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L324)

Validates that the repay shares do not exceed the outstanding borrow shares.

## Parameters

### params

Validation parameters.

#### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

The market identifier (for error messages).

#### positionData

[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)

The current accrual position.

#### repayShares

`bigint`

The amount of shares to repay.

## Returns

`void`
