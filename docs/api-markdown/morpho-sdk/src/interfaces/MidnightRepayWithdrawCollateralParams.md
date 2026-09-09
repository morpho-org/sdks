[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MidnightRepayWithdrawCollateralParams

# Interface: MidnightRepayWithdrawCollateralParams

Defined in: [packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts#L20)

Parameters for encoding a Midnight repay and/or collateral withdrawal bundle.

## Properties

### chainId

> `readonly` **chainId**: `number`

Defined in: [packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts#L21)

***

### collateralIndex?

> `readonly` `optional` **collateralIndex?**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts#L26)

***

### deadline

> `readonly` **deadline**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts#L28)

Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry.

***

### market

> `readonly` **market**: [`MarketInput`](../../../midnight-sdk/src/type-aliases/MarketInput.md)

Defined in: [packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts#L22)

***

### metadata?

> `readonly` `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts#L29)

***

### onBehalf

> `readonly` **onBehalf**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts#L25)

***

### repayAssets

> `readonly` **repayAssets**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts#L23)

***

### withdrawCollateralAssets

> `readonly` **withdrawCollateralAssets**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts#L24)
