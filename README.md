# Morpho SDKs

A collection of Software Development Kits to ease interactions with the Morpho protocol and Morpho Vaults.

## Getting Started

### Development

- [`@morpho-org/morpho-ts`](./packages/morpho-ts/README.md): TypeScript package to handle all things time & format-related

- [`@morpho-org/blue-sdk`](./packages/blue-sdk/README.md): Framework-agnostic package that defines Morpho-related entity classes (such as `Market`, `Token`, `Vault`)
- [`@morpho-org/blue-sdk-viem`](./packages/blue-sdk-viem/README.md): Viem-based augmentation of `@morpho-org/blue-sdk-viem` that exports (and optionally injects) viem-based fetch methods
- [`@morpho-org/blue-sdk-ethers`](./packages/blue-sdk-ethers/README.md): Ethers-based augmentation of `@morpho-org/blue-sdk-ethers` that exports (and optionally injects) ethers-based fetch methods
- [`@morpho-org/blue-sdk-wagmi`](./packages/blue-sdk-wagmi/README.md): Wagmi-based package that exports Wagmi (React) hooks to fetch Morpho-related entities

- [`@morpho-org/simulation-sdk`](./packages/simulation-sdk/README.md): Framework-agnostic package that defines methods to simulate interactions on Morpho (such as `Supply`, `Borrow`) and Morpho Vaults (such as `Deposit`, `Withdraw`)
- [`@morpho-org/simulation-sdk-wagmi`](./packages/simulation-sdk-wagmi/README.md): Wagmi-based extension of `@morpho-org/simulation-sdk` that exports Wagmi (React) hooks to fetch simulation states

- [`@morpho-org/bundler-sdk-viem`](./packages/bundler-sdk-viem/README.md): Viem-based extension of `@morpho-org/simulation-sdk` that exports utilities to transform simple interactions on Morpho (such as `Blue_Borrow`) and Morpho Vaults (such as `MetaMorpho_Deposit`) into the required bundles (with ERC20 approvals, transfers, etc) to submit to the bundler onchain

- [`@morpho-org/blue-api-sdk`](./packages/blue-api-sdk/README.md): GraphQL SDK that exports types from the [API's GraphQL schema](https://blue-api.morpho.org/graphql) and a useful Apollo cache controller

### Testing

- [`@morpho-org/test`](./packages/test/README.md): Framework-agnostic package that exports utilities to build test fixtures and spawn anvil forks as child processes

- [`@morpho-org/test-viem`](./packages/test-viem/README.md): (Viem+vitest)-based package that defines utilities to spawn independent, concurrent anvil forks for each test, injecting the corresponding viem client as a test fixture
- [`@morpho-org/test-ethers`](./packages/test-ethers/README.md):  Ethers-based extension of `@morpho-org/test-viem` that injects a test Ethers wallet as a test fixture alongside viem's anvil client
- [`@morpho-org/test-wagmi`](./packages/test-wagmi/README.md):  Wagmi-based extension of `@morpho-org/test-viem` that injects a test Wagmi config as a test fixture alongside viem's anvil client