[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validatePositionHealthAfterWithdraw

# Function: validatePositionHealthAfterWithdraw()

> **validatePositionHealthAfterWithdraw**(`params`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:240](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L240)

Validates that the resulting position stays within the safe LTV threshold
(LLTV minus buffer) after withdrawing collateral.

## Parameters

### params

Validation parameters.

#### lltv

`bigint`

The market's liquidation LTV.

#### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

The market identifier (for error messages).

#### positionData

[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)

The current accrual position with market data.

#### withdrawAmount

`bigint`

Amount of collateral being withdrawn.

## Returns

`void`
