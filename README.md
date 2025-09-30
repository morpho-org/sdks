# Morpho SDKs

![image](https://github.com/user-attachments/assets/c77d5054-5342-4c1b-81ae-b8c002c2fd8d)

<p align="center"><i>A collection of Software Development Kits to ease interactions with the Morpho protocol and Morpho Vaults.</i></p>
<br />

## Getting Started

### Viem

- [**`@morpho-org/blue-sdk-viem`**](./packages/blue-sdk-viem/): Viem-based augmentation of `@morpho-org/blue-sdk` that exports (and optionally injects) viem-based fetch methods
- [**`@morpho-org/bundler-sdk-viem`**](./packages/bundler-sdk-viem/): Viem-based extension of `@morpho-org/simulation-sdk` that exports utilities to transform simple interactions on Morpho (such as `Blue_Borrow`) and Morpho Vaults (such as `MetaMorpho_Deposit`) into the required bundles (with ERC20 approvals, transfers, etc) to submit to the bundler onchain
- [**`@morpho-org/liquidity-sdk-viem`**](./packages/liquidity-sdk-viem/): Viem-based package that helps seamlessly calculate the liquidity available through the PublicAllocator
- [**`@morpho-org/liquidation-sdk-viem`**](./packages/liquidation-sdk-viem/): Viem-based package that provides utilities to build viem-based liquidation bots on Morpho and examples using Flashbots and Morpho's GraphQL API

### Wagmi

- [**`@morpho-org/blue-sdk-wagmi`**](./packages/blue-sdk-wagmi/): Wagmi-based package that exports Wagmi (React) hooks to fetch Morpho-related entities
- [**`@morpho-org/simulation-sdk-wagmi`**](./packages/simulation-sdk-wagmi/): Wagmi-based extension of `@morpho-org/simulation-sdk` that exports Wagmi (React) hooks to fetch simulation states

### Development

- [**`@morpho-org/morpho-ts`**](./packages/morpho-ts/): TypeScript package to handle all things time & format-related

- [**`@morpho-org/blue-sdk`**](./packages/blue-sdk/): Framework-agnostic package that defines Morpho-related entity classes (such as `Market`, `Token`, `Vault`)

- [**`@morpho-org/simulation-sdk`**](./packages/simulation-sdk/): Framework-agnostic package that defines methods to simulate interactions on Morpho (such as `Supply`, `Borrow`) and Morpho Vaults (such as `Deposit`, `Withdraw`)

- [**`@morpho-org/blue-api-sdk`**](./packages/blue-api-sdk/): GraphQL SDK that exports types from the [API's GraphQL schema](https://blue-api.morpho.org/graphql) and a useful Apollo cache controller

### Testing

- [**`@morpho-org/test`**](./packages/test/): Viem-based package that exports utilities to build Vitest & Playwright fixtures that spawn anvil forks as child processes
- [**`@morpho-org/test-wagmi`**](./packages/test-wagmi/): Wagmi-based extension of `@morpho-org/test` that injects a test Wagmi config as a test fixture alongside viem's anvil client

- [**`@morpho-org/morpho-test`**](./packages/morpho-test/): Framework-agnostic extension of `@morpho-org/blue-sdk` that exports test fixtures useful for E2E tests on forks

## Getting involved

Learn [how to add a new chain configuration](./docs/adding-new-chain.md) to the sdks.

## Authors

- [@rubilmax](https://github.com/rubilmax) (rubilmax.eth, [Twitter](https://x.com/rubilmax))
- [@oumar-fall](https://github.com/oumar-fall) (oumix.eth)
- [@julien-devatom](https://github.com/oumar-fall) ([Twitter](https://x.com/julien_devatom))

## License

[MIT](/LICENSE) License
