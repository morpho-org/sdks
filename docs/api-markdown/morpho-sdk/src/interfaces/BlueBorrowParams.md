[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueBorrowParams

# Interface: BlueBorrowParams

Defined in: [packages/morpho-sdk/src/actions/blue/borrow.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/borrow.ts#L19)

Parameters for [blueBorrow](../functions/blueBorrow.md).

## Properties

### args

> **args**: `object`

Defined in: [packages/morpho-sdk/src/actions/blue/borrow.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/borrow.ts#L24)

#### amount

> **amount**: `bigint`

Amount of loan asset to borrow.

#### authorizationSignature?

> `optional` **authorizationSignature?**: [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md)

Optional signed Morpho authorization. When provided, a `setAuthorizationWithSig` call is
prepended to the bundle so GeneralAdapter1 is authorized in-bundle instead of via a
standalone `setAuthorization` transaction.

#### minSharePrice

> **minSharePrice**: `bigint`

Minimum borrow share price (in ray). Protects against share price manipulation.

#### reallocations?

> `optional` **reallocations?**: [`BlueReallocationPlan`](../type-aliases/BlueReallocationPlan.md)

Homogeneous Vault V1 or Vault V2 reallocations to execute before borrowing.
Vault V1 inputs are deprecated for high-level Blue writes; use Vault V2 for new integrations.

#### receiver

> **receiver**: `` `0x${string}` ``

Address that receives the borrowed assets.

***

### market

> **market**: `object`

Defined in: [packages/morpho-sdk/src/actions/blue/borrow.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/borrow.ts#L20)

#### chainId

> `readonly` **chainId**: `number`

#### marketParams

> `readonly` **marketParams**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

***

### metadata?

> `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/blue/borrow.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/borrow.ts#L43)
