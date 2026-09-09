[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / ICollateralParams

# Interface: ICollateralParams

Defined in: [packages/midnight-sdk/src/market/Market.ts:47](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L47)

Plain collateral params input accepted by [MarketParams](../classes/MarketParams.md).

## Example

```ts
import type { ICollateralParams } from "@morpho-org/midnight-sdk";

const params: ICollateralParams = {
  token: "0x0000000000000000000000000000000000000001",
  lltv: 770000000000000000n,
  liquidationCursor: 250000000000000000n,
  oracle: "0x0000000000000000000000000000000000000002",
};
```

## Properties

### liquidationCursor

> `readonly` **liquidationCursor**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L53)

WAD-scaled liquidation cursor used to compute the maximum liquidation incentive factor.

***

### lltv

> `readonly` **lltv**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:51](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L51)

WAD-scaled liquidation loan-to-value.

***

### oracle

> `readonly` **oracle**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:55](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L55)

Oracle address for this collateral.

***

### token

> `readonly` **token**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:49](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L49)

Collateral token address.
