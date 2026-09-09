[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchToken

# Function: fetchToken()

> **fetchToken**(`address`, `client`, `__namedParameters?`): `Promise`\<[`Token`](../../../blue-sdk/src/classes/Token.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/Token.ts:71](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/Token.ts#L71)

Fetches token metadata, EIP-5267 permit domain metadata, and wrapper metadata.

Reads native token metadata locally for `NATIVE_ADDRESS`. For ERC20 tokens, uses the deployless
`GetToken` query by default and falls back to ERC20, EIP-5267, wstETH, and local unwrap-token
reads when allowed.

## Parameters

### address

`` `0x${string}` ``

Token address, or `NATIVE_ADDRESS` for the native asset.

### client

`Client`

Viem client used for deployless reads or multicalls.

### \_\_namedParameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`Token`](../../../blue-sdk/src/classes/Token.md)\>

The hydrated `Token`, `ConstantWrappedToken`, or `ExchangeRateWrappedToken` entity.

## Example

```ts
import type { Token } from "@morpho-org/blue-sdk";
import { fetchToken } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const token: Token = await fetchToken(usdc, client);
```
