# @morpho-org/blue-sdk

<a href="https://www.npmjs.com/package/@morpho-org/blue-sdk">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/blue-sdk?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/blue-sdk?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/blue-sdk/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/blue-sdk?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/blue-sdk?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/blue-sdk">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/blue-sdk?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/blue-sdk?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

Framework-agnostic package that defines Morpho-related entity classes:

- [**`MarketConfig`**](./src/market/MarketConfig.ts): represents the immutable configuration of a market on Morpho
- [**`Market`**](./src/market/Market.ts): represents the state of a market on Morpho
- [**`Token`**](./src/token/Token.ts): represents a ERC20 token
- [**`User`**](./src/user/User.ts): represents a user of Morpho
- [**`VaultConfig`**](./src/vault/VaultConfig.ts): represents the configuration of a Morpho Vault
- [**`Vault`**](./src/vault/Vault.ts): represents the state of a Morpho Vault
- [**`VaultUser`**](./src/vault/VaultUser.ts): represents the state of a user on a Morpho Vault
- [**`VaultMarketAllocation`**](./src/vault/VaultMarketAllocation.ts): represents the allocation (and configuration) of a Morpho Vault on a Morpho market

## Installation

```bash
npm install @morpho-org/blue-sdk
```

```bash
yarn add @morpho-org/blue-sdk
```

## Getting Started

### Instance of the immutable configuration of a specific market

Leverage the [`MarketConfig`](./src/market/MarketConfig.ts) class to manipulate a given market's immutable configuration:

```typescript
import { MarketConfig } from "@morpho-org/blue-sdk";

const config = new MarketConfig({
  loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", // wstETH
  oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC", // AdaptiveCurveIrm
  lltv: 94_5000000000000000n, // 94.5%
});

config.liquidationIncentiveFactor; // e.g. 1_090000000000000000n (109%).
```

### Instance of a specific market

Leverage the [`Market`](./src/market/Market.ts) class to manipulate a specific market:

```typescript
import { Market } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";

const market = new Market({
  config: new MarketConfig({
    loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", // wstETH
    oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC", // AdaptiveCurveIrm
    lltv: 94_5000000000000000n, // 94.5%
  }),
  totalSupplyAssets: 1000_000000000000000000n,
  totalBorrowAssets: 920_000000000000000000n,
  totalSupplyShares: 1000_000000000000000000000000n,
  totalBorrowShares: 920_000000000000000000000000n,
  lastUpdate: 1721000000n,
  fee: 0n,
  price: 1_100000000000000000000000000000000000n,
  rateAtTarget: 94850992095n,
});

market.utilization; // e.g. 92_0000000000000000n (92%).
market.liquidity; // e.g. 80_000000000000000000n (in loan assets).
market.apyAtTarget; // e.g. 3_0000000000000000n (3%).

const accruedMarket = market.accrueInterest(Time.timestamp()); // Accrue interest to the latest's timestamp.

accruedMarket.toSupplyAssets(shares); // Convert supply shares to assets.
```

### Instance of the position of a specific user on a specific market

Leverage the [`Position`](./src/position/Position.ts) class to manipulate the position of a user on a given market:

```typescript
import { Position } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";

const position = new AccrualPosition(
  new Position({
    user,
    marketId: market.id,
    supplyShares: 0n,
    borrowShares: 20_000000000000000000000000n,
    collateral: 27_000000000000000000n,
  }),
  market
);

position.borrowAssets; // e.g. 20_000000000000000000n (in loan assets).
position.isHealthy; // e.g. true.
position.maxBorrowableAssets; // e.g. 2100_000000000000000000n (in loan assets).

const accruedPosition = position.accrueInterest(Time.timestamp()); // Accrue interest to the latest's timestamp.

position.borrowAssets; // e.g. 20_400000000000000000n (in loan assets).
```