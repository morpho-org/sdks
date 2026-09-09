[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / isPermitSignature

# Function: isPermitSignature()

> **isPermitSignature**(`signature`): `signature is PermitRequirementSignature`

Defined in: [packages/morpho-sdk/src/types/action.ts:832](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L832)

Narrows a [RequirementSignature](../type-aliases/RequirementSignature.md) to a permit / Permit2 token-approval signature.

## Parameters

### signature

[`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](../interfaces/AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](../interfaces/MidnightOfferRootSignature.md)

The signed requirement to test.

## Returns

`signature is PermitRequirementSignature`

`true` when `signature.action.type` is `"permit"` or `"permit2"`.
