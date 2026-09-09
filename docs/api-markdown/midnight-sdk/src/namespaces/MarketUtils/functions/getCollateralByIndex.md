[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getCollateralByIndex

# Function: getCollateralByIndex()

> **getCollateralByIndex**(`market`, `index`): [`CollateralParams`](../../../interfaces/CollateralParams.md)

Defined in: [packages/midnight-sdk/src/market/MarketUtils.ts:210](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/MarketUtils.ts#L210)

Returns configured collateral by index.

## Parameters

### market

[`MarketInput`](../../../type-aliases/MarketInput.md)

Market params or hydrated market.

### index

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Collateral index to look up.

## Returns

[`CollateralParams`](../../../interfaces/CollateralParams.md)

Collateral entry for the configured index.

## Throws

when the index is not configured.

## Example

```ts
import { MarketUtils } from "@morpho-org/midnight-sdk";

const collateral = MarketUtils.getCollateralByIndex({
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
}, 0n);
console.log(collateral.token);
```
