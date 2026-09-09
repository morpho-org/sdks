[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / getGeneralAdapterRequirementsPermit

# Function: getGeneralAdapterRequirementsPermit()

> **getGeneralAdapterRequirementsPermit**(`viemClient`, `params`): `Promise`\<[`Requirement`](../interfaces/Requirement.md)\<[`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md), `undefined`\>[]\>

Defined in: [packages/morpho-sdk/src/actions/requirements/generalAdapter/getGeneralAdapterRequirementsPermit.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/generalAdapter/getGeneralAdapterRequirementsPermit.ts#L32)

Computes the EIP-2612 permit `Requirement` an integrator must sign so that `GeneralAdapter1`
can pull `amount` of `token`.

## Parameters

### viemClient

`Client`

Connected viem `Client` (used by the returned `Requirement.sign()`).

### params

#### args

\{ `amount`: `bigint`; \}

#### args.amount

`bigint`

Required token amount.

#### chainId

`number`

The chain the bundle targets.

#### nonce

`bigint`

The user's current EIP-2612 nonce on `token`.

#### supportDeployless?

`boolean`

Whether to fetch token metadata via deployless multicall.

#### token

`` `0x${string}` ``

ERC-20 token address (must support EIP-2612).

## Returns

`Promise`\<[`Requirement`](../interfaces/Requirement.md)\<[`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md), `undefined`\>[]\>

A single-element array containing the exact-amount `Requirement` to sign.

## Example

```ts
import { createWalletClient, http } from "viem";
import { mainnet } from "viem/chains";
import { getGeneralAdapterRequirementsPermit } from "@morpho-org/morpho-sdk";

const client = createWalletClient({ chain: mainnet, transport: http() });
const reqs = await getGeneralAdapterRequirementsPermit(client, {
  token: USDC, // an ERC-2612-compatible token; DAI is excluded by getGeneralAdapterRequirements
  chainId: 1,
  args: { amount: 1_000_000n },
  nonce: 0n,
});
// reqs satisfies Requirement[]
```
