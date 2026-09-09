[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / AuthorizationSignatureArgs

# Interface: AuthorizationSignatureArgs

Defined in: [packages/morpho-sdk/src/types/action.ts:561](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L561)

Signed Morpho Blue authorization payload produced when an integrator opts into offchain
signatures (`supportSignature: true`). Consumed by the action layer to emit a
`setAuthorizationWithSig` bundler call in place of a standalone `setAuthorization` transaction.

## Properties

### authorized

> **authorized**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/types/action.ts:565](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L565)

Account being authorized to operate on Morpho on the owner's behalf (GeneralAdapter1).

***

### deadline

> **deadline**: `bigint`

Defined in: [packages/morpho-sdk/src/types/action.ts:571](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L571)

Signature deadline timestamp in seconds.

***

### isAuthorized

> **isAuthorized**: `boolean`

Defined in: [packages/morpho-sdk/src/types/action.ts:567](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L567)

Whether the authorization is granted (`true`) or revoked (`false`).

***

### nonce

> **nonce**: `bigint`

Defined in: [packages/morpho-sdk/src/types/action.ts:569](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L569)

Morpho authorization nonce consumed by the signature.

***

### owner

> **owner**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/types/action.ts:563](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L563)

Account granting the authorization (the position owner).

***

### signature

> **signature**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/types/action.ts:573](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L573)

EIP-712 signature over the Morpho `Authorization` typed data.
