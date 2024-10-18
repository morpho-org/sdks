# @morpho-org/morpho-test

<a href="https://www.npmjs.com/package/@morpho-org/morpho-test">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/morpho-test?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/morpho-test?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/morpho-test/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/morpho-test?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/morpho-test?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/morpho-test">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/morpho-test?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/morpho-test?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

Framework-agnostic extension of [`@morpho-org/blue-sdk`](../blue-sdk/) that exports test fixtures useful for E2E tests on forks.

## Installation

```bash
npm install @morpho-org/morpho-test
```

```bash
yarn add @morpho-org/morpho-test
```

## Getting Started

```typescript
import { ChainId } from "@morpho-org/blue-sdk";
import { markets } from "@morpho-org/morpho-test";

const { usdc_wstEth, usdc_idle, eth_wstEth } = markets[ChainId.EthMainnet];
```

See more on its internal usage for [E2E tests here](../blue-sdk-viem/test/Market.test.ts).
