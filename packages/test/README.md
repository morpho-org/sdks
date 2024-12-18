# @morpho-org/test

<a href="https://www.npmjs.com/package/@morpho-org/test">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/test?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/test?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/test/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/test?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/test?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/test">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/test?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/test?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

Viem-based package that exports utilities to build Vitest & Playwright fixtures that spawn anvil forks as child processes.

Heavily inspired by [`prool`](https://github.com/wevm/prool), but lighter & faster.

## Installation

```bash
npm install @morpho-org/test
```

```bash
yarn add @morpho-org/test
```

## Getting Started

### Vitest (viem)

Export an extended vitest `test`:

```typescript
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";

export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});
```

See more on its internal usage for [viem-based E2E tests here](../blue-sdk-viem/test/).

### Vitest (ethers)

Export an extended Vitest `test`:

```typescript
import { createEthersTest } from "@morpho-org/test/vitest/ethers";
import { mainnet } from "viem/chains";

export const test = createEthersTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});
```

See more on its internal usage for [ethers-based E2E tests here](../blue-sdk-ethers/test/e2e/).

### Playwright

Export an extended Playwright `test`:

```typescript
import { createViemTest } from "@morpho-org/test/playwright";
import { mainnet } from "viem/chains";

export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});
```

### Spawn anvil instances

```typescript
import { mainnet } from "viem/chains";
import { spawnAnvil } from "@morpho-org/test";

spawnAnvil(mainnet, { forkBlockNumber: 19_750_000n });
```
