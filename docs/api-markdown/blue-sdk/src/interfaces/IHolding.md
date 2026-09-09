[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / IHolding

# Interface: IHolding

Defined in: [packages/blue-sdk/src/holding/Holding.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L32)

Input shape for a user's token holding and allowance state.

## Properties

### balance

> **balance**: `bigint`

Defined in: [packages/blue-sdk/src/holding/Holding.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L41)

***

### canTransfer?

> `optional` **canTransfer?**: `boolean`

Defined in: [packages/blue-sdk/src/holding/Holding.ts:40](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L40)

***

### erc20Allowances

> **erc20Allowances**: `object`

Defined in: [packages/blue-sdk/src/holding/Holding.ts:35](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L35)

##### bundler3.generalAdapter1

> **bundler3.generalAdapter1**: `bigint`

#### morpho

> **morpho**: `bigint`

#### permit2

> **permit2**: `bigint`

***

### erc2612Nonce?

> `optional` **erc2612Nonce?**: `bigint`

Defined in: [packages/blue-sdk/src/holding/Holding.ts:39](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L39)

***

### permit2BundlerAllowance

> **permit2BundlerAllowance**: [`IPermit2Allowance`](IPermit2Allowance.md)

Defined in: [packages/blue-sdk/src/holding/Holding.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L38)

***

### token

> **token**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/holding/Holding.ts:34](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L34)

***

### user

> **user**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/holding/Holding.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L33)
