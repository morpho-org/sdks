# @morpho-org/simulation-sdk-wagmi

<a href="https://www.npmjs.com/package/@morpho-org/simulation-sdk-wagmi">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/simulation-sdk-wagmi?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/simulation-sdk-wagmi?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/simulation-sdk-wagmi/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/simulation-sdk-wagmi?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/simulation-sdk-wagmi?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/simulation-sdk-wagmi">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/simulation-sdk-wagmi?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/simulation-sdk-wagmi?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

Wagmi-based package that exports Wagmi (React) hooks to fetch Morpho-related entities.

## Installation

```bash
npm install @morpho-org/simulation-sdk-wagmi
```

```bash
yarn add @morpho-org/simulation-sdk-wagmi
```

## Getting Started

```tsx
import { useMemo } from "react";

import { Address, MarketId } from "@morpho-org/blue-sdk";
import { simulateOperation } from "@morpho-org/simulation-sdk";
import { useSimulationState } from "@morpho-org/simulation-sdk-wagmi";

export function Component({
  user,
  marketId,
}: {
  user?: Address;
  marketId?: MarketId;
}) {
  const { data } = useSimulationState({ marketIds: [marketId], users: [user] });

  const simulated = useMemo(() => {
    if (data == null) return;

    return simulateOperation(
      {
        type: "Blue_Supply",
        sender: user,
        args: {
          id: marketId,
          onBehalf: user,
          assets: 1_000000n,
        },
      },
      data
    );
  }, [data, user, marketId]);

  return <h1>{simulated.getPosition(user, marketId).supplyShares}</h1>;
}
```
