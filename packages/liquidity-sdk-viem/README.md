# @morpho-org/liquidity-sdk-viem

<a href="https://www.npmjs.com/package/@morpho-org/liquidity-sdk-viem">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/liquidity-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/liquidity-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/liquidity-sdk-viem/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/liquidity-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/liquidity-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/liquidity-sdk-viem">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/liquidity-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/liquidity-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

## Overview

Viem-based loaders for computing shared liquidity from PublicAllocator V1 and the Vault V2 BluePublicAllocator.

## Installation

```bash
npm install @morpho-org/liquidity-sdk-viem
```

```bash
yarn add @morpho-org/liquidity-sdk-viem
```

## Usage

### Vault V1

```typescript
import type { MarketId } from "@morpho-org/blue-sdk";
import { LiquidityLoader } from "@morpho-org/liquidity-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const loader = new LiquidityLoader(client);
const marketId =
  "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" as MarketId;

const { withdrawals, startState, endState, targetBorrowUtilization } =
  await loader.fetch(marketId);
```

`LiquidityLoader` discovers PublicAllocator V1 vaults through the Morpho API, snapshots their state through the viem client, and returns source-market withdrawals.

### Vault V2

```typescript
import type { MarketId } from "@morpho-org/blue-sdk";
import { VaultV2LiquidityLoader } from "@morpho-org/liquidity-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const loader = new VaultV2LiquidityLoader(client, {
  allocator: "0x0000000000000000000000000000000000000001",
  vaults: ["0x0000000000000000000000000000000000000002"],
  maxNativePenalty: 1_000_000_000_000_000n,
});
const marketId =
  "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" as MarketId;

const { reallocations, startState, endState, targetBorrowUtilization } =
  await loader.fetch(marketId);
```

`VaultV2LiquidityLoader` is a separate REST-backed loader. It reads Vault V2 configuration, state, allocations, withdrawal penalties, Blue market state, adapter positions, oracle prices, and adaptive-curve IRM state from the Morpho REST APIs. BluePublicAllocator-only configuration remains an onchain read through the supplied viem client. The allocator and participating Vault V2 addresses are explicit because the protocol has no canonical allocator registry entry. Its `reallocations` can be passed directly to Morpho SDK Blue borrow and withdraw actions.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
