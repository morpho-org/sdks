[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [MarketUtils](../README.md) / toId

# Function: toId()

> **toId**(`market`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/MarketUtils.ts:413](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/MarketUtils.ts#L413)

Computes the Midnight id for a market using `IdLib.toId`.

## Parameters

### market

[`MarketInput`](../../../type-aliases/MarketInput.md)

Market to hash.

## Returns

`` `0x${string}` ``

Market id.

## Example

```ts
import { MarketUtils } from "@morpho-org/midnight-sdk";

const id = MarketUtils.toId({
  chainId: 8453,
  midnight: "0x0000000000000000000000000000000000001000",
  loanToken: "0x0000000000000000000000000000000000000001",
  collateralParams: [
    {
      token: "0x0000000000000000000000000000000000000002",
      lltv: 770000000000000000n,
      liquidationCursor: 250000000000000000n,
      oracle: "0x0000000000000000000000000000000000000003",
    },
  ],
  maturity: 1n,
  rcfThreshold: 0n,
  enterGate: "0x0000000000000000000000000000000000000000",
  liquidatorGate: "0x0000000000000000000000000000000000000000",
});
console.log(id);
```
