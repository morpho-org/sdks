[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / encodeErc20Permit2Approve

# Function: encodeErc20Permit2Approve()

> **encodeErc20Permit2Approve**(`params`): [`Requirement`](../interfaces/Requirement.md)\<[`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md)\>

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeErc20Permit2Approve.ts:51](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeErc20Permit2Approve.ts#L51)

Builds a Permit2 `Requirement` that, once signed, lets GeneralAdapter1 pull `amount` of `token`
via the Permit2 contract.

Deadline defaults to two hours from `Time.timestamp()`.

## Parameters

### params

`EncodeErc20Permit2ApproveParams`

Permit2 encoding parameters.

## Returns

[`Requirement`](../interfaces/Requirement.md)\<[`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md)\>

A `Requirement` whose `sign(client, userAddress)` produces the deep-frozen signature.

## Throws

from `sign()` when the client has no `account.address`.

## Throws

from `sign()` when the client account differs from `userAddress`.

## Throws

from `sign()` when EIP-712 verification fails.

## Example

```ts
import { encodeErc20Permit2Approve } from "@morpho-org/morpho-sdk";

const requirement = encodeErc20Permit2Approve({
  token: USDC,
  amount: 1_000_000n,
  chainId: 1,
  nonce: 0n,
  expiration: 281_474_976_710_655n, // MAX_UINT_48 (2^48 - 1, effectively indefinite)
});
// requirement satisfies Requirement
```
