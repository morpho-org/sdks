[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / selectRequirementSignatures

# Function: selectRequirementSignatures()

> **selectRequirementSignatures**(`signatures`, `accepts`): [`SelectedRequirementSignatures`](../interfaces/SelectedRequirementSignatures.md)

Defined in: [packages/morpho-sdk/src/types/action.ts:901](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L901)

Splits a `buildTx` signature array into its typed requirement-signature slots, rejecting
ambiguous or unexpected input so a path never silently consumes the wrong signature.

A bundled path consumes at most one signature of each accepted kind. Passing several of the same
kind, or a kind the path does not consume, is rejected with a typed error rather than silently
dropping the extras — the latter could otherwise leave a required authorization or permit
unsigned (and the bundle reverting on-chain) or apply the wrong signature.

## Parameters

### signatures

readonly ([`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](../interfaces/AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](../interfaces/MidnightOfferRootSignature.md))[] \| `undefined`

The signatures passed to `buildTx`.

### accepts

Which signature kinds this operation consumes.

#### authorization?

`boolean`

Whether a Morpho authorization signature is consumed.

#### midnightOfferRoot?

`boolean`

Whether a Midnight offer-root signature is consumed.

#### permit?

`boolean`

Whether a permit / Permit2 signature is consumed.

## Returns

[`SelectedRequirementSignatures`](../interfaces/SelectedRequirementSignatures.md)

The single permit and/or authorization signature, when present.

## Throws

when more than one signature of an accepted kind is present.

## Throws

when a signature of a kind the operation does not consume is present.

## Example

```ts
import { selectRequirementSignatures } from "@morpho-org/morpho-sdk";

const { permit, authorization } = selectRequirementSignatures(signatures, {
  permit: true,
  authorization: true,
});
```
