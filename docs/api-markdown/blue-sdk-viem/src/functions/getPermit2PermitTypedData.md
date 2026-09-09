[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / getPermit2PermitTypedData

# Function: getPermit2PermitTypedData()

> **getPermit2PermitTypedData**(`args`, `chainId`): `MessageDefinition`\<\{ `PermitDetails`: `object`[]; `PermitSingle`: `object`[]; \}, `"PermitSingle"`\>

Defined in: [packages/blue-sdk-viem/src/signatures/permit2.ts:65](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/signatures/permit2.ts#L65)

Builds Permit2 allowance typed data for signing.

## Parameters

### args

[`Permit2PermitArgs`](../interfaces/Permit2PermitArgs.md)

Permit2 allowance message fields.

### chainId

[`ChainId`](../../../morpho-ts/src/enumerations/ChainId.md)

Chain id whose Permit2 deployment verifies the signature.

## Returns

`MessageDefinition`\<\{ `PermitDetails`: `object`[]; `PermitSingle`: `object`[]; \}, `"PermitSingle"`\>

Typed data ready to pass to a wallet for signing.

## Example

```ts
import { ChainId } from "@morpho-org/blue-sdk";
import { getPermit2PermitTypedData } from "@morpho-org/blue-sdk-viem";

const typedData = getPermit2PermitTypedData(
  {
    erc20: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    allowance: 1_000_000n,
    nonce: 0,
    deadline: 1_900_000_000n,
    spender: "0x6566194141fF46b819c55E7137D8329898eCd06C",
  },
  ChainId.EthMainnet,
);
```
