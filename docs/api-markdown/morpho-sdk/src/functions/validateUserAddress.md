[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateUserAddress

# Function: validateUserAddress()

> **validateUserAddress**(`clientAccountAddress`, `userAddress`): `` asserts clientAccountAddress is `0x${string}` ``

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:104](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L104)

Asserts that the client has a connected account AND that it matches
the provided user address.

Used internally by the signature requirements (`encodeErc20Permit`,
`encodeErc20Permit2Approve`) to enforce builder = signer at `sign()` time:
the signing flow is the only path where an account/address mismatch
is a real security concern (rather than just an integrator footgun).

Transaction builders no longer call this helper — callers are
responsible for keeping `userAddress` aligned with the signing account
at the builder layer.

Throws [MissingClientPropertyError](../classes/MissingClientPropertyError.md) if the client has no account.
Throws [AddressMismatchError](../classes/AddressMismatchError.md) if the client account differs from
`userAddress`.

## Parameters

### clientAccountAddress

`` `0x${string}` `` \| `undefined`

The client's account address; if undefined,
  `MissingClientPropertyError` is thrown.

### userAddress

`` `0x${string}` ``

The user address provided by the caller.

## Returns

`` asserts clientAccountAddress is `0x${string}` ``
