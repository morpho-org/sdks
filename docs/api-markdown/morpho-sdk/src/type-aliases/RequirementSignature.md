[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / RequirementSignature

# Type Alias: RequirementSignature\<TAction, TArgs\>

> **RequirementSignature**\<`TAction`, `TArgs`\> = `TAction` *extends* [`SignatureRequirementAction`](SignatureRequirementAction.md) ? `TArgs` *extends* [`RequirementSignatureArgs`](RequirementSignatureArgs.md) ? `object` : `never` : [`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](../interfaces/AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](../interfaces/MidnightOfferRootSignature.md)

Defined in: [packages/morpho-sdk/src/types/action.ts:654](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L654)

The deep-frozen output of `Requirement.sign()`. Discriminated on `action.type`:
`"permit"` / `"permit2"` carry Bundler3 token-approval args, `"authorization"` carries the
signed Morpho authorization, and Midnight adds `"midnightOfferRootSignature"`.

## Type Parameters

### TAction

`TAction` *extends* [`SignatureRequirementAction`](SignatureRequirementAction.md) \| `undefined` = `undefined`

### TArgs

`TArgs` *extends* [`RequirementSignatureArgs`](RequirementSignatureArgs.md) \| `undefined` = `undefined`
