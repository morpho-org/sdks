# @morpho-org/test-wagmi

<a href="https://www.npmjs.com/package/@morpho-org/test-wagmi">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/test-wagmi?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/test-wagmi?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/test-wagmi/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/test-wagmi?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/test-wagmi?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/test-wagmi">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/test-wagmi?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/test-wagmi?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

Wagmi-based extension of [`@morpho-org/test-viem`](../test-viem/) that injects a test Wagmi config as a test fixture alongside viem's anvil client.

## Installation

```bash
npm install @morpho-org/test-wagmi
```

```bash
yarn add @morpho-org/test-wagmi
```

## Getting Started

Export an extended vitest `test`:

```typescript
import { createWagmiTest } from "@morpho-org/test-wagmi";
import { mainnet } from "viem/chains";

export const test = createWagmiTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});
```

See more on its internal usage for [wagmi-based tests here](../blue-sdk-wagmi/test/e2e/).
