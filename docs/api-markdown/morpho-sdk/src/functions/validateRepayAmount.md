[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateRepayAmount

# Function: validateRepayAmount()

> **validateRepayAmount**(`params`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:301](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L301)

Validates that the repay amount assets does not exceed the outstanding debt.

## Parameters

### params

Validation parameters.

#### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

The market identifier (for error messages).

#### positionData

[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)

The current accrual position.

#### repayAssets

`bigint`

The amount of assets to repay.

## Returns

`void`
