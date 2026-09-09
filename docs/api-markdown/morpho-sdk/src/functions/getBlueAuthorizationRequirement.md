[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / getBlueAuthorizationRequirement

# Function: getBlueAuthorizationRequirement()

> **getBlueAuthorizationRequirement**(`params`): `Promise`\<[`Requirement`](../interfaces/Requirement.md)\<[`AuthorizationRequirementSignature`](../interfaces/AuthorizationRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueAuthorizationAction`](../interfaces/BlueAuthorizationAction.md)\>\> \| `null`\>

Defined in: [packages/morpho-sdk/src/actions/requirements/blue/getBlueAuthorizationRequirement.ts:55](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/blue/getBlueAuthorizationRequirement.ts#L55)

Resolves whether `GeneralAdapter1` needs Blue authorization for the given user, and returns
the requirement to satisfy it when it does.

Reads `Morpho.isAuthorized(userAddress, generalAdapter1)` on the target chain. Required before
any bundled Blue path that operates on behalf of the user (`borrow`, `withdraw`,
`supplyCollateralBorrow`, `repayWithdrawCollateral`, `refinance`).

- When `supportSignature` is falsy (default), returns the
  `setAuthorization(generalAdapter1, true)` transaction the user submits before the bundle.
- When `supportSignature` is `true`, reads the user's Morpho `nonce` and returns a signable
  `Requirement`; the signed authorization is folded into the bundle via
  `setAuthorizationWithSig`, removing the standalone transaction.

## Parameters

### params

#### chainId

`number`

Target chain id (used to resolve Morpho and `GeneralAdapter1`).

#### supportSignature?

`boolean`

When `true`, return a signable `Requirement` instead of a
  transaction so authorization can be bundled via `setAuthorizationWithSig`.

#### userAddress

`` `0x${string}` ``

The user that must authorize `GeneralAdapter1`.

#### viemClient

`Client`

Connected viem `Client` whose `chain.id` matches `params.chainId`.

## Returns

`Promise`\<[`Requirement`](../interfaces/Requirement.md)\<[`AuthorizationRequirementSignature`](../interfaces/AuthorizationRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueAuthorizationAction`](../interfaces/BlueAuthorizationAction.md)\>\> \| `null`\>

A deep-frozen `Transaction<BlueAuthorizationAction>`, a signable authorization
  `Requirement` (when `supportSignature` is `true`), or `null` when authorization is already in
  place.

## Throws

when `viemClient.chain?.id !== params.chainId`.

## Example

```ts
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { getBlueAuthorizationRequirement } from "@morpho-org/morpho-sdk";

const client = createPublicClient({ chain: mainnet, transport: http() });
const requirement = await getBlueAuthorizationRequirement({
  viemClient: client,
  chainId: 1,
  userAddress: borrower,
  supportSignature: true,
});
// requirement is null when already authorized, a Requirement when supportSignature is true,
// otherwise Readonly<Transaction<BlueAuthorizationAction>>
```
