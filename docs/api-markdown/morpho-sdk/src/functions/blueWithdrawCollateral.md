[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / blueWithdrawCollateral

# Function: blueWithdrawCollateral()

> **blueWithdrawCollateral**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueWithdrawCollateralAction`](../interfaces/BlueWithdrawCollateralAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/blue/withdrawCollateral.ts:59](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/withdrawCollateral.ts#L59)

Prepares a withdraw-collateral transaction for a Morpho Blue market.

Direct call to `Morpho.withdrawCollateral` — no bundler needed. Collateral flows out of Morpho,
so there is no inflation-attack surface requiring the bundler.

The caller (`msg.sender`) must be `onBehalf` or be authorized by them on Morpho.

## Parameters

### \_\_namedParameters

[`BlueWithdrawCollateralParams`](../interfaces/BlueWithdrawCollateralParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueWithdrawCollateralAction`](../interfaces/BlueWithdrawCollateralAction.md)\>\>

A deep-frozen `Transaction<BlueWithdrawCollateralAction>` with `to`, `value`,
  `data`, and the typed `action` discriminator the simulation layer consumes.

## Throws

when `amount <= 0n`.

## Example

```ts
import { blueWithdrawCollateral } from "@morpho-org/morpho-sdk";

const tx = blueWithdrawCollateral({
  market: { chainId: 1, marketParams },
  args: {
    amount: 1_000_000_000_000_000_000n,
    onBehalf: borrower,
    receiver: borrower,
  },
});
// tx satisfies Readonly<Transaction<BlueWithdrawCollateralAction>>
```
