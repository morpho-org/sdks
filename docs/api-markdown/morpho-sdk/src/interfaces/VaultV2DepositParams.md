[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV2DepositParams

# Interface: VaultV2DepositParams

Defined in: [packages/morpho-sdk/src/actions/vaultV2/deposit.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/deposit.ts#L20)

Parameters for [vaultV2Deposit](../functions/vaultV2Deposit.md).

## Properties

### args

> **args**: [`DepositAmountArgs`](../type-aliases/DepositAmountArgs.md) & `object`

Defined in: [packages/morpho-sdk/src/actions/vaultV2/deposit.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/deposit.ts#L26)

#### Type Declaration

##### maxSharePrice

> **maxSharePrice**: `bigint`

##### recipient

> **recipient**: `` `0x${string}` ``

##### requirementSignature?

> `optional` **requirementSignature?**: [`PermitRequirementSignature`](PermitRequirementSignature.md)

***

### metadata?

> `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/vaultV2/deposit.ts:31](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/deposit.ts#L31)

***

### vault

> **vault**: `object`

Defined in: [packages/morpho-sdk/src/actions/vaultV2/deposit.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/deposit.ts#L21)

#### address

> **address**: `` `0x${string}` ``

#### asset

> **asset**: `` `0x${string}` ``

#### chainId

> **chainId**: `number`
