[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / getPermitTypedData

# Function: getPermitTypedData()

> **getPermitTypedData**(`args`, `chainId`): `MessageDefinition`\<\{ `Permit`: readonly \[\{ `name`: `"owner"`; `type`: `"address"`; \}, \{ `name`: `"spender"`; `type`: `"address"`; \}, \{ `name`: `"value"`; `type`: `"uint256"`; \}, \{ `name`: `"nonce"`; `type`: `"uint256"`; \}, \{ `name`: `"deadline"`; `type`: `"uint256"`; \}\]; \}, `"Permit"`\>

Defined in: [packages/blue-sdk-viem/src/signatures/permit.ts:61](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/signatures/permit.ts#L61)

Permit signature for ERC20 tokens, following EIP-2612.
Fails closed when fetched EIP-5267 metadata is not bound to the token and chain.
Consumers should use another approval path instead of signing an unsafe domain.
Docs: https://eips.ethereum.org/EIPS/eip-2612

## Parameters

### args

[`PermitArgs`](../interfaces/PermitArgs.md)

The permit message fields and ERC20 token metadata.

### chainId

[`ChainId`](../../../morpho-ts/src/enumerations/ChainId.md)

The expected chain ID for the permit domain.

## Returns

`MessageDefinition`\<\{ `Permit`: readonly \[\{ `name`: `"owner"`; `type`: `"address"`; \}, \{ `name`: `"spender"`; `type`: `"address"`; \}, \{ `name`: `"value"`; `type`: `"uint256"`; \}, \{ `name`: `"nonce"`; `type`: `"uint256"`; \}, \{ `name`: `"deadline"`; `type`: `"uint256"`; \}\]; \}, `"Permit"`\>

Typed data ready to pass to a wallet for signing.

## Throws

InvalidPermitDomainChainIdError when fetched EIP-5267 metadata targets another chain or omits `chainId`.

## Throws

InvalidPermitDomainVerifyingContractError when fetched EIP-5267 metadata targets another token or omits `verifyingContract`.

## Throws

UnsupportedPermitDomainExtensionsError when fetched EIP-5267 metadata advertises extension fields unsupported by this helper.

## Example

```ts
import { getPermitTypedData } from "@morpho-org/blue-sdk-viem";

const typedData = getPermitTypedData(
  {
    erc20: token,
    owner,
    spender,
    allowance: 1_000000n,
    nonce,
    deadline,
  },
  ChainId.EthMainnet,
);
const signature = await walletClient.signTypedData(typedData);
```
