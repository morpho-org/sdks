[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getMarketId

# Function: getMarketId()

> **getMarketId**(`market`): [`MarketId`](../../../type-aliases/MarketId.md)

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L38)

Returns the id of a market based on its params.

## Parameters

### market

[`IMarketParams`](../../../interfaces/IMarketParams.md)

The market params.

## Returns

[`MarketId`](../../../type-aliases/MarketId.md)

The deterministic Morpho Blue market id.

## Example

```ts
import { MarketUtils } from "@morpho-org/blue-sdk";

const marketParams = {
  loanToken: "0x0000000000000000000000000000000000000001",
  collateralToken: "0x0000000000000000000000000000000000000002",
  oracle: "0x0000000000000000000000000000000000000003",
  irm: "0x0000000000000000000000000000000000000004",
  lltv: 860_000_000_000_000_000n,
} as const;

const id = MarketUtils.getMarketId(marketParams);
// id satisfies MarketId
```
