[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / getBlueAuthorizationAction

# Function: getBlueAuthorizationAction()

> **getBlueAuthorizationAction**(`chainId`, `signature`): `Action`

Defined in: [packages/morpho-sdk/src/actions/signatures/getBlueAuthorizationAction.ts:35](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getBlueAuthorizationAction.ts#L35)

Encodes the bundler action that consumes a signed Morpho authorization, granting
`authorized` (GeneralAdapter1) operator rights on behalf of the signer via
`setAuthorizationWithSig` — replacing a standalone `setAuthorization` transaction.

The signature's `authorized` is pinned to the chain's `GeneralAdapter1`: an authorization
targeting any other account is rejected so the bundle can never hand operator rights over the
user's Morpho position to an unintended address. The action is emitted with `skipRevert: false`
so a rejected or stale authorization fails the whole bundle rather than letting a later
on-behalf Morpho call revert opaquely.

## Parameters

### chainId

`number`

Chain whose `GeneralAdapter1` the signature must authorize.

### signature

[`AuthorizationRequirementSignature`](../interfaces/AuthorizationRequirementSignature.md)

The signed authorization produced by `Requirement.sign()`.

## Returns

`Action`

A single `morphoSetAuthorizationWithSig` bundler `Action`.

## Throws

when `signature.args.authorized` is not the chain's
  `GeneralAdapter1`.

## Example

```ts
import { getBlueAuthorizationAction } from "@morpho-org/morpho-sdk";

// `requirement` comes from `getBlueAuthorizationRequirement` with `supportSignature: true`.
const signed = await requirement.sign(walletClient, borrower);
const action = getBlueAuthorizationAction(1, signed);
// action satisfies { type: "morphoSetAuthorizationWithSig"; args: [...] }
```
