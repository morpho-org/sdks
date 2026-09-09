[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / midnightRedeem

# Function: midnightRedeem()

> **midnightRedeem**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightRedeemAction`](../interfaces/MidnightRedeemAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/midnight/redeem.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/redeem.ts#L57)

Encodes a direct Midnight credit redemption.

Use this low-level builder after the caller has fetched and checked position
credit and market withdrawable liquidity. App flows should usually call
`client.morpho.midnight(chainId).redeem(...)`, which performs those checks
from the supplied `positionData` snapshot before exposing `buildTx`.

## Parameters

### params

[`MidnightRedeemParams`](../interfaces/MidnightRedeemParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightRedeemAction`](../interfaces/MidnightRedeemAction.md)\>\>

A deep-frozen `Transaction<MidnightRedeemAction>` targeting `Midnight`.

## Throws

when `units <= 0n`.

## Throws

when the market targets another chain.

## Throws

when the market targets another Midnight deployment.

## Example

```ts
import { midnightRedeem } from "@morpho-org/morpho-sdk";

const tx = midnightRedeem({
  chainId: 8453,
  market: marketData.params,
  units: positionData.faceValue,
  onBehalf: user,
});
```
