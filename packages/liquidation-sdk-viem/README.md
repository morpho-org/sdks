# @morpho-org/liquidation-sdk-viem

<a href="https://www.npmjs.com/package/@morpho-org/liquidation-sdk-viem">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/liquidation-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/liquidation-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/liquidation-sdk-viem/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/liquidation-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/liquidation-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/liquidation-sdk-viem">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/liquidation-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/liquidation-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

Viem-based package that provides utilities to build viem-based liquidation bots on Morpho and examples using Flashbots and Morpho's GraphQL API.

## Installation

```bash
npm install @morpho-org/liquidation-sdk-viem
```

```bash
yarn add @morpho-org/liquidation-sdk-viem
```

## Getting Started

An example liquidation bot currently used in production is available under [examples/](./examples/).

This bot, provided a list of whitelisted markets to monitor, automatically:

1. Fetches liquidatable positions from the API
2. Finds the largest available liquidity for a swap of the collateral for the debt via 1inch
3. Redeems collateral MetaMorpho shares for the underlying assets when applicable
4. Only submit profitable liquidations (wrt to the gas cost & the swap's slippage)
