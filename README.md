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

### Testing

- [**`@morpho-org/test`**](./packages/test/): Viem-based package that exports utilities to build Vitest & Playwright fixtures that spawn anvil forks as child processes
- [**`@morpho-org/test-wagmi`**](./packages/test-wagmi/): Wagmi-based extension of `@morpho-org/test` that injects a test Wagmi config as a test fixture alongside viem's anvil client

- [**`@morpho-org/morpho-test`**](./packages/morpho-test/): Framework-agnostic extension of `@morpho-org/blue-sdk` that exports test fixtures useful for E2E tests on forks

### Test coverage

1. Install `lcov`: `sudo apt install lcov`
2. Generate coverage info: `pnpm test:coverage`
3. Generate hierarchical coverage report: `pnpm coverage:report`

## Getting involved

Learn [how to add a new chain configuration](./docs/adding-new-chain.md) to the sdks.

## Developer

### Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to decide which packages are released and how their versions are bumped.

When a PR changes a package in a way that should be released, run:

```sh
pnpm changeset
```

Select every package affected by the change and choose the smallest semver bump that describes the public impact:

- `patch`: bug fixes and backwards-compatible maintenance changes
- `minor`: new backwards-compatible APIs or behavior
- `major`: breaking changes

Commit the generated `.changeset/*.md` file with the source change. Do not update package versions or changelogs manually; the release workflow does that after the change is merged.

If a package changes but no release is needed, add an empty changeset instead:

```sh
pnpm changeset --empty
```

After changes land on `main` or `next`, CI runs `pnpm run version` (the repository script for `changeset version`) and commits the generated version/changelog changes directly to that branch. The next CI run publishes only package versions that have not already been published. Releases from `main` use the `latest` npm tag; releases from `next` use Changesets prerelease mode and publish with the `next` npm tag.

Before merging `next` back into `main`, maintainers must run `pnpm changeset pre exit` and commit the resulting `.changeset/pre.json` change so stable releases on `main` cannot inherit prerelease mode.

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

## License

[MIT](/LICENSE) License
