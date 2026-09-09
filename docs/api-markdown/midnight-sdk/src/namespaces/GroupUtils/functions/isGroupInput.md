[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [GroupUtils](../README.md) / isGroupInput

# Function: isGroupInput()

> **isGroupInput**(`entry`): `entry is IGroup`

Defined in: [packages/midnight-sdk/src/signatures/GroupUtils.ts:157](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/GroupUtils.ts#L157)

Returns whether an entry is an explicit group rather than a standalone offer.

Plain offer objects can also contain incidental `offers` properties, so the
discriminant must reject values that still carry the offer `market` field.

## Parameters

### entry

[`GroupInput`](../../../type-aliases/GroupInput.md)

Group or offer input to inspect.

## Returns

`entry is IGroup`

Whether `entry` is an explicit group input.

## Example

```ts
import { GroupUtils, Offer } from "@morpho-org/midnight-sdk";

const offer = Offer.from({
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
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  buy: true,
  maker: "0x0000000000000000000000000000000000009000",
  start: 0n,
  expiry: 3_600n,
  tick: 5_000n,
  callback: "0x0000000000000000000000000000000000000000",
  callbackData: "0x",
  receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
  ratifier: "0x0000000000000000000000000000000000004000",
  reduceOnly: false,
  maxUnits: 100n,
  maxAssets: 0n,
  continuousFeeCap: 0n,
});
console.log(GroupUtils.isGroupInput(offer));
```
