# @morpho-org/test

<a href="https://www.npmjs.com/package/@morpho-org/test">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/test?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/test?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/wevm/@morpho-org/test/blob/main/LICENSE">
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

Framework-agnostic package that exports utilities to build test fixtures and spawn anvil forks as child processes.

Heavily inspired by [`prool`](https://github.com/wevm/prool), but lighter & faster.

Internally used by [`@morpho-org/test-viem`](../test-viem/) to spawn independent, concurrent anvil forks for each test.

## Installation

```bash
npm install @morpho-org/test
```

```bash
yarn add @morpho-org/test
```

## Getting Started

```typescript
import { mainnet } from "viem/chains";
import { spawnAnvil } from "@morpho-org/test";

spawnAnvil(mainnet, { forkBlockNumber: 19_750_000n })
```