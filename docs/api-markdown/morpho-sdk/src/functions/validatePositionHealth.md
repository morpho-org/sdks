[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validatePositionHealth

# Function: validatePositionHealth()

> **validatePositionHealth**(`params`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:153](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L153)

Validates that the resulting position stays within the safe LTV threshold
(LLTV minus buffer) after supplying additional collateral and borrowing.

## Parameters

### params

Validation parameters.

#### additionalCollateral

`bigint`

Amount of collateral being added.

#### borrowAmount

`bigint`

Amount being borrowed.

#### lltv

`bigint`

The market's liquidation LTV.

#### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

The market identifier (for error messages).

#### positionData

[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)

The current accrual position with market data.

## Returns

`void`
