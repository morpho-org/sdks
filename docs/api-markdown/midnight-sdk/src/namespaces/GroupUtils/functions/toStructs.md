[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [GroupUtils](../README.md) / toStructs

# Function: toStructs()

> **toStructs**(`group`): readonly [`OfferStruct`](../../../interfaces/OfferStruct.md)[]

Defined in: [packages/midnight-sdk/src/signatures/GroupUtils.ts:267](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/GroupUtils.ts#L267)

Converts a group into ABI-compatible offers carrying the derived group id.

Use after `Group.create` for custom encoders that need offer structs with
their final group id. The id is derived from the full offer list and
applied while encoding, so plain groups cannot drift from offer fields.

This helper is encode-only and does not validate protocol group mechanics.
Validate with `Group.create` or [OfferUtils.validateOfferGroup](../../OfferUtils/functions/validateOfferGroup.md)
before relying on the output for signing, tree roots, or calldata.

## Parameters

### group

[`IGroup`](../../../interfaces/IGroup.md)

Group to encode.

## Returns

readonly [`OfferStruct`](../../../interfaces/OfferStruct.md)[]

ABI-compatible offers in caller order.

## Throws

when the group has no offers.

## Example

```ts
import { Group, GroupUtils, Offer } from "@morpho-org/midnight-sdk";
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
const structs = GroupUtils.toStructs(Group.create([offer]));
console.log(structs.length);
```
