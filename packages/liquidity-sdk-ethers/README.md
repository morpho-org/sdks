# @morpho-org/liquidity-sdk-ethers

<a href="https://www.npmjs.com/package/@morpho-org/liquidity-sdk-ethers">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/liquidity-sdk-ethers?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/liquidity-sdk-ethers?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/liquidity-sdk-ethers/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/liquidity-sdk-ethers?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/liquidity-sdk-ethers?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/liquidity-sdk-ethers">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/liquidity-sdk-ethers?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/liquidity-sdk-ethers?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

Viem-based package that provides utilities to build ethers-based liquidity bots on Morpho and examples using Flashbots and Morpho's GraphQL API.

## Installation

```bash
npm install @morpho-org/liquidity-sdk-ethers
```

```bash
yarn add @morpho-org/liquidity-sdk-ethers
```

## Getting Started

### Fetch from API or RPC

```typescript
import { LiquidityLoader } from "@morpho-org/liquidity-sdk-ethers";

const loader = new LiquidityLoader(
  client // ethers client.
);

const [withdrawals1, withdrawals2] = await Promise.all([
  loader.fetch(
    "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" as MarketId,
    "api"
  ),
  loader.fetch(
    "0xe475337d11be1db07f7c5a156e511f05d1844308e66e17d2ba5da0839d3b34d9" as MarketId,
    "rpc"
  ),
]);
```

### Fetch only from API

```typescript
import { ChainId } from "@morpho-org/blue-sdk";
import { LiquidityLoader } from "@morpho-org/liquidity-sdk-ethers";

const loader = new LiquidityLoader({ chainId: ChainId.EthMainnet });

const [withdrawals1, withdrawals2] = await Promise.all([
  loader.fetch(
    "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" as MarketId
  ),
  loader.fetch(
    "0xe475337d11be1db07f7c5a156e511f05d1844308e66e17d2ba5da0839d3b34d9" as MarketId
  ),
]);
```
