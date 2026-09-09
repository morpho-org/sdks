[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / isAuthorizationSignature

# Function: isAuthorizationSignature()

> **isAuthorizationSignature**(`signature`): `signature is AuthorizationRequirementSignature`

Defined in: [packages/morpho-sdk/src/types/action.ts:846](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L846)

Narrows a [RequirementSignature](../type-aliases/RequirementSignature.md) to a signed Morpho authorization.

## Parameters

### signature

[`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](../interfaces/AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](../interfaces/MidnightOfferRootSignature.md)

The signed requirement to test.

## Returns

`signature is AuthorizationRequirementSignature`

`true` when `signature.action.type` is `"authorization"`.
