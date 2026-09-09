[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / CollateralParams

# Interface: CollateralParams

Defined in: [packages/midnight-sdk/src/market/Market.ts:74](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L74)

Normalized Midnight collateral params.

## Example

```ts
import type { CollateralParams } from "@morpho-org/midnight-sdk";

const params: CollateralParams = {
  token: "0x0000000000000000000000000000000000000001",
  lltv: 770000000000000000n,
  liquidationCursor: 250000000000000000n,
  oracle: "0x0000000000000000000000000000000000000002",
};
console.log(params.lltv);
```

## Properties

### liquidationCursor

> `readonly` **liquidationCursor**: `bigint`

Defined in: [packages/midnight-sdk/src/market/Market.ts:80](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L80)

WAD-scaled liquidation cursor used to compute the maximum liquidation incentive factor.

***

### lltv

> `readonly` **lltv**: `bigint`

Defined in: [packages/midnight-sdk/src/market/Market.ts:78](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L78)

WAD-scaled liquidation loan-to-value.

***

### oracle

> `readonly` **oracle**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:82](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L82)

Oracle address for this collateral.

***

### token

> `readonly` **token**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:76](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L76)

Collateral token address.
