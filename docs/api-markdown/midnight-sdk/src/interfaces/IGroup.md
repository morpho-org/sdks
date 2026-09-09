[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / IGroup

# Interface: IGroup

Defined in: [packages/midnight-sdk/src/signatures/GroupUtils.ts:46](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/GroupUtils.ts#L46)

Plain offer group shape accepted by group and tree utilities.

## Example

```ts
import { Offer, type IGroup } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

const group: IGroup = {
  offers: [
    Offer.create({
      market: {
        chainId: 8453,
        midnight: "0x0000000000000000000000000000000000001000",
        loanToken: "0x0000000000000000000000000000000000006000",
        collateralParams: [
          {
            token: "0x0000000000000000000000000000000000007000",
            lltv: 770000000000000000n,
            liquidationCursor: 250000000000000000n,
            oracle: "0x0000000000000000000000000000000000008000",
          },
        ],
        maturity: 54_000n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      },
      buy: true,
      maker: "0x0000000000000000000000000000000000009000",
      tick: 5_000n,
      group: zeroHash,
      expiry: 3_600n,
      ratifier: "0x0000000000000000000000000000000000004000",
      maxUnits: 100n,
    }),
  ],
};
console.log(group.offers.length);
```

## Properties

### offers

> `readonly` **offers**: readonly [`IOffer`](IOffer.md)[]

Defined in: [packages/midnight-sdk/src/signatures/GroupUtils.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/GroupUtils.ts#L48)

Offers in this protocol group. The group id is derived from this list.
