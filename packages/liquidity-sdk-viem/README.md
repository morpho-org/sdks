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

Viem-based package that provides utilities to build viem-based liquidity bots on Morpho and examples using Flashbots and Morpho's GraphQL API.

## Installation

```bash
npm install @morpho-org/liquidity-sdk-viem
```

```bash
yarn add @morpho-org/liquidity-sdk-viem
```

## Getting Started

```typescript
import { ChainId } from "@morpho-org/blue-sdk";
import { LiquidityLoader } from "@morpho-org/liquidity-sdk-viem";

const loader = new LiquidityLoader(
  client // viem client.
);

await Promise.all([
  loader.fetch(
    "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" as MarketId
  ),
  loader.fetch(
    "0xe475337d11be1db07f7c5a156e511f05d1844308e66e17d2ba5da0839d3b34d9" as MarketId
  ),
]);
```
