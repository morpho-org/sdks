[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / computeMinBorrowSharePrice

# Function: computeMinBorrowSharePrice()

> **computeMinBorrowSharePrice**(`params`): `bigint`

Defined in: [packages/morpho-sdk/src/helpers/slippage.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/slippage.ts#L22)

Computes the minimum borrow share price (in RAY, 1e27) for slippage protection.

Mirrors the on-chain check in GeneralAdapter1's `morphoBorrow`:
```solidity
require(borrowedAssets.rDivDown(borrowedShares) >= minSharePriceE27)
```

## Parameters

### params

Computation parameters.

#### borrowAmount

`bigint`

The amount of assets to borrow.

#### market

[`Market`](../../../blue-sdk/src/classes/Market.md)

The market to compute the minimum borrow share price for.

#### slippageTolerance

`bigint`

Slippage tolerance in WAD (e.g. 0.003e18 = 0.3%).

## Returns

`bigint`

minSharePriceE27 in RAY scale (1e27).
