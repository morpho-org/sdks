[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / RatifierInfo

# Interface: RatifierInfo

Defined in: [packages/midnight-sdk/src/signatures/RatifierUtils.ts:114](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/RatifierUtils.ts#L114)

Classification of the ratifier route for a maker account.

Put `ratifier` on each new `Offer.create` call for this maker. Use `type` to
decide whether the tree later needs an Ecrecover signature or a Setter root
approval before payload encoding.

## Example

```ts
import type { RatifierInfo } from "@morpho-org/midnight-sdk";

const info: RatifierInfo = {
  type: "ecrecover",
  ratifier: "0x0000000000000000000000000000000000000001",
};
```

## Properties

### ratifier

> `readonly` **ratifier**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/RatifierUtils.ts:118](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/RatifierUtils.ts#L118)

Ratifier contract address to put on the offer.

***

### type

> `readonly` **type**: `"ecrecover"` \| `"setter"`

Defined in: [packages/midnight-sdk/src/signatures/RatifierUtils.ts:116](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/RatifierUtils.ts#L116)

Ratifier family selected for the maker account.
