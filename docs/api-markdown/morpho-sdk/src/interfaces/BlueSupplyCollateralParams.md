[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueSupplyCollateralParams

# Interface: BlueSupplyCollateralParams

Defined in: [packages/morpho-sdk/src/actions/blue/supplyCollateral.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supplyCollateral.ts#L18)

Parameters for [blueSupplyCollateral](../functions/blueSupplyCollateral.md).

## Properties

### args

> **args**: [`DepositAmountArgs`](../type-aliases/DepositAmountArgs.md) & `object`

Defined in: [packages/morpho-sdk/src/actions/blue/supplyCollateral.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supplyCollateral.ts#L23)

#### Type Declaration

##### onBehalf

> **onBehalf**: `` `0x${string}` ``

Address whose Morpho collateral position is credited.

##### requirementSignature?

> `optional` **requirementSignature?**: [`PermitRequirementSignature`](PermitRequirementSignature.md)

Optional pre-signed permit/permit2 approval for the collateral transfer.

***

### market

> **market**: `object`

Defined in: [packages/morpho-sdk/src/actions/blue/supplyCollateral.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supplyCollateral.ts#L19)

#### chainId

> `readonly` **chainId**: `number`

#### marketParams

> `readonly` **marketParams**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

***

### metadata?

> `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/blue/supplyCollateral.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supplyCollateral.ts#L29)
