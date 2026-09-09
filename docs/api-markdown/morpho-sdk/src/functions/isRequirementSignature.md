[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / isRequirementSignature

# Function: isRequirementSignature()

## Call Signature

> **isRequirementSignature**\<`T`\>(`requirement`): `requirement is Requirement<T, undefined>`

Defined in: [packages/morpho-sdk/src/types/action.ts:805](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L805)

### Type Parameters

#### T

`T` *extends* [`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](../interfaces/AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](../interfaces/MidnightOfferRootSignature.md) = [`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](../interfaces/AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](../interfaces/MidnightOfferRootSignature.md)

### Parameters

#### requirement

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`CallRequirementAction`](../type-aliases/CallRequirementAction.md)\>\> \| [`Requirement`](../interfaces/Requirement.md)\<`T`, `undefined`\> \| `undefined`

### Returns

`requirement is Requirement<T, undefined>`

## Call Signature

> **isRequirementSignature**(`requirement`): requirement is Requirement\<PermitRequirementSignature \| AuthorizationRequirementSignature \| MidnightOfferRootSignature, undefined\>

Defined in: [packages/morpho-sdk/src/types/action.ts:810](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L810)

### Parameters

#### requirement

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`CallRequirementAction`](../type-aliases/CallRequirementAction.md)\>\> \| [`Requirement`](../interfaces/Requirement.md)\<[`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](../interfaces/AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](../interfaces/MidnightOfferRootSignature.md), `undefined`\> \| `undefined`

### Returns

requirement is Requirement\<PermitRequirementSignature \| AuthorizationRequirementSignature \| MidnightOfferRootSignature, undefined\>

## Call Signature

> **isRequirementSignature**(`requirement`): `requirement is SignatureRequirement`

Defined in: [packages/morpho-sdk/src/types/action.ts:813](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L813)

### Parameters

#### requirement

[`ActionRequirement`](../type-aliases/ActionRequirement.md) \| `undefined`

### Returns

`requirement is SignatureRequirement`
