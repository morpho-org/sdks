[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / blueSupply

# Function: blueSupply()

> **blueSupply**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueSupplyAction`](../interfaces/BlueSupplyAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/blue/supply.ts:81](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supply.ts#L81)

Prepares a loan-asset supply transaction for a Morpho Blue market.

Routed through bundler3 via `GeneralAdapter1`. When `nativeAmount > 0`, native ETH is wrapped
via `GeneralAdapter1.wrapNative()` before the supply; the loan token must be the chain's
wNative for that path. Uses `maxSharePrice` to protect against share-price inflation between
transaction construction and execution.

Zero loss: all supplied assets reach Morpho. No dust left in bundler or adapter.

## Parameters

### \_\_namedParameters

[`BlueSupplyParams`](../interfaces/BlueSupplyParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueSupplyAction`](../interfaces/BlueSupplyAction.md)\>\>

A deep-frozen `Transaction<BlueSupplyAction>` with `to`, `value`, `data`, and the
  typed `action` discriminator the simulation layer consumes.

## Throws

when `amount`, `nativeAmount`, or `maxSharePrice` is negative.

## Throws

when both `amount` and `nativeAmount` resolve to zero.

## Throws

when `nativeAmount > 0n` but the chain has no configured wNative.

## Throws

when `nativeAmount > 0n` but the loan token is not
  the chain's wNative.

## Throws

from `getTokenRequirementActions` when `requirementSignature`
  is provided and the signed asset differs from `marketParams.loanToken`.

## Throws

from `getTokenRequirementActions` when `requirementSignature`
  is provided and the signed amount differs from `args.amount`.

## Example

```ts
import { blueSupply } from "@morpho-org/morpho-sdk";

const tx = blueSupply({
  market: { chainId: 1, marketParams },
  args: {
    amount: 1_000_000_000n,
    onBehalf: supplier,
    maxSharePrice: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
  },
});
// tx satisfies Readonly<Transaction<BlueSupplyAction>>
```
