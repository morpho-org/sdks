[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / encodeBlueSignatureAuthorization

# Function: encodeBlueSignatureAuthorization()

> **encodeBlueSignatureAuthorization**(`viemClient`, `params`): `Promise`\<[`Requirement`](../interfaces/Requirement.md)\<[`AuthorizationRequirementSignature`](../interfaces/AuthorizationRequirementSignature.md), `undefined`\>\>

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeBlueSignatureAuthorization.ts:64](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeBlueSignatureAuthorization.ts#L64)

Builds a Morpho authorization `Requirement` that, once signed, lets `authorized` operate on
Morpho on the signer's behalf through `setAuthorizationWithSig` — the offchain-signature
alternative to a standalone `setAuthorization` transaction.

The returned `Requirement.sign()` produces the EIP-712 signature over Morpho's `Authorization`
typed data, verifies it against the connected account, and returns a deep-frozen
`RequirementSignature` the bundler action helpers consume. Deadline defaults to two hours from
`Time.timestamp()`.

## Parameters

### viemClient

`Client`

Connected viem `Client` whose `chain.id` matches `params.chainId`.

### params

`EncodeBlueSignatureAuthorizationParams`

Authorization encoding parameters.

## Returns

`Promise`\<[`Requirement`](../interfaces/Requirement.md)\<[`AuthorizationRequirementSignature`](../interfaces/AuthorizationRequirementSignature.md), `undefined`\>\>

A `Requirement` whose `sign(client, userAddress)` produces the deep-frozen signature.

## Throws

when `viemClient.chain?.id !== params.chainId`.

## Throws

from `sign()` when the client has no `account.address`.

## Throws

from `sign()` when the client account differs from `userAddress`.

## Throws

from `sign()` when EIP-712 verification fails.

## Example

```ts
import { createWalletClient, http } from "viem";
import { mainnet } from "viem/chains";
import { encodeBlueSignatureAuthorization } from "@morpho-org/morpho-sdk";

const client = createWalletClient({ chain: mainnet, transport: http() });
const requirement = await encodeBlueSignatureAuthorization(client, {
  authorized: generalAdapter1,
  chainId: 1,
  nonce: 0n,
});
// requirement satisfies Requirement
```
