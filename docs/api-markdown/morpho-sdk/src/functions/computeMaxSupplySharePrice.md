[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / computeMaxSupplySharePrice

# Function: computeMaxSupplySharePrice()

> **computeMaxSupplySharePrice**(`params`): `bigint`

Defined in: [packages/morpho-sdk/src/helpers/slippage.ts:120](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/slippage.ts#L120)

Computes the maximum supply share price (in RAY, 1e27) for slippage protection.

Mirrors the on-chain check in GeneralAdapter1's `morphoSupply`:
```solidity
require(suppliedAssets.rDivUp(suppliedShares) <= maxSharePriceE27)
```

Caps at [MAX\_ABSOLUTE\_SHARE\_PRICE](../variables/MAX_ABSOLUTE_SHARE_PRICE.md) to prevent absurd values on extreme markets.

## Parameters

### params

Computation parameters.

#### market

[`Market`](../../../blue-sdk/src/classes/Market.md)

The market to compute the maximum supply share price for.

#### slippageTolerance

`bigint`

Slippage tolerance in WAD (e.g. `0.003e18` = 0.3%).

#### supplyAssets

`bigint`

The amount of loan assets to supply.

## Returns

`bigint`

`maxSharePriceE27` in RAY scale (1e27).

## Throws

when `slippageTolerance >= WAD`.

## Throws

when expected shares round down to zero.
