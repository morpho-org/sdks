# Morpho SDKs

[![npm version](https://img.shields.io/npm/v/@morpho-org/morpho-sdk.svg)](https://www.npmjs.com/package/@morpho-org/morpho-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

![image](https://github.com/user-attachments/assets/c77d5054-5342-4c1b-81ae-b8c002c2fd8d)

<p align="center"><i>A collection of Software Development Kits to ease interactions with the Morpho protocol and Morpho Vaults.</i></p>
<br />

## Getting Started

### ⭐ [`@morpho-org/morpho-sdk`](./packages/morpho-sdk/) — the recommended entry point

**Start here.** `@morpho-org/morpho-sdk` is the abstraction layer that simplifies the Morpho protocol: it builds ready-to-send transactions for **VaultV1** (MetaMorpho), **VaultV2**, and **MarketV1** (Morpho Blue) on any EVM-compatible chain.

---

### Secondary packages

The packages below are lower-level building blocks. Use them only if `@morpho-org/morpho-sdk` does not cover your use case.

For read-only integrations, `@morpho-org/morpho-ts` + `@morpho-org/blue-sdk` + `@morpho-org/blue-sdk-viem` is a strong alternative: it avoids the transaction-building surface of `@morpho-org/morpho-sdk`, minimizes bundle size and integration complexity, and keeps the integration focused on reads. The tradeoff is installing three separate packages instead of one.

#### Viem

- [**`@morpho-org/blue-sdk-viem`**](./packages/blue-sdk-viem/): Viem-based augmentation of `@morpho-org/blue-sdk` that exports (and optionally injects) viem-based fetch methods
- [**`@morpho-org/bundler-sdk-viem`**](./packages/bundler-sdk-viem/): Viem-based extension of `@morpho-org/simulation-sdk` that exports utilities to transform simple interactions on Morpho (such as `Blue_Borrow`) and Morpho Vaults (such as `MetaMorpho_Deposit`) into the required bundles (with ERC20 approvals, transfers, etc) to submit to the bundler onchain
- [**`@morpho-org/liquidity-sdk-viem`**](./packages/liquidity-sdk-viem/): Viem-based package that helps seamlessly calculate the liquidity available through the PublicAllocator

#### WDK (Tether Wallet Development Kit)

- [**`@morpho-org/wdk-protocol-lending-morpho-evm`**](./packages/wdk-protocol-lending-morpho-evm/) `(Apache-2.0)`: WDK lending module that bridges WDK EVM accounts (`@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-evm-erc-4337`) to `@morpho-org/morpho-sdk`, exposing vault and market flows (`supply`, `withdraw`, `borrow`, `repay`, collateral) with matching `quote*` / `get*Requirements`. Ships a Bare runtime entry alongside Node.

#### Development

- [**`@morpho-org/morpho-ts`**](./packages/morpho-ts/): TypeScript package to handle all things time & format-related

- [**`@morpho-org/blue-sdk`**](./packages/blue-sdk/): Framework-agnostic package that defines Morpho-related entity classes (such as `Market`, `Token`, `Vault`)

- [**`@morpho-org/evm-simulation`**](./packages/evm-simulation/): EVM simulation engine for Morpho transactions, with Tenderly REST and `eth_simulateV1` backends, signature authorization handling, sanctions screening, and bundler retention checks

### Testing

- [**`@morpho-org/test`**](./packages/test/): Viem-based package that exports utilities to build Vitest & Playwright fixtures that spawn anvil forks as child processes

- [**`@morpho-org/morpho-test`**](./packages/morpho-test/): Framework-agnostic extension of `@morpho-org/blue-sdk` that exports test fixtures useful for E2E tests on forks

### Deprecated packages

The packages below are retained for existing integrations. Prefer `@morpho-org/morpho-sdk` or the non-deprecated packages above for new work.

- [**`@morpho-org/blue-sdk-wagmi`**](./packages/blue-sdk-wagmi/): Wagmi-based package that exports Wagmi (React) hooks to fetch Morpho-related entities
- [**`@morpho-org/liquidation-sdk-viem`**](./packages/liquidation-sdk-viem/): Viem-based package that provides utilities to build viem-based liquidation bots on Morpho and examples using Flashbots and Morpho's GraphQL API
- [**`@morpho-org/simulation-sdk`**](./packages/simulation-sdk/): Framework-agnostic package that defines methods to simulate interactions on Morpho (such as `Supply`, `Borrow`) and Morpho Vaults (such as `Deposit`, `Withdraw`)
- [**`@morpho-org/simulation-sdk-wagmi`**](./packages/simulation-sdk-wagmi/): Wagmi-based extension of `@morpho-org/simulation-sdk` that exports Wagmi (React) hooks to fetch simulation states
- [**`@morpho-org/test-wagmi`**](./packages/test-wagmi/): Wagmi-based extension of `@morpho-org/test` that injects a test Wagmi config as a test fixture alongside viem's anvil client

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
- [@Foulks-Plb](https://github.com/Foulks-Plb) ([Twitter](https://x.com/FoulkPlb))
- [@0xbulma](https://github.com/0xbulma)
- [@oumar-fall](https://github.com/oumar-fall) (oumix.eth)
- [@julien-devatom](https://github.com/oumar-fall) ([Twitter](https://x.com/julien_devatom))

## License

MIT — see [LICENSE](/LICENSE).

Exception: `packages/wdk-protocol-lending-morpho-evm` ships under Apache-2.0 (see its [LICENSE](./packages/wdk-protocol-lending-morpho-evm/LICENSE)).
