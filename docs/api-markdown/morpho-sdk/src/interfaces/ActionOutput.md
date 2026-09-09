[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / ActionOutput

# Interface: ActionOutput\<TAction, TSignatures, TRequirementsParams\>

Defined in: [packages/morpho-sdk/src/types/action.ts:757](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L757)

Lazy entity result exposing prerequisite resolution and synchronous transaction building.

## Type Parameters

### TAction

`TAction` *extends* [`BaseAction`](BaseAction.md) = [`TransactionAction`](../type-aliases/TransactionAction.md)

### TSignatures

`TSignatures` = [`RequirementSignature`](../type-aliases/RequirementSignature.md)

### TRequirementsParams

`TRequirementsParams` = `ActionRequirementsParams`

## Properties

### buildTx

> `readonly` **buildTx**: (`signatures?`) => `Readonly`\<[`Transaction`](Transaction.md)\<`TAction`\>\>

Defined in: [packages/morpho-sdk/src/types/action.ts:762](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L762)

#### Parameters

##### signatures?

`TSignatures`

#### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<`TAction`\>\>

***

### getRequirements

> `readonly` **getRequirements**: (`params?`) => `Promise`\<readonly [`ActionRequirement`](../type-aliases/ActionRequirement.md)[]\>

Defined in: [packages/morpho-sdk/src/types/action.ts:765](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L765)

#### Parameters

##### params?

`TRequirementsParams`

#### Returns

`Promise`\<readonly [`ActionRequirement`](../type-aliases/ActionRequirement.md)[]\>
