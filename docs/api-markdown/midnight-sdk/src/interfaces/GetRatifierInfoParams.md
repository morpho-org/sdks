[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / GetRatifierInfoParams

# Interface: GetRatifierInfoParams

Defined in: [packages/midnight-sdk/src/signatures/RatifierUtils.ts:88](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/RatifierUtils.ts#L88)

Parameters for [RatifierUtils.getRatifierInfo](../namespaces/RatifierUtils/functions/getRatifierInfo.md).

Pass the maker account bytecode read at the same block context used to build
the offer. The bytecode is used only to choose the ratifier address to put on
the offer.

## Example

```ts
import type { GetRatifierInfoParams } from "@morpho-org/midnight-sdk";

const params: GetRatifierInfoParams = {
  bytecode: "0x",
  ecrecoverRatifier: "0x0000000000000000000000000000000000000001",
  setterRatifier: "0x0000000000000000000000000000000000000002",
};
console.log(params.bytecode);
```

## Properties

### bytecode?

> `readonly` `optional` **bytecode?**: `` `0x${string}` `` \| `null`

Defined in: [packages/midnight-sdk/src/signatures/RatifierUtils.ts:90](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/RatifierUtils.ts#L90)

Maker account bytecode returned by viem `getBytecode`; `undefined`, `null`, and `0x` mean no deployed code.

***

### ecrecoverRatifier

> `readonly` **ecrecoverRatifier**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/RatifierUtils.ts:92](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/RatifierUtils.ts#L92)

Ecrecover ratifier address.

***

### setterRatifier

> `readonly` **setterRatifier**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/RatifierUtils.ts:94](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/RatifierUtils.ts#L94)

Setter ratifier address.
