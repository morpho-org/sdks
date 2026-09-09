[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [Payload](../README.md) / Item

# Type Alias: Item

> **Item** = `object`

Defined in: [packages/midnight-sdk/src/signatures/Payload.ts:77](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Payload.ts#L77)

One mempool payload item: a maker-side `Offer` together with the opaque
`ratifierData` blob a taker hands to `Midnight.take(..., ratifierData)`.

`ratifierData` is owned by the ratifier scheme the maker used (e.g.
`EcrecoverRatifierUtils.ratifierData`). The payload codec treats it as
opaque bytes — simulators that only need to forward `ratifierData` can
stay completely ratifier-agnostic.

Build items with `EcrecoverRatifierUtils.ratify` or
`SetterRatifierUtils.ratify` after the tree is signed or approved, then pass
the items to `Payload.encode` for publication.

## Example

```ts
import { Offer, type Payload } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

const offer = Offer.create({
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
  expiry: 3_600n,
  ratifier: "0x0000000000000000000000000000000000004000",
  maxUnits: 100n,
});
const item: Payload.Item = {
  offer,
  ratifierData: "0x",
};
console.log(item.ratifierData);
```

## Properties

### offer

> `readonly` **offer**: [`IOffer`](../../../interfaces/IOffer.md)

Defined in: [packages/midnight-sdk/src/signatures/Payload.ts:79](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Payload.ts#L79)

Maker-side offer carried by the payload.

***

### ratifierData

> `readonly` **ratifierData**: `Hex`

Defined in: [packages/midnight-sdk/src/signatures/Payload.ts:81](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Payload.ts#L81)

Opaque ratifier data passed to `Midnight.take`.
