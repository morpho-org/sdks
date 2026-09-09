[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueSupplyParams

# Interface: BlueSupplyParams

Defined in: [packages/morpho-sdk/src/actions/blue/supply.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supply.ts#L18)

Parameters for [blueSupply](../functions/blueSupply.md).

## Properties

### args

> **args**: [`DepositAmountArgs`](../type-aliases/DepositAmountArgs.md) & `object`

Defined in: [packages/morpho-sdk/src/actions/blue/supply.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supply.ts#L23)

#### Type Declaration

##### maxSharePrice

> **maxSharePrice**: `bigint`

Maximum supply share price (in ray). Slippage protection against inflation attacks.

##### onBehalf

> **onBehalf**: `` `0x${string}` ``

Address whose Morpho supply position is credited.

##### requirementSignature?

> `optional` **requirementSignature?**: [`PermitRequirementSignature`](PermitRequirementSignature.md)

Optional pre-signed permit/permit2 approval for the loan-token transfer.

***

### market

> **market**: `object`

Defined in: [packages/morpho-sdk/src/actions/blue/supply.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supply.ts#L19)

#### chainId

> `readonly` **chainId**: `number`

#### marketParams

> `readonly` **marketParams**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

***

### metadata?

> `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/blue/supply.ts:31](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supply.ts#L31)
