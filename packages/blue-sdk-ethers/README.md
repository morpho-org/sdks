# @morpho-org/blue-sdk-ethers

[![npm package][npm-img]][npm-url]
[![Downloads][downloads-img]][downloads-url]

> Ethers-based SDK foundational to Morpho Blue's offchain ecosystem, useful to fetch and interact with the protocol and MetaMorpho.

## Install

```bash
npm install @morpho-org/blue-sdk
```

```bash
yarn add @morpho-org/blue-sdk
```

---

## Getting Started

### Fetch the config of a specific market

Leverage the [`MarketConfig`](./src/market/MarketConfig.ts) class to fetch and calculate minimal information on a given market's immutable configuration:

```typescript
import { MarketConfig } from "@morpho-org/blue-sdk";

const config = await MarketConfig.fetch(
  "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc",
  provider // Ethers provider.
);

market.collateralToken; // e.g. 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0.
```

### Fetch data of a specific market

Leverage the [`Market`](./src/market/Market.ts) class to fetch and calculate useful information on a specific market:

```typescript
import { Market } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";

const market = await Market.fetch(
  "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc",
  provider // Ethers provider.
);

// Or from a config, to fetch faster:
// const market = Market.fetchFromConfig(
//   config,
//   provider // Ethers provider.
// );

market.utilization; // e.g. 92% (scaled by WAD).
market.liquidity; // e.g. 23_000000n (in loan assets).
market.apyAtTarget; // e.g. 3% (scaled by WAD).

const accruedMarket = market.accrueInterest(Time.timestamp()); // Accrue interest to the latest's timestamp.

accruedMarket.toSupplyAssets(shares); // Convert supply shares to assets.
```

### Fetch data on the position of a specific user on a specific market

Leverage the [`Position`](./src/position/Position.ts) class to fetch and calculate useful information about the position of a user on a given market:

```typescript
import { Position } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";

const position = await AccrualPosition.fetch(
  "0x7f65e7326F22963e2039734dDfF61958D5d284Ca",
  "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc",
  provider // Ethers provider.
);

// Or from a config, to fetch faster:
// const position = AccrualPosition.fetchFromConfig(
//   "0x7f65e7326F22963e2039734dDfF61958D5d284Ca",
//   config,
//   provider // Ethers provider.
// );

position.borrowAssets; // e.g. 23_000000n (in loan assets).
position.isHealthy; // e.g. true.
position.maxBorrowableAssets; // e.g. 2100_000000n (in loan assets).

const accruedPosition = position.accrueInterest(Time.timestamp()); // Accrue interest to the latest's timestamp.

position.borrowAssets; // e.g. 23_500000n (in loan assets).
```

[downloads-img]: https://img.shields.io/npm/dt/@morpho-org/blue-sdk
[downloads-url]: https://www.npmtrends.com/@morpho-org/blue-sdk
[npm-img]: https://img.shields.io/npm/v/@morpho-org/blue-sdk
[npm-url]: https://www.npmjs.com/package/@morpho-org/blue-sdk
