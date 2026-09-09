[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / morphoViemExtension

# Function: morphoViemExtension()

> **morphoViemExtension**(`_options?`): \<`TClient`\>(`client`) => `object`

Defined in: [packages/morpho-sdk/src/client/morphoViemExtension.ts:110](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/client/morphoViemExtension.ts#L110)

Returns a viem `extend(...)` function that adds a stateless `morpho` namespace to a viem client.
The namespace rides on top of the same client (one transport / chain / account) and exposes the
protocol entity factories under `client.morpho`, so reads and writes share one client.

Holds no state beyond configuration: no cache, no `init()`, no warm-up. Each factory call
(`client.morpho.vaultV1`, `vaultV2`, `blue`, `midnight`) returns a fresh entity bound to the client.

## Parameters

### \_options?

Optional SDK-wide options forwarded to the `morpho` namespace.

#### metadata?

[`Metadata`](../interfaces/Metadata.md)

Optional analytics metadata applied to every transaction the
  `morpho` namespace builds.

#### supportDeployless?

`boolean`

Whether entity fetchers may use deployless multicall.

#### supportSignature?

`boolean`

Whether the integrator can collect EIP-712 signatures for
  permit / permit2. Defaults to `false` (classic approvals only).

## Returns

A viem extension function — `client.extend(morphoViemExtension(...))` adds
  `client.morpho`.

\<`TClient`\>(`client`) => `object`

## Example

```ts
import { createWalletClient, http, publicActions } from "viem";
import { mainnet } from "viem/chains";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";

const client = createWalletClient({
  chain: mainnet,
  transport: http(),
  account: user,
})
  .extend(publicActions)
  .extend(morphoViemExtension({ supportSignature: true }));

// Native viem reads and Morpho factories share the same client:
const block = await client.getBlockNumber();
const vault = client.morpho.vaultV1(vaultAddress, 1);
const vaultData = await vault.getData();
const { buildTx } = vault.deposit({
  amount: 1_000_000n,
  userAddress: user,
  vaultData,
});
const tx = buildTx();
```
