[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / SelectedRequirementSignatures

# Interface: SelectedRequirementSignatures

Defined in: [packages/morpho-sdk/src/types/action.ts:865](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L865)

The typed requirement-signature slots a transaction builder consumes, split from a `buildTx` array.

## Properties

### authorization?

> `optional` **authorization?**: [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md)

Defined in: [packages/morpho-sdk/src/types/action.ts:869](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L869)

The single Morpho authorization signature, when present.

***

### midnightOfferRoot?

> `optional` **midnightOfferRoot?**: [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md)

Defined in: [packages/morpho-sdk/src/types/action.ts:871](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L871)

The single Midnight offer-root signature, when present.

***

### permit?

> `optional` **permit?**: [`PermitRequirementSignature`](PermitRequirementSignature.md)

Defined in: [packages/morpho-sdk/src/types/action.ts:867](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L867)

The single permit / Permit2 signature, when present.
