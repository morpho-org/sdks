[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueWithdrawParams

# Interface: BlueWithdrawParams

Defined in: [packages/morpho-sdk/src/actions/blue/withdraw.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/withdraw.ts#L20)

Parameters for [blueWithdraw](../functions/blueWithdraw.md).

## Properties

### args

> **args**: `object`

Defined in: [packages/morpho-sdk/src/actions/blue/withdraw.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/withdraw.ts#L25)

#### assets

> **assets**: `bigint`

Withdraw assets amount (`0n` when withdrawing by shares).

#### authorizationSignature?

> `optional` **authorizationSignature?**: [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md)

Optional signed Morpho authorization. When provided, a `setAuthorizationWithSig` call is
prepended to the bundle so GeneralAdapter1 is authorized in-bundle instead of via a
standalone `setAuthorization` transaction.

#### minSharePrice

> **minSharePrice**: `bigint`

Minimum withdraw share price (in ray). Slippage protection.

#### reallocations?

> `optional` **reallocations?**: [`BlueReallocationPlan`](../type-aliases/BlueReallocationPlan.md)

Homogeneous Vault V1 or Vault V2 reallocations to execute before withdrawing. V1 entries can be
computed via `MorphoBlue.getVaultV1Reallocations({ operation: "withdraw", amount })` or directly
via `computeVaultV1Reallocations({ operation: "withdraw", amount, ... })`.
Vault V1 inputs are deprecated for high-level Blue writes; use Vault V2 for new integrations.

#### receiver

> **receiver**: `` `0x${string}` ``

Address that receives the withdrawn assets.

#### shares

> **shares**: `bigint`

Withdraw shares amount (`0n` when withdrawing by assets).

***

### market

> **market**: `object`

Defined in: [packages/morpho-sdk/src/actions/blue/withdraw.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/withdraw.ts#L21)

#### chainId

> `readonly` **chainId**: `number`

#### marketParams

> `readonly` **marketParams**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

***

### metadata?

> `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/blue/withdraw.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/withdraw.ts#L48)
