[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [GroupUtils](../README.md) / hash

# Function: hash()

> **hash**(`offers`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/GroupUtils.ts:204](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/GroupUtils.ts#L204)

Derives the deterministic content-addressed id for a group of offers.

This mirrors the router implementation: hash each offer with `group = 0`,
sort those hashes, concatenate them, then keccak the result.

## Parameters

### offers

`Iterable`\<[`IOffer`](../../../interfaces/IOffer.md)\>

Offers to hash as one group.

## Returns

`` `0x${string}` ``

Content-addressed group id.

## Throws

when `offers` is empty.

## Example

```ts
import { GroupUtils, Offer } from "@morpho-org/midnight-sdk";
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
const id = GroupUtils.hash([offer]);
console.log(id);
```
