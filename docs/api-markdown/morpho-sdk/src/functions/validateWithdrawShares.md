[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateWithdrawShares

# Function: validateWithdrawShares()

> **validateWithdrawShares**(`params`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:619](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L619)

Validates that the withdraw shares do not exceed the user's owned supply shares in the market.

## Parameters

### params

Validation parameters.

#### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

The market identifier (for error messages).

#### positionData

[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)

The current accrual position.

#### withdrawShares

`bigint`

The amount of shares to withdraw.

## Returns

`void`

## Throws

when `withdrawShares > positionData.supplyShares`.
