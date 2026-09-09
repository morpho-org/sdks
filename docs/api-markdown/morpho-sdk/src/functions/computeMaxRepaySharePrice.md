[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / computeMaxRepaySharePrice

# Function: computeMaxRepaySharePrice()

> **computeMaxRepaySharePrice**(`params`): `bigint`

Defined in: [packages/morpho-sdk/src/helpers/slippage.ts:66](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/slippage.ts#L66)

Computes the maximum repay share price (in RAY, 1e27) for slippage protection.

Supports both repay-by-assets and repay-by-shares paths:
- By assets: derives expected shares from the repay amount via `toBorrowShares("Down")`.
- By shares: derives expected assets from the shares via `toBorrowAssets("Up")`.

Direction is opposite of borrow's `minSharePrice`:
- Borrow uses `(WAD - slippage)` → lower bound (protects borrower from getting fewer assets per share).
- Repay uses `(WAD + slippage)` → upper bound (protects repayer from paying too many assets per share).

Capped at [MAX\_ABSOLUTE\_SHARE\_PRICE](../variables/MAX_ABSOLUTE_SHARE_PRICE.md) to prevent absurd values.

## Parameters

### params

Computation parameters.

#### market

[`Market`](../../../blue-sdk/src/classes/Market.md)

The market to compute the maximum repay share price for.

#### repayAssets

`bigint`

The amount of assets to repay (0n when repaying by shares).

#### repayShares

`bigint`

The amount of shares to repay (0n when repaying by assets).

#### slippageTolerance

`bigint`

Slippage tolerance in WAD (e.g. 0.003e18 = 0.3%).

## Returns

`bigint`

maxSharePriceE27 in RAY scale (1e27).
