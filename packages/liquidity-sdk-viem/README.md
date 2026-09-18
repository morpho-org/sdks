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

> [!WARNING]
> This Vault V1 PublicAllocator package is deprecated and remains on `@morpho-org/morpho-sdk` v5.
> New integrations should use the Vault V2 BluePublicAllocator APIs in `@morpho-org/morpho-sdk`.

Viem-based package that calculates the shared liquidity available through the Vault V1 PublicAllocator using Morpho's GraphQL API and onchain reads.

## Installation

```bash
npm install @morpho-org/liquidity-sdk-viem
```

```bash
yarn add @morpho-org/liquidity-sdk-viem
```

## Migration to Vault V2

`LiquidityLoader`, `LiquidityLoader.fetch`, and `LiquidityParameters` are deprecated because they only plan Vault V1 PublicAllocator reallocations.

Use a Morpho Blue entity from `client.morpho.blue(marketParams, chainId)`:

1. Fetch a block with `client.getBlock()`.
2. Call `market.getVaultV2BlueReallocationData({ vaultAddresses, block })` with the Vault V2 addresses to inspect.
3. Call `market.getVaultV2BlueReallocations({ reallocationData, options })` to compute action-ready `reallocations` and the resulting `data` snapshot.

Configure the source-market withdrawal ceiling with `VaultV2BluePublicAllocatorOptions.maxWithdrawalUtilization`, a single WAD-scaled `bigint` for all source markets. The V2 API accepts an explicit vault allowlist and returns V2 reallocation descriptors; it is not a drop-in replacement for the API-backed V1 loader.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
