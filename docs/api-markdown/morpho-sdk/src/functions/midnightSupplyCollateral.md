[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / midnightSupplyCollateral

# Function: midnightSupplyCollateral()

> **midnightSupplyCollateral**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightSupplyCollateralAction`](../interfaces/MidnightSupplyCollateralAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/midnight/supplyCollateral.ts:59](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/supplyCollateral.ts#L59)

Encodes a direct Midnight collateral supply.

Use this low-level builder when a flow already knows the market, collateral
index, and approval state. App flows should usually call
`client.morpho.midnight(chainId).supplyCollateral(...)`, which resolves the
ERC20 approval requirement before exposing `buildTx`.

## Parameters

### params

[`MidnightSupplyCollateralParams`](../interfaces/MidnightSupplyCollateralParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightSupplyCollateralAction`](../interfaces/MidnightSupplyCollateralAction.md)\>\>

A deep-frozen `Transaction<MidnightSupplyCollateralAction>` targeting `Midnight`.

## Throws

when `assets <= 0n`.

## Throws

when the market targets another chain.

## Throws

when the market targets another Midnight deployment.

## Throws

when `collateralIndex` is not configured on the market.

## Example

```ts
import { midnightSupplyCollateral } from "@morpho-org/morpho-sdk";

const tx = midnightSupplyCollateral({
  chainId: 8453,
  market: marketData.params,
  collateralIndex: 0n,
  assets: 2_000_000n,
  onBehalf: user,
});
```
