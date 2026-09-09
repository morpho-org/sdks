[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / getGeneralAdapterRequirements

# Function: getGeneralAdapterRequirements()

> **getGeneralAdapterRequirements**(`viemClient`, `params`): `Promise`\<([`Bundler3TokenSignatureRequirement`](../type-aliases/Bundler3TokenSignatureRequirement.md) \| `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`ERC20ApprovalAction`](../interfaces/ERC20ApprovalAction.md)\>\>)[]\>

Defined in: [packages/morpho-sdk/src/actions/requirements/generalAdapter/getGeneralAdapterRequirements.ts:101](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/generalAdapter/getGeneralAdapterRequirements.ts#L101)

Resolves the approval requirements an integrator must satisfy before a bundled action pulls
tokens through `GeneralAdapter1`.

Reads the minimum token allowance / nonce state needed from the chain, then picks one of three
flows:

1. **`supportSignature: false`** — classic ERC-20 `approve` transaction (or no-op when the
   direct allowance is already large enough).
2. **`supportSignature: true` + EIP-2612 nonce detected + `useSimplePermit`** — single permit
   signature against the token itself. DAI is excluded from this branch (its non-standard
   permit signature is incompatible) and falls through to Permit2 even with
   `useSimplePermit: true`.
3. **`supportSignature: true`, default** — Permit2 flow: classic approval to the Permit2
   contract (if needed), followed by a Permit2 signature against `GeneralAdapter1`.

The simple-permit compatibility check is intentionally shallow: when requested, it probes
whether the token exposes a readable ERC-2612 `nonces(owner)` value.
Leaving `useSimplePermit` unset, or passing `false`, is the caller escape hatch for tokens
that expose `nonces` but are still incompatible with the SDK's ERC-2612 encoder. This opt-out
has proven useful in the past, but the SDK does not encode a token-specific example here.
DAI is handled as a built-in version of that incompatibility: it exposes `nonces(owner)` but is
always routed to Permit2/classic approval instead of DAI-specific permit signing.

## Parameters

### viemClient

`Client`

Connected viem `Client` whose `chain.id` matches `params.chainId`.

### params

[`GetGeneralAdapterRequirementsParams`](../type-aliases/GetGeneralAdapterRequirementsParams.md)

Requirement resolution parameters.

## Returns

`Promise`\<([`Bundler3TokenSignatureRequirement`](../type-aliases/Bundler3TokenSignatureRequirement.md) \| `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`ERC20ApprovalAction`](../interfaces/ERC20ApprovalAction.md)\>\>)[]\>

Promise resolving to an array of either deep-frozen approval transactions or
  `Requirement` objects (signature requirements with a `sign()` method). Empty when `amount`
  is zero or when the classic-approval path can reuse sufficient direct allowance.

## Throws

when `viemClient.chain?.id !== params.chainId`. No other typed
  error is reachable through this entry point: the values passed into
  `getRequirementsApproval` always satisfy `approvalAmount >= spendAmount` (direct path uses
  `approvalAmount === spendAmount === amount`; Permit2 path uses `MAX_UINT_160`), so
  `ApprovalAmountLessThanSpendAmountError` cannot fire from here.

## Example

```ts
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { getGeneralAdapterRequirements } from "@morpho-org/morpho-sdk";

const client = createPublicClient({ chain: mainnet, transport: http() });
const requirements = await getGeneralAdapterRequirements(client, {
  address: USDC,
  chainId: 1,
  supportSignature: true,
  args: { amount: 1_000_000n, from: user },
});
// requirements satisfies (Readonly<Transaction<ERC20ApprovalAction>> | Bundler3TokenSignatureRequirement)[]
```
