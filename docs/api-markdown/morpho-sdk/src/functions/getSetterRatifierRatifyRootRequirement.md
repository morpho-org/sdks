[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / getSetterRatifierRatifyRootRequirement

# Function: getSetterRatifierRatifyRootRequirement()

> **getSetterRatifierRatifyRootRequirement**(`params`): `Promise`\<`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`SetterRatifierRatifyRootAction`](../interfaces/SetterRatifierRatifyRootAction.md)\>\> \| `null`\>

Defined in: [packages/morpho-sdk/src/actions/requirements/midnight/getSetterRatifierRatifyRootRequirement.ts:51](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/midnight/getSetterRatifierRatifyRootRequirement.ts#L51)

Resolves the SetterRatifier root approval transaction for a maker offer tree.

Call after building a Setter-ratified tree and before encoding/submitting its
payload. Entity make-offer flows call this from `getRequirements()` and omit
the transaction when the maker has already approved the root.

## Parameters

### params

[`GetSetterRatifierRatifyRootRequirementParams`](../interfaces/GetSetterRatifierRatifyRootRequirementParams.md)

## Returns

`Promise`\<`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`SetterRatifierRatifyRootAction`](../interfaces/SetterRatifierRatifyRootAction.md)\>\> \| `null`\>

Ratify-root transaction, or `null` when the root is already ratified.

## Throws

when the viem client is connected to another chain.

## Example

```ts
import { getSetterRatifierRatifyRootRequirement } from "@morpho-org/morpho-sdk";

const tx = await getSetterRatifierRatifyRootRequirement({
  viemClient: client,
  chainId: 8453,
  maker: user,
  root,
});
if (tx) {
  await walletClient.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value,
  });
}
```
