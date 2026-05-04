# Morpho SDKs

[![npm version](https://img.shields.io/npm/v/@morpho-org/morpho-sdk.svg)](https://www.npmjs.com/package/@morpho-org/morpho-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![CI](https://github.com/morpho-org/sdks/actions/workflows/test.yml/badge.svg)](https://github.com/morpho-org/sdks/actions/workflows/test.yml)

![image](https://github.com/user-attachments/assets/c77d5054-5342-4c1b-81ae-b8c002c2fd8d)

<p align="center"><i>A collection of Software Development Kits to ease interactions with the Morpho protocol and Morpho Vaults.</i></p>
<br />

## Getting Started

### ⭐ [`@morpho-org/morpho-sdk`](./packages/morpho-sdk/) — the recommended entry point

**Start here.** `@morpho-org/morpho-sdk` is the abstraction layer that simplifies the Morpho protocol: it builds ready-to-send transactions for **VaultV1** (MetaMorpho), **VaultV2**, and **MarketV1** (Morpho Blue) on any EVM-compatible chain.

- One client (`MorphoClient`) wraps a viem `Client` and exposes `vaultV1`, `vaultV2`, and `marketV1` entities.
- Every action returns a lazy `{ buildTx, getRequirements }` handle so consumers can resolve approvals, permits, and Morpho authorizations before submitting.
- Routes each operation through the safest path: bundler3 + GeneralAdapter1 with `maxSharePrice` / `minSharePrice` slippage protection where it matters, direct contract calls where it doesn't.
- Supports native-token wrapping, atomic V1 → V2 migrations, and shared-liquidity reallocations via the PublicAllocator.

For most integrators, `@morpho-org/morpho-sdk` is all you need.

---

### Secondary packages

The packages below are lower-level building blocks. Use them only if `@morpho-org/morpho-sdk` does not cover your use case.

#### Viem

- [**`@morpho-org/blue-sdk-viem`**](./packages/blue-sdk-viem/): Viem-based augmentation of `@morpho-org/blue-sdk` that exports (and optionally injects) viem-based fetch methods
- [**`@morpho-org/bundler-sdk-viem`**](./packages/bundler-sdk-viem/): Viem-based extension of `@morpho-org/simulation-sdk` that exports utilities to transform simple interactions on Morpho (such as `Blue_Borrow`) and Morpho Vaults (such as `MetaMorpho_Deposit`) into the required bundles (with ERC20 approvals, transfers, etc) to submit to the bundler onchain
- [**`@morpho-org/liquidity-sdk-viem`**](./packages/liquidity-sdk-viem/): Viem-based package that helps seamlessly calculate the liquidity available through the PublicAllocator
- [**`@morpho-org/liquidation-sdk-viem`**](./packages/liquidation-sdk-viem/): Viem-based package that provides utilities to build viem-based liquidation bots on Morpho and examples using Flashbots and Morpho's GraphQL API

#### Wagmi

- [**`@morpho-org/blue-sdk-wagmi`**](./packages/blue-sdk-wagmi/) `⚠️ deprecated`: Wagmi-based package that exports Wagmi (React) hooks to fetch Morpho-related entities
- [**`@morpho-org/simulation-sdk-wagmi`**](./packages/simulation-sdk-wagmi/) `⚠️ deprecated`: Wagmi-based extension of `@morpho-org/simulation-sdk` that exports Wagmi (React) hooks to fetch simulation states

#### Development

- [**`@morpho-org/morpho-ts`**](./packages/morpho-ts/): TypeScript package to handle all things time & format-related

- [**`@morpho-org/blue-sdk`**](./packages/blue-sdk/): Framework-agnostic package that defines Morpho-related entity classes (such as `Market`, `Token`, `Vault`)

- [**`@morpho-org/simulation-sdk`**](./packages/simulation-sdk/) `⚠️ deprecated`: Framework-agnostic package that defines methods to simulate interactions on Morpho (such as `Supply`, `Borrow`) and Morpho Vaults (such as `Deposit`, `Withdraw`)

### Testing

- [**`@morpho-org/test`**](./packages/test/): Viem-based package that exports utilities to build Vitest & Playwright fixtures that spawn anvil forks as child processes
- [**`@morpho-org/test-wagmi`**](./packages/test-wagmi/): Wagmi-based extension of `@morpho-org/test` that injects a test Wagmi config as a test fixture alongside viem's anvil client

- [**`@morpho-org/morpho-test`**](./packages/morpho-test/): Framework-agnostic extension of `@morpho-org/blue-sdk` that exports test fixtures useful for E2E tests on forks

### Test coverage

1. Install `lcov`: `sudo apt install lcov`
2. Generate coverage info: `pnpm test:coverage`
3. Generate hierarchical coverage report: `pnpm coverage:report`

## Developer

### Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, contribution workflow, and the inline checklist for listing a new chain to support.

### Security

See [SECURITY.md](./SECURITY.md) for vulnerability reporting and supported security scope.

## Debugging

Here's a tutorial on how to link a specific package to debug at runtime:

1. From the repository in which you want to link the package: `pnpm link ../your/relative/path/to/sdks/packages/blue-sdk`

```diff
-    "@morpho-org/blue-sdk": "5.0.0",
+    "@morpho-org/blue-sdk": "link:../../../sdks/packages/blue-sdk",
```

2. Modify `blue-sdk` [package.json](./packages/blue-sdk/package.json) to use js main & js files:

```diff
-  "main": "src/index.ts",
+  "main": "lib/index.js",
+  "types": "lib/index.d.ts"
```

3. In a separate process, start: `pnpm --dir packages/blue-sdk build --watch`

## Authors

- [@rubilmax](https://github.com/rubilmax) (rubilmax.eth, [Twitter](https://x.com/rubilmax))
- [@oumar-fall](https://github.com/oumar-fall) (oumix.eth)
- [@julien-devatom](https://github.com/oumar-fall) ([Twitter](https://x.com/julien_devatom))
- [@Foulks-Plb](https://github.com/Foulks-Plb) ([Twitter](https://x.com/FoulkPlb))

## License

[MIT](/LICENSE) License
