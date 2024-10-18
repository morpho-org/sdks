# Morpho SDKs

A collection of Software Development Kits to ease interactions with the Morpho protocol and Morpho Vaults.

## Getting Started

### Development

- [**`@morpho-org/morpho-ts`**](./packages/morpho-ts/): TypeScript package to handle all things time & format-related

- [**`@morpho-org/blue-sdk`**](./packages/blue-sdk/): Framework-agnostic package that defines Morpho-related entity classes (such as `Market`, `Token`, `Vault`)
- [**`@morpho-org/blue-sdk-viem`**](./packages/blue-sdk-viem/): Viem-based augmentation of `@morpho-org/blue-sdk` that exports (and optionally injects) viem-based fetch methods
- [**`@morpho-org/blue-sdk-ethers`**](./packages/blue-sdk-ethers/): Ethers-based augmentation of `@morpho-org/blue-sdk` that exports (and optionally injects) ethers-based fetch methods
- [**`@morpho-org/blue-sdk-wagmi`**](./packages/blue-sdk-wagmi/): Wagmi-based package that exports Wagmi (React) hooks to fetch Morpho-related entities

- [**`@morpho-org/simulation-sdk`**](./packages/simulation-sdk/): Framework-agnostic package that defines methods to simulate interactions on Morpho (such as `Supply`, `Borrow`) and Morpho Vaults (such as `Deposit`, `Withdraw`)
- [**`@morpho-org/simulation-sdk-wagmi`**](./packages/simulation-sdk-wagmi/): Wagmi-based extension of `@morpho-org/simulation-sdk` that exports Wagmi (React) hooks to fetch simulation states

- [**`@morpho-org/bundler-sdk-viem`**](./packages/bundler-sdk-viem/): Viem-based extension of `@morpho-org/simulation-sdk` that exports utilities to transform simple interactions on Morpho (such as `Blue_Borrow`) and Morpho Vaults (such as `MetaMorpho_Deposit`) into the required bundles (with ERC20 approvals, transfers, etc) to submit to the bundler onchain

- [**`@morpho-org/blue-api-sdk`**](./packages/blue-api-sdk/): GraphQL SDK that exports types from the [API's GraphQL schema](https://blue-api.morpho.org/graphql) and a useful Apollo cache controller

- [**`@morpho-org/liquidation-sdk-viem`**](./packages/liquidation-sdk-viem/): Viem-based package that provides utilities to build viem-based liquidation bots on Morpho and examples using Flashbots and Morpho's GraphQL API

### Testing

- [**`@morpho-org/test`**](./packages/test/): Framework-agnostic package that exports utilities to build test fixtures and spawn anvil forks as child processes

- [**`@morpho-org/test-viem`**](./packages/test-viem/): (Viem+vitest)-based package that defines utilities to spawn independent, concurrent anvil forks for each test, injecting the corresponding viem client as a test fixture
- [**`@morpho-org/test-ethers`**](./packages/test-ethers/): Ethers-based extension of `@morpho-org/test-viem` that injects a test Ethers wallet as a test fixture alongside viem's anvil client
- [**`@morpho-org/test-wagmi`**](./packages/test-wagmi/): Wagmi-based extension of `@morpho-org/test-viem` that injects a test Wagmi config as a test fixture alongside viem's anvil client

- [**`@morpho-org/morpho-test`**](./packages/morpho-test/): Framework-agnostic extension of `@morpho-org/blue-sdk` that exports test fixtures useful for E2E tests on forks

## Authors

- [@rubilmax](https://github.com/rubilmax) (rubilmax.eth, [Twitter](https://x.com/rubilmax))
- [@oumar-fall](https://github.com/oumar-fall) (oumix.eth)
- [@julien-devatom](https://github.com/oumar-fall) ([Twitter](https://x.com/julien_devatom))

## License

[MIT](/LICENSE) License
