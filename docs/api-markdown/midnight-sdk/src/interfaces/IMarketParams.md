[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / IMarketParams

# Interface: IMarketParams

Defined in: [packages/midnight-sdk/src/market/Market.ts:111](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L111)

Plain input accepted by [MarketParams](../classes/MarketParams.md).

## Example

```ts
import type { IMarketParams } from "@morpho-org/midnight-sdk";

const params: IMarketParams = {
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
};
```

## Properties

### chainId

> `readonly` **chainId**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:113](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L113)

EIP-155 chain id captured in the market struct.

***

### collateralParams

> `readonly` **collateralParams**: readonly ([`ICollateralParams`](ICollateralParams.md) \| [`CollateralParams`](CollateralParams.md))[]

Defined in: [packages/midnight-sdk/src/market/Market.ts:119](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L119)

Collateral definitions; `MarketParams` stores them sorted by token and rejects duplicate tokens.

***

### enterGate

> `readonly` **enterGate**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:125](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L125)

Optional entry gate.

***

### liquidatorGate

> `readonly` **liquidatorGate**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:127](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L127)

Optional liquidation gate.

***

### loanToken

> `readonly` **loanToken**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:117](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L117)

Loan token address.

***

### maturity

> `readonly` **maturity**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:121](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L121)

Market maturity timestamp.

***

### midnight

> `readonly` **midnight**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:115](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L115)

Core Midnight contract address captured in the market struct.

***

### rcfThreshold

> `readonly` **rcfThreshold**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:123](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L123)

Recovery close factor threshold.
