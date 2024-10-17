# @morpho-org/blue-sdk-viem

<a href="https://www.npmjs.com/package/@morpho-org/blue-sdk-viem">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/blue-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/blue-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/blue-sdk-viem/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/blue-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/blue-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/blue-sdk-viem">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/blue-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/blue-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

Viem-based augmentation of [`@morpho-org/blue-sdk`](../blue-sdk/) that exports (and optionally injects) viem-based fetch methods.

## Installation

```bash
npm install @morpho-org/blue-sdk-viem
```

```bash
yarn add @morpho-org/blue-sdk-viem
```

## Getting Started

### Augment blue-sdk entity classes with fetchers

Opt in classes augmentation to easily fetch an entire entity of the Morpho Blue & MetaMorpho ecosystem using viem:

```typescript
// Granular, opt-in, per-entity class augmentation:
import "@morpho-org/blue-sdk-viem/lib/augment/AccrualPosition";
import "@morpho-org/blue-sdk-viem/lib/augment/Holding";
import "@morpho-org/blue-sdk-viem/lib/augment/Market";
import "@morpho-org/blue-sdk-viem/lib/augment/MarketConfig";
import "@morpho-org/blue-sdk-viem/lib/augment/Position";
import "@morpho-org/blue-sdk-viem/lib/augment/Token";
import "@morpho-org/blue-sdk-viem/lib/augment/VaultConfig";
import "@morpho-org/blue-sdk-viem/lib/augment/Vault";
import "@morpho-org/blue-sdk-viem/lib/augment/VaultUser";
import "@morpho-org/blue-sdk-viem/lib/augment/VaultMarketAllocation";
import "@morpho-org/blue-sdk-viem/lib/augment/VaultMarketConfig";
import "@morpho-org/blue-sdk-viem/lib/augment/VaultMarketPublicAllocatorConfig";

// Or full, opt-in class augmentation:
import "@morpho-org/blue-sdk-viem/lib/augment";
```

### Fetch the config of a specific market

Leverage the [`MarketConfig`](./src/market/MarketConfig.ts) class to fetch information on a given market's immutable configuration:

```typescript
import { MarketId } from "@morpho-org/blue-sdk";
// /!\ Import AccrualPosition from the augmentation file (or simply import the file)
import { MarketConfig } from "@morpho-org/blue-sdk-viem/lib/augment/MarketConfig";

const config = await MarketConfig.fetch(
  "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" as MarketId,
  client // viem client.
);

config.collateralToken; // e.g. 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0.
```

### Fetch data of a specific market

Leverage the [`Market`](./src/market/Market.ts) class to fetch information on a specific market:

```typescript
import { Time } from "@morpho-org/morpho-ts";
import { MarketId } from "@morpho-org/blue-sdk";
// /!\ Import AccrualPosition from the augmentation file (or simply import the file)
import { Market } from "@morpho-org/blue-sdk-viem/lib/augment/Market";

const market = await Market.fetch(
  "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" as MarketId,
  client // viem client.
);

market.utilization; // e.g. 92% (scaled by WAD).
market.liquidity; // e.g. 23_000000n (in loan assets).
market.apyAtTarget; // e.g. 3% (scaled by WAD).

const accruedMarket = market.accrueInterest(Time.timestamp()); // Accrue interest to the latest's timestamp.

accruedMarket.toSupplyAssets(shares); // Convert supply shares to assets.
```

### Fetch data on the position of a specific user on a specific market

Leverage the [`Position`](./src/position/Position.ts) class to fetch the position of a user on a given market:

```typescript
import { Time } from "@morpho-org/morpho-ts";
import { MarketId } from "@morpho-org/blue-sdk";
// /!\ Import AccrualPosition from the augmentation file (or simply import the file)
import { AccrualPosition } from "@morpho-org/blue-sdk-viem/lib/augment/Position";

const position = await AccrualPosition.fetch(
  "0x7f65e7326F22963e2039734dDfF61958D5d284Ca",
  "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" as MarketId,
  client // viem client.
);

position.borrowAssets; // e.g. 23_000000n (in loan assets).
position.isHealthy; // e.g. true.
position.maxBorrowableAssets; // e.g. 2100_000000n (in loan assets).

const accruedPosition = position.accrueInterest(Time.timestamp()); // Accrue interest to the latest's timestamp.

position.borrowAssets; // e.g. 23_500000n (in loan assets).
```

[downloads-img]: https://img.shields.io/npm/dt/@morpho-org/blue-sdk-viem
[downloads-url]: https://www.npmtrends.com/@morpho-org/blue-sdk-viem
[npm-img]: https://img.shields.io/npm/v/@morpho-org/blue-sdk-viem
[npm-url]: https://www.npmjs.com/package/@morpho-org/blue-sdk-viem
