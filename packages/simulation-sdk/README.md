# @morpho-org/simulation-sdk

<a href="https://www.npmjs.com/package/@morpho-org/simulation-sdk">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/simulation-sdk?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/simulation-sdk?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/simulation-sdk/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/simulation-sdk?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/simulation-sdk?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/simulation-sdk">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/simulation-sdk?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/simulation-sdk?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

## Overview

Framework-agnostic package that defines methods to simulate interactions on Morpho (such as `Supply`, `Borrow`) and Morpho Vaults (such as `Deposit`, `Withdraw`).

## Installation

```bash
npm install @morpho-org/simulation-sdk
```

```bash
yarn add @morpho-org/simulation-sdk
```

## Usage

Use the framework-agnostic simulation state and operation helpers to model Morpho and Morpho Vault interactions before execution. Pair it with `@morpho-org/bundler-sdk-viem` for bundler transaction construction or `@morpho-org/simulation-sdk-wagmi` for React data fetching.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
