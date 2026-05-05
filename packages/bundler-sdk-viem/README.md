# @morpho-org/bundler-sdk-viem

<a href="https://www.npmjs.com/package/@morpho-org/bundler-sdk-viem">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/bundler-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/bundler-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/bundler-sdk-viem/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/bundler-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/bundler-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/bundler-sdk-viem">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/bundler-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/bundler-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

## Overview

Viem-based extension of `@morpho-org/simulation-sdk` that exports utilities to transform simple interactions on Morpho (such as `Blue_Borrow`) and Morpho Vaults (such as `MetaMorpho_Deposit`) into the required bundles (with ERC20 approvals, transfers, etc) to submit to the bundler onchain.

## Installation

```bash
npm install @morpho-org/bundler-sdk-viem
```

```bash
yarn add @morpho-org/bundler-sdk-viem
```

## Usage

Use this package to turn high-level Morpho and Morpho Vault simulation operations into executable bundler transactions, including the required approvals, transfers, and bundler actions.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
