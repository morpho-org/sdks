[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateAccrualPosition

# Function: validateAccrualPosition()

> **validateAccrualPosition**(`params`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:128](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L128)

Validates that the accrual position belongs to the expected market and user.
Throws [MarketIdMismatchError](../classes/MarketIdMismatchError.md) if the position's market ID
does not match the expected market.
Throws [AccrualPositionUserMismatchError](../classes/AccrualPositionUserMismatchError.md) if the position's user
does not match the expected user.

## Parameters

### params

Validation parameters.

#### expectedMarketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

The market ID the position must belong to.

#### expectedUser

`` `0x${string}` ``

The user address the position must belong to.

#### positionData

[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)

The accrual position to validate.

## Returns

`void`
