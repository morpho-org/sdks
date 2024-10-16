# @morpho-org/blue-sdk-wagmi

<a href="https://www.npmjs.com/package/@morpho-org/blue-sdk-wagmi">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/blue-sdk-wagmi?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/blue-sdk-wagmi?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/wevm/@morpho-org/blue-sdk-wagmi/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/blue-sdk-wagmi?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/blue-sdk-wagmi?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/blue-sdk-wagmi">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/blue-sdk-wagmi?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/blue-sdk-wagmi?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

Wagmi-based package that exports Wagmi (React) hooks to fetch Morpho-related entities.

## Installation

```bash
npm install @morpho-org/blue-sdk-wagmi
```

```bash
yarn add @morpho-org/blue-sdk-wagmi
```

## Getting Started

```tsx
import { MarketId } from "@morpho-org/blue-sdk";
import { useMarket } from "@morpho-org/blue-sdk-wagmi";

export function Component({ marketId }: { marketId?: MarketId }) {
  const { data: market } = useMarket({ marketId });

  return (
    <h1>
      {market?.config.loanToken} / {market?.config.collateralToken}
    </h1>
  );
}
```
