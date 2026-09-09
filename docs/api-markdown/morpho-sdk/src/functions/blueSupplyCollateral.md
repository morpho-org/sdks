[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / blueSupplyCollateral

# Function: blueSupplyCollateral()

> **blueSupplyCollateral**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueSupplyCollateralAction`](../interfaces/BlueSupplyCollateralAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/blue/supplyCollateral.ts:74](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supplyCollateral.ts#L74)

Prepares a supply-collateral transaction for a Morpho Blue market.

Routed through bundler3 via `GeneralAdapter1`. When `nativeAmount > 0`, native ETH is wrapped
via `GeneralAdapter1.wrapNative()` before the collateral supply; the collateral token must be
the chain's wNative for that path.

Zero loss: all collateral reaches Morpho. No dust left in bundler or adapter.

## Parameters

### \_\_namedParameters

[`BlueSupplyCollateralParams`](../interfaces/BlueSupplyCollateralParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueSupplyCollateralAction`](../interfaces/BlueSupplyCollateralAction.md)\>\>

A deep-frozen `Transaction<BlueSupplyCollateralAction>` with `to`, `value`, `data`,
  and the typed `action` discriminator the simulation layer consumes.

## Throws

when `amount < 0n` or `nativeAmount < 0n`.

## Throws

when both `amount` and `nativeAmount` resolve to zero.

## Throws

when `nativeAmount > 0n` but the chain has no configured wNative.

## Throws

when `nativeAmount > 0n` but the collateral
  token is not the chain's wNative.

## Throws

from `getTokenRequirementActions` when `requirementSignature`
  is provided and the signed asset differs from `marketParams.collateralToken`.

## Throws

from `getTokenRequirementActions` when `requirementSignature`
  is provided and the signed amount differs from `args.amount`.

## Throws

from `getTokenRequirementActions` when a Permit2 requirement
  signature is missing its expiration.

## Example

```ts
import { blueSupplyCollateral } from "@morpho-org/morpho-sdk";

const tx = blueSupplyCollateral({
  market: { chainId: 1, marketParams },
  args: { amount: 1_000_000_000_000_000_000n, onBehalf },
});
// tx satisfies Readonly<Transaction<BlueSupplyCollateralAction>>
```
