[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / encodeVaultSharesPermit

# Function: encodeVaultSharesPermit()

> **encodeVaultSharesPermit**(`params`): [`Requirement`](../interfaces/Requirement.md)\<[`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md)\>

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts:76](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts#L76)

Builds the bounded ERC-2612 shares-permit requirement used by an in-kind vault exit.

Vault V1 uses the standard token permit domain. Vault V2 uses its protocol-specific domain with
only `chainId` and `verifyingContract`.

## Parameters

### params

[`EncodeVaultSharesPermitParams`](../interfaces/EncodeVaultSharesPermitParams.md)

## Returns

[`Requirement`](../interfaces/Requirement.md)\<[`PermitRequirementSignature`](../interfaces/PermitRequirementSignature.md)\>

A requirement whose `sign()` result can be embedded in VaultExitBundlesV1 calldata.

## Throws

when no address registry exists for `chainId`.

## Throws

when `spender` is not the registered VaultExitBundlesV1.

## Throws

from `sign()` when the wallet has no account.

## Throws

from `sign()` when the wallet account differs from `owner`.

## Throws

from `sign()` when the wallet targets another chain.

## Throws

from `sign()` when signature recovery fails.

## Throws

from `sign()` when a Vault V1 permit domain targets another chain or omits `chainId`.

## Throws

from `sign()` when a Vault V1 permit domain targets another token or omits `verifyingContract`.

## Throws

from `sign()` when a Vault V1 permit domain advertises unsupported extensions.

## Example

```ts
import { encodeVaultSharesPermit } from "@morpho-org/morpho-sdk";

const requirement = encodeVaultSharesPermit({
  vault: vaultData,
  version: "vaultV2",
  spender: vaultExitBundlesV1,
  owner,
  chainId: 1,
  nonce: 0n,
  amount: 1_000_000n,
  deadline,
});
const signature = await requirement.sign(walletClient, owner);
// signature satisfies PermitRequirementSignature
```
