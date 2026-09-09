[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / MarketParams

# Class: MarketParams

Defined in: [packages/midnight-sdk/src/market/Market.ts:157](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L157)

Immutable Midnight market configuration.

## Example

```ts
import { MarketParams } from "@morpho-org/midnight-sdk";

const params = new MarketParams({
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
console.log(params.loanToken);
```

## Constructors

### Constructor

> **new MarketParams**(`params`): `MarketParams`

Defined in: [packages/midnight-sdk/src/market/Market.ts:188](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L188)

Creates normalized market params.

#### Parameters

##### params

[`IMarketParams`](../interfaces/IMarketParams.md)

Market params to normalize.

#### Returns

`MarketParams`

#### Throws

when the chain id is malformed or negative, or when the collateral list is empty, exceeds [MAX\_COLLATERALS](../variables/MAX_COLLATERALS.md), contains duplicate tokens, has LLTV outside `[0, WAD]`, has liquidation cursor outside `[0, WAD)`, or computes an invalid maximum liquidation incentive factor.

## Properties

### chainId

> `readonly` **chainId**: `bigint`

Defined in: [packages/midnight-sdk/src/market/Market.ts:159](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L159)

EIP-155 chain id captured in the market struct.

***

### collateralParams

> `readonly` **collateralParams**: readonly [`CollateralParams`](../interfaces/CollateralParams.md)[]

Defined in: [packages/midnight-sdk/src/market/Market.ts:168](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L168)

Collateral definitions sorted by token.

***

### enterGate

> `readonly` **enterGate**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:177](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L177)

Entry gate address.

***

### liquidatorGate

> `readonly` **liquidatorGate**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:180](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L180)

Liquidator gate address.

***

### loanToken

> `readonly` **loanToken**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:165](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L165)

Loan token address.

***

### maturity

> `readonly` **maturity**: `bigint`

Defined in: [packages/midnight-sdk/src/market/Market.ts:171](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L171)

Market maturity timestamp.

***

### midnight

> `readonly` **midnight**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:162](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L162)

Core Midnight contract address captured in the market struct.

***

### rcfThreshold

> `readonly` **rcfThreshold**: `bigint`

Defined in: [packages/midnight-sdk/src/market/Market.ts:174](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L174)

Recovery close factor threshold.

## Methods

### from()

> `static` **from**(`market`): `MarketParams`

Defined in: [packages/midnight-sdk/src/market/Market.ts:328](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L328)

Returns market params from a params object or hydrated market.

Use at boundaries that accept either a standalone market config or a full
market object. Existing `MarketParams` instances are returned as-is.

#### Parameters

##### market

[`MarketInput`](../type-aliases/MarketInput.md)

Market params or hydrated market.

#### Returns

`MarketParams`

Market params instance.

#### Example

```ts
import { MarketParams } from "@morpho-org/midnight-sdk";

const params = MarketParams.from({
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
console.log(params.loanToken);
```
