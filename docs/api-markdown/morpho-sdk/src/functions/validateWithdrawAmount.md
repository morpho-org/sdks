[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateWithdrawAmount

# Function: validateWithdrawAmount()

> **validateWithdrawAmount**(`params`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:595](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L595)

Validates that the withdraw assets do not exceed the user's supplied assets in the market.

## Parameters

### params

Validation parameters.

#### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

The market identifier (for error messages).

#### positionData

[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)

The current accrual position.

#### withdrawAssets

`bigint`

The amount of assets to withdraw.

## Returns

`void`

## Throws

when `withdrawAssets > positionData.supplyAssets`.
