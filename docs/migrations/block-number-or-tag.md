# Migrate to one block selector

The next majors of `blue-sdk-viem` (6), `midnight-sdk` (2), `morpho-sdk` (6), and
`evm-simulation` (5) replace their block-selection inputs with one optional
`block: BlockNumberOrTag`. `liquidity-sdk-viem` (5) adopts the new fetcher peers.
This explicitly requested breaking replacement does not retain the old fields.

## Representation

```ts
import type { BlockNumberOrTag, BlockTag } from "@morpho-org/morpho-sdk";

const historical: BlockNumberOrTag = { type: "number", value: 20_000_000n };
const finalized: BlockNumberOrTag = { type: "tag", value: "finalized" };
```

The type is defined once in `@morpho-org/morpho-ts` and re-exported from
`morpho-sdk` and `morpho-sdk/types`. All fields are readonly. `BlockTag` is the
SDK-owned union `"latest" | "earliest" | "pending" | "safe" | "finalized"`.

[Alloy's BlockNumberOrTag](https://alloy.rs/migrating-from-ethers/conversions)
represents a numbered block or one of these tags. The TypeScript API uses an
explicit `type` discriminator to follow the repository's union convention and
make exhaustive narrowing straightforward. A bare `bigint | BlockTag` would
also prevent contradictory selectors, but would not follow that convention.
There is no new runtime dependency.

## Mechanical migration

| Previous SDK options | New SDK options |
| --- | --- |
| `{ blockNumber: height }` | `{ block: { type: "number", value: height } }` |
| `{ blockTag: "safe" }` | `{ block: { type: "tag", value: "safe" } }` |
| `{}` | `{}` |
| Simulation `{ blockNumber: "pending" }` | `{ block: { type: "tag", value: "pending" } }` |

When an old variable is optional, conditionally construct the selector:

```ts
import type { BlockNumberOrTag } from "@morpho-org/morpho-sdk";

function atHeight(height?: bigint): BlockNumberOrTag | undefined {
  return height === undefined ? undefined : { type: "number", value: height };
}
```

Do not test a height for truthiness: block `0n` is valid. When storing options
before passing them to a fetcher, annotate the selector with `BlockNumberOrTag`
or use `as const` so TypeScript preserves the literal `type` value.

### Blue fetchers, class augmentation, and entities

```ts
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { morphoViemExtension, type BlockNumberOrTag } from "@morpho-org/morpho-sdk";
import { MarketParams } from "@morpho-org/morpho-sdk/blue/entities";
import { fetchMarket } from "@morpho-org/morpho-sdk/blue/fetch";

const client = createPublicClient({ chain: mainnet, transport: http() })
  .extend(morphoViemExtension());
const params = MarketParams.idle("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const block: BlockNumberOrTag = { type: "number", value: 20_000_000n };

const market = await fetchMarket(params.id, client, { block });
const entityData = await client.morpho.blue(params, mainnet.id).getMarketData({ block });
```

The same change applies to all Blue vault, adapter, position, holding, token,
user, and allocator fetchers; `Market.fetch` and other optional class
augmentations inherit the new signature. Entity `getPositionData` and Vault V1/V2
`getData` also accept `{ block }`. Protocol facade aliases inherit the signatures.
`fetchMarketParams` is unchanged: it accepts only its existing chain override and
resolves immutable config from its registry or at `latest`.

### Midnight fetchers and entities

```ts
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { fetchRatifierInfo } from "@morpho-org/morpho-sdk/midnight/fetch";

const client = createPublicClient({ chain: base, transport: http() });
const info = await fetchRatifierInfo(client, {
  maker: "0x7b093658BE7f90B63D7c359e8f408e503c2D9401",
  block: { type: "tag", value: "safe" },
});
```

Midnight `fetchMarketParams`, `fetchMarket`, `fetchPosition`, and
`fetchAccrualPosition` accept the selector alongside `marketId` and other inputs.
For `MorphoMidnight.getMarketData`, pass `{ block }` as the second argument.
For `getPositionData`, pass `parameters: { block }`. Every nested market and
collateral read receives it, including fallback reads.

### Simulation

`simulate(config, { chainId, transactions, block })` uses the same selector.
Replace its old `blockNumber` property, whether the value was a bigint or a tag.
Both Tenderly transaction/bundle RPC and the `eth_simulateV1` fallback use it.
Simulation output fields, block objects, transaction receipts, and GraphQL
response fields retain their existing names.

## RPC defaults and snapshots

[viem calls](https://viem.sh/docs/actions/public/call) still use `blockNumber` or
`blockTag`. Do not change raw viem calls. SDK boundary code uses the pure
`toBlockParameters` helper from `morpho-ts` (also `morpho-sdk/utils`) to translate
the selector. It returns `{}` for omission, preserving the client's default;
explicit `latest` stays explicit. For ordinary clients this default is `latest`;
[client configuration](https://viem.sh/docs/clients/public) can change it.

A tag may advance between sequential reads. Use a numbered selector when all
reads must represent one snapshot. The liquidity loader and Blue reallocation
fetch methods still pin all reads to their supplied/fetched `block.number`.
Their `{ number, timestamp }` snapshot inputs remain unchanged.

## Release and dependency audit

| Package | Bump / peer action | Reason |
| --- | --- | --- |
| `morpho-ts` | Minor to 2.13; no runtime dependencies | Adds shared types and conversion. |
| `blue-sdk-viem` | Major; morpho-ts peer `^2.13.0` | Replaces public fetch options and needs the new runtime helper. Blue SDK peer stays `^6.8.0`. |
| `midnight-sdk` | Major; morpho-ts peer `^2.13.0` | Replaces public fetch options and needs the helper. |
| `morpho-sdk` | Major | Replaces entity/facade fetch inputs; direct workspace dependencies resolve the updated packages. Viem remains its only peer. |
| `evm-simulation` | Major | Replaces simulation's selector; existing direct morpho-ts dependency supplies the helper. |
| `liquidity-sdk-viem` | Major; blue-sdk-viem peer `^6.0.0`, morpho-sdk peer `^6.0.0` | Migrates pinned calls and no longer supports the old peer compatibility set. Existing Blue and morpho-ts peers remain valid. |
| `wdk-protocol-lending-morpho-evm` | Patch | Maintained direct dependent of Blue fetchers and morpho-sdk; uses fetch defaults and exposes no block-selector input. |
| `blue-sdk` | No release required | Only JSDoc examples change. Its morpho-ts peer already accepts 2.13 and it uses no new symbol. |
| `morpho-test` | No release required | Existing Blue/morpho-ts/test peer ranges remain compatible; no new symbol is consumed. |
| `test` | No release required | No affected runtime dependency or API. |

The changeset records every affected maintained dependent. Workspace runtime
ranges stay `workspace:^`; Changesets resolves release versions. Internal peer
ranges are updated explicitly. Historical TIBs and generated outputs are unchanged.
