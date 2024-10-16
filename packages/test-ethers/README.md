# @morpho-org/test-ethers

<a href="https://www.npmjs.com/package/@morpho-org/test-ethers">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/test-ethers?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/test-ethers?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/wevm/@morpho-org/test-ethers/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/test-ethers?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/test-ethers?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/test-ethers">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/test-ethers?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/test-ethers?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

Ethers-based extension of [`@morpho-org/test-viem`](../test-viem/) that injects a test Ethers wallet as a test fixture alongside viem's anvil client.

## Installation

```bash
npm install @morpho-org/test-ethers
```

```bash
yarn add @morpho-org/test-ethers
```

## Getting Started

Export an extended vitest `test`:

```typescript
import { createEthersTest } from "@morpho-org/test-ethers";
import { mainnet } from "viem/chains";

export const test = createEthersTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});
```

See more on its internal usage for [ethers-based E2E tests here](../blue-sdk-ethers/test/e2e/).