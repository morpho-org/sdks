[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / getMidnightAuthorizationRequirement

# Function: getMidnightAuthorizationRequirement()

> **getMidnightAuthorizationRequirement**(`params`): `Promise`\<`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightAuthorizationAction`](../interfaces/MidnightAuthorizationAction.md)\>\> \| `null`\>

Defined in: [packages/morpho-sdk/src/actions/requirements/midnight/getMidnightAuthorizationRequirement.ts:54](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/midnight/getMidnightAuthorizationRequirement.ts#L54)

Resolves the Midnight authorization transaction for a ratifier or bundle spender.

Call before actions that rely on `Midnight.isAuthorized(owner, authorized)`,
such as bundle takes or Ecrecover offer-root ratification. Entity flows call
this from `getRequirements()` and omit the transaction when authorization is
already set.

## Parameters

### params

[`GetMidnightAuthorizationRequirementParams`](../interfaces/GetMidnightAuthorizationRequirementParams.md)

## Returns

`Promise`\<`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightAuthorizationAction`](../interfaces/MidnightAuthorizationAction.md)\>\> \| `null`\>

Authorization transaction, or `null` when already authorized.

## Throws

when the viem client is connected to another chain.

## Throws

when `authorized` is not a supported bundle or ratifier address.

## Example

```ts
import { getMidnightAuthorizationRequirement } from "@morpho-org/morpho-sdk";

const tx = await getMidnightAuthorizationRequirement({
  viemClient: client,
  chainId: 8453,
  owner: user,
  authorized: midnightBundles,
});
if (tx) {
  await walletClient.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value,
  });
}
```
