[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / MarketInput

# Type Alias: MarketInput

> **MarketInput** = [`IMarketParams`](../interfaces/IMarketParams.md) \| [`IMarket`](../interfaces/IMarket.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:415](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L415)

Plain market params or hydrated market object accepted by market helpers.

## Example

```ts
import type { MarketInput } from "@morpho-org/midnight-sdk";

const market: MarketInput = {
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
};
console.log(market.loanToken);
```
