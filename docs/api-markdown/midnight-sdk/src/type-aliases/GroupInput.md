[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / GroupInput

# Type Alias: GroupInput

> **GroupInput** = [`IGroup`](../interfaces/IGroup.md) \| [`IOffer`](../interfaces/IOffer.md)

Defined in: [packages/midnight-sdk/src/signatures/GroupUtils.ts:91](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/GroupUtils.ts#L91)

Group object or standalone offer accepted by tree helpers.

Use standalone offers for independent consumption groups. Use `Group.create`
first when multiple offers from the same maker, side, loan token, cap mode,
and cap value should share one consumption group.

## Example

```ts
import { Offer, type GroupInput } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

const input: GroupInput = Offer.create({
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
console.log(input);
```
