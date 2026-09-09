[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueRepayParams

# Interface: BlueRepayParams

Defined in: [packages/morpho-sdk/src/actions/blue/repay.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/repay.ts#L17)

Parameters for [blueRepay](../functions/blueRepay.md).

## Properties

### args

> **args**: [`RepayActionAmountArgs`](RepayActionAmountArgs.md) & `object`

Defined in: [packages/morpho-sdk/src/actions/blue/repay.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/repay.ts#L22)

#### Type Declaration

##### maxSharePrice

> **maxSharePrice**: `bigint`

Maximum repay share price (in ray). Protects against share price manipulation.

##### onBehalf

> **onBehalf**: `` `0x${string}` ``

Address whose debt is being repaid.

##### receiver

> **receiver**: `` `0x${string}` ``

Receives residual loan tokens in shares mode.

##### requirementSignature?

> `optional` **requirementSignature?**: [`PermitRequirementSignature`](PermitRequirementSignature.md)

Optional pre-signed permit/permit2 approval for the loan-token transfer.

***

### market

> **market**: `object`

Defined in: [packages/morpho-sdk/src/actions/blue/repay.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/repay.ts#L18)

#### chainId

> `readonly` **chainId**: `number`

#### marketParams

> `readonly` **marketParams**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

***

### metadata?

> `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/blue/repay.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/repay.ts#L32)
