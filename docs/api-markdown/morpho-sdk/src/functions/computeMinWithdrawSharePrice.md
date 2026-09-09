[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / computeMinWithdrawSharePrice

# Function: computeMinWithdrawSharePrice()

> **computeMinWithdrawSharePrice**(`params`): `bigint`

Defined in: [packages/morpho-sdk/src/helpers/slippage.ts:174](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/slippage.ts#L174)

Computes the minimum withdraw share price (in RAY, 1e27) for slippage protection.

Mirrors the on-chain check in GeneralAdapter1's `morphoWithdraw`:
```solidity
require(withdrawnAssets.rDivDown(withdrawnShares) >= minSharePriceE27)
```

Supports both assets and shares modes:
- By assets: derives expected shares via `toSupplyShares("Up")` (upper bound, protects the
  withdrawer against over-burning shares).
- By shares: derives expected assets via `toSupplyAssets("Down")` (lower bound, the on-chain
  amount paid out).

Direction is opposite of supply's `maxSharePrice`:
- Supply uses `(WAD + slippage)` → upper bound (anti-inflation).
- Withdraw uses `(WAD − slippage)` → lower bound (protects withdrawer from receiving too few
  assets per share burned).

## Parameters

### params

Computation parameters.

#### market

[`Market`](../../../blue-sdk/src/classes/Market.md)

The market to compute the minimum withdraw share price for.

#### slippageTolerance

`bigint`

Slippage tolerance in WAD (e.g. `0.003e18` = 0.3%).

#### withdrawAssets

`bigint`

The amount of assets to withdraw (`0n` when withdrawing by shares).

#### withdrawShares

`bigint`

The amount of shares to withdraw (`0n` when withdrawing by assets).

## Returns

`bigint`

`minSharePriceE27` in RAY scale (1e27).

## Throws

when `slippageTolerance >= WAD`.

## Throws

when expected shares round down to zero.
