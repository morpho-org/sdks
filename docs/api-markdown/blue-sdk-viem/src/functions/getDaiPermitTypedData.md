[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / getDaiPermitTypedData

# ~~Function: getDaiPermitTypedData()~~

> **getDaiPermitTypedData**(`args`, `chainId`): `MessageDefinition`\<\{ `Permit`: readonly \[\{ `name`: `"holder"`; `type`: `"address"`; \}, \{ `name`: `"spender"`; `type`: `"address"`; \}, \{ `name`: `"nonce"`; `type`: `"uint256"`; \}, \{ `name`: `"expiry"`; `type`: `"uint256"`; \}, \{ `name`: `"allowed"`; `type`: `"bool"`; \}\]; \}, `"Permit"`\>

Defined in: [packages/blue-sdk-viem/src/signatures/permit.ts:179](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/signatures/permit.ts#L179)

Builds DAI-style permit typed data for signing.

## Parameters

### args

[`DaiPermitArgs`](../interfaces/DaiPermitArgs.md)

DAI permit message fields.

### chainId

[`ChainId`](../../../morpho-ts/src/enumerations/ChainId.md)

Chain id whose DAI deployment verifies the signature.

## Returns

`MessageDefinition`\<\{ `Permit`: readonly \[\{ `name`: `"holder"`; `type`: `"address"`; \}, \{ `name`: `"spender"`; `type`: `"address"`; \}, \{ `name`: `"nonce"`; `type`: `"uint256"`; \}, \{ `name`: `"expiry"`; `type`: `"uint256"`; \}, \{ `name`: `"allowed"`; `type`: `"bool"`; \}\]; \}, `"Permit"`\>

Typed data ready to pass to a wallet for signing.

## Deprecated

Not used by any SDK flow — DAI approvals are routed through
Permit2 / classic approval internally (DAI's non-standard permit is
incompatible with the ERC-2612 simple-permit path). Prefer the Permit2 flow.
Scheduled for removal in the next major.

## Remarks

DAI's permit is **boolean**: any `allowance > 0n` authorizes the
spender for `type(uint256).max`, not the passed amount — there is no
finite-allowance DAI permit.

## Example

```ts
import { ChainId } from "@morpho-org/blue-sdk";
import { getDaiPermitTypedData } from "@morpho-org/blue-sdk-viem";

const typedData = getDaiPermitTypedData(
  {
    owner: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    spender: "0x6566194141fF46b819c55E7137D8329898eCd06C",
    allowance: 1_000_000_000_000_000_000n,
    nonce: 0n,
    deadline: 1_900_000_000n,
  },
  ChainId.EthMainnet,
);
```
