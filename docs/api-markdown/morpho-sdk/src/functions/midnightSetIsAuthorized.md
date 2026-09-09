[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / midnightSetIsAuthorized

# Function: midnightSetIsAuthorized()

> **midnightSetIsAuthorized**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightAuthorizationAction`](../interfaces/MidnightAuthorizationAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/midnight/authorization.ts:47](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/authorization.ts#L47)

Encodes `Midnight.setIsAuthorized` for a bundle spender or ratifier.

Prefer requirement helpers or entity `getRequirements()` in app flows; they
read `isAuthorized` first and return this transaction only when needed. Use
this builder directly when the caller intentionally wants to set or revoke
authorization without reading state.

## Parameters

### params

[`MidnightSetIsAuthorizedParams`](../interfaces/MidnightSetIsAuthorizedParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightAuthorizationAction`](../interfaces/MidnightAuthorizationAction.md)\>\>

A deep-frozen `Transaction<MidnightAuthorizationAction>` targeting `Midnight`.

## Throws

when granting authorization to an unsupported operator.

## Example

```ts
import { midnightSetIsAuthorized } from "@morpho-org/morpho-sdk";

const tx = midnightSetIsAuthorized({
  chainId: 8453,
  authorized: midnightBundles,
  onBehalf: user,
});
```
