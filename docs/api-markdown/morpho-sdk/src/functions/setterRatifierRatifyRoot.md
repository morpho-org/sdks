[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / setterRatifierRatifyRoot

# Function: setterRatifierRatifyRoot()

> **setterRatifierRatifyRoot**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`SetterRatifierRatifyRootAction`](../interfaces/SetterRatifierRatifyRootAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts:49](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts#L49)

Encodes a SetterRatifier root-ratification transaction.

Use this after building a Setter-ratified offer tree and before submitting
its mempool payload. Entity make-offer flows expose the same transaction
through `getRequirements()` when the root is not already approved.

## Parameters

### params

[`SetterRatifierRatifyRootParams`](../interfaces/SetterRatifierRatifyRootParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`SetterRatifierRatifyRootAction`](../interfaces/SetterRatifierRatifyRootAction.md)\>\>

A deep-frozen `Transaction<SetterRatifierRatifyRootAction>` targeting `SetterRatifier`.

## Example

```ts
import { setterRatifierRatifyRoot } from "@morpho-org/morpho-sdk";

const tx = setterRatifierRatifyRoot({
  chainId: 8453,
  maker,
  root,
});
```
