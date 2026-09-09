[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / getPermit2TransferFromTypedData

# Function: getPermit2TransferFromTypedData()

> **getPermit2TransferFromTypedData**(`args`, `chainId`): `MessageDefinition`\<\{ `PermitTransferFrom`: `object`[]; `TokenPermissions`: `object`[]; \}, `"PermitTransferFrom"`\>

Defined in: [packages/blue-sdk-viem/src/signatures/permit2.ts:131](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/signatures/permit2.ts#L131)

Builds Permit2 signature-transfer typed data for signing.

## Parameters

### args

[`Permit2TransferFromArgs`](../interfaces/Permit2TransferFromArgs.md)

Permit2 signature-transfer message fields.

### chainId

[`ChainId`](../../../morpho-ts/src/enumerations/ChainId.md)

Chain id whose Permit2 deployment verifies the signature.

## Returns

`MessageDefinition`\<\{ `PermitTransferFrom`: `object`[]; `TokenPermissions`: `object`[]; \}, `"PermitTransferFrom"`\>

Typed data ready to pass to a wallet for signing.

## Example

```ts
import { ChainId } from "@morpho-org/blue-sdk";
import { getPermit2TransferFromTypedData } from "@morpho-org/blue-sdk-viem";

const typedData = getPermit2TransferFromTypedData(
  {
    erc20: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    allowance: 1_000_000n,
    spender: "0x6566194141fF46b819c55E7137D8329898eCd06C",
    nonce: 0n,
    deadline: 1_900_000_000n,
  },
  ChainId.EthMainnet,
);
```
