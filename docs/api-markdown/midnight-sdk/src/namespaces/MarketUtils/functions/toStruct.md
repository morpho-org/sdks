[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [MarketUtils](../README.md) / toStruct

# Function: toStruct()

> **toStruct**(`market`): [`MarketParams`](../../../classes/MarketParams.md)

Defined in: [packages/midnight-sdk/src/market/MarketUtils.ts:159](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/MarketUtils.ts#L159)

Converts market params into the tuple object expected by viem ABI encoders.

## Parameters

### market

[`MarketInput`](../../../type-aliases/MarketInput.md)

Market params or hydrated market.

## Returns

[`MarketParams`](../../../classes/MarketParams.md)

ABI-compatible market params.

## Example

```ts
import { MarketUtils } from "@morpho-org/midnight-sdk";

const struct = MarketUtils.toStruct({
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
});
console.log(struct.maturity);
```
