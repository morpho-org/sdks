[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / encodeErc20Permit

# Function: encodeErc20Permit()

> **encodeErc20Permit**(`viemClient`, `params`): `Promise`\<[`Requirement`](../interfaces/Requirement.md)\<[`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md), `undefined`\>\>

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeErc20Permit.ts:64](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeErc20Permit.ts#L64)

Builds an EIP-2612 permit `Requirement` that, once signed, lets a supported SDK spender pull
`amount` of `token`.

Reads token metadata via `fetchToken`. The returned `Requirement.sign()` produces the EIP-712
signature, verifies it against the connected account, and returns a `RequirementSignature`
the bundler action helpers can consume. Deadline defaults to two hours from `Time.timestamp()`.

## Parameters

### viemClient

`Client`

Connected viem `Client` whose `chain.id` matches `params.chainId`.

### params

`EncodeErc20PermitParams`

Permit encoding parameters.

## Returns

`Promise`\<[`Requirement`](../interfaces/Requirement.md)\<[`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md), `undefined`\>\>

A `Requirement` whose `sign(client, userAddress)` produces the deep-frozen signature.

## Throws

when `viemClient.chain?.id !== params.chainId`.

## Throws

when `spender` is not GeneralAdapter1 or
  MidnightBundles for `chainId`.

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
import { encodeErc20Permit } from "@morpho-org/morpho-sdk";

const client = createWalletClient({ chain: mainnet, transport: http() });
const requirement = await encodeErc20Permit(client, {
  token: USDC, // Must implement standard ERC-2612. DAI is routed through Permit2 by requirement helpers.
  spender: generalAdapter1,
  amount: 1_000_000n,
  chainId: 1,
  nonce: 0n,
});
// requirement satisfies Requirement
```
