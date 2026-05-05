# Contributing to Morpho SDKs

This monorepo contains the TypeScript SDK packages used to interact with the Morpho protocol, Morpho Vaults, simulation tooling, and related test utilities.

## Development Setup

### Prerequisites

- Node.js `>=22`
- pnpm `10`, declared by the root `packageManager` field
- Git
- An Ethereum mainnet RPC URL for fork-backed tests

Enable pnpm through Corepack if needed:

```bash
corepack enable
```

### Clone and Install

```bash
git clone https://github.com/morpho-org/sdks.git
cd sdks
pnpm install --frozen-lockfile
```

### Run Checks

Run the root checks before opening a PR:

```bash
pnpm lint
pnpm test
```

Tests that fork mainnet require `MAINNET_RPC_URL`:

```bash
export MAINNET_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/<your-key>"
pnpm test
```

Other useful commands:

```bash
pnpm build
pnpm test:coverage
pnpm coverage:report
```

## Code Style

Biome owns formatting and linting:

- Use 2-space indentation and double quotes.
- Keep TypeScript strict and NodeNext-friendly.
- Use type-only imports where possible.
- Include `.js` extensions on relative TypeScript imports.
- Prefer `bigint` for onchain quantities and WAD-scaled rates.
- Reuse SDK protocol types such as `Address`, `MarketId`, `ChainId`, and `BigIntish`.
- Keep package public APIs explicit through `src/index.ts`.
- Do not edit generated build output in `lib/`.

Run `pnpm lint` before pushing. The repository also runs Biome through lint-staged when hooks are installed.

## Pull Request Process

1. Create a focused branch from the target base branch.
2. Make the smallest coherent change for the PR.
3. Add or update tests when behavior changes.
4. Run `pnpm lint` and `pnpm test`.
5. Add a changeset for release-impacting package changes.

## Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to decide which packages are released and how their versions are bumped.

When a PR changes a package in a way that should be released, run:

```bash
pnpm changeset
```

Choose the smallest semver bump that describes the public impact:

- `patch`: bug fixes and backwards-compatible maintenance changes
- `minor`: new backwards-compatible APIs or behavior
- `major`: breaking changes

If no release is needed, add an empty changeset:

```bash
pnpm changeset --empty
```

Commit the generated `.changeset/*.md` file with the source change. Do not update package versions manually.

This repository does not keep package `CHANGELOG.md` files in source. Changesets are configured with `"changelog": false`, so contributors should not add or edit changelog files as part of normal package changes.

After changes land on `main` or `next`, CI runs `pnpm run version` (the repository script for `changeset version`) and commits generated version updates directly to that branch. The next CI run publishes only package versions that have not already been published. Releases from `main` use the `latest` npm tag; releases from `next` use Changesets prerelease mode and publish with the `next` npm tag.

Before merging `next` back into `main`, maintainers must run `pnpm changeset pre exit` and commit the resulting `.changeset/pre.json` change so stable releases on `main` cannot inherit prerelease mode.

## Listing a New Chain to Support

Use this checklist when adding a chain to the SDKs.

### 1. Add the Chain ID

Update `packages/blue-sdk/src/chain.ts`:

```typescript
export enum ChainId {
  YourNewChain = 12345,
}
```

### 2. Add Chain Metadata

Update `CHAIN_METADATA` in `packages/blue-sdk/src/chain.ts`:

```typescript
[ChainId.YourNewChain]: {
  name: "Your Chain Name",
  id: ChainId.YourNewChain,
  nativeCurrency: {
    name: "Native Token Name",
    symbol: "SYMBOL",
    decimals: 18,
  },
  explorerUrl: "https://explorer.yourchain.com",
  identifier: "yourchain",
},
```

### 3. Add Contract Addresses

Update `_addressesRegistry` in `packages/blue-sdk/src/addresses.ts`:

```typescript
[ChainId.YourNewChain]: {
  morpho: "0x...",
  bundler3: {
    bundler3: "0x...",
    generalAdapter1: "0x...",
  },
  adaptiveCurveIrm: "0x...",
  publicAllocator: "0x...",
  metaMorphoFactory: "0x...",
  chainlinkOracleFactory: "0x...",
  preLiquidationFactory: "0x...",
  wNative: "0x...",
},
```

Register USDC only when it supports ERC-2612 permit version 2. Add Permit2 when available so transactional flows can use Permit2 instead of classic ERC-20 approval.

### 4. Add Deployment Blocks

Update `_deployments` in `packages/blue-sdk/src/addresses.ts`:

```typescript
[ChainId.YourNewChain]: {
  morpho: 12345678n,
  bundler3: {
    bundler3: 12345679n,
    generalAdapter1: 12345680n,
  },
  adaptiveCurveIrm: 12345681n,
  publicAllocator: 12345682n,
  metaMorphoFactory: 12345683n,
  chainlinkOracleFactory: 12345684n,
  preLiquidationFactory: 12345685n,
  wNative: 12345686n,
},
```

### 5. Add Wrapped Native Token Mapping

Update `_unwrappedTokensMapping` in `packages/blue-sdk/src/addresses.ts`:

```typescript
[ChainId.YourNewChain]: {
  [_addressesRegistry[ChainId.YourNewChain].wNative]: NATIVE_ADDRESS,
},
```

### 6. Update the Liquidation SDK

Update `packages/liquidation-sdk-viem/src/addresses.ts`.

Add a Midas mapping, using an empty object when the chain has no Midas configuration:

```typescript
[ChainId.YourNewChain]: {},
```

Add the pre-liquidation factory configuration:

```typescript
[ChainId.YourNewChain]: {
  address: addressesRegistry[ChainId.YourNewChain].preLiquidationFactory,
  startBlock: deployments[ChainId.YourNewChain].preLiquidationFactory,
},
```

### 7. Verify the Chain Listing

- The chain ID is unique and correctly formatted.
- Contract addresses are valid and checksummed.
- Deployment blocks are accurate.
- Native currency metadata is correct.
- Explorer URL is functional.
- Required contracts are present.
- Wrapped native token mapping is correct.
- Tests or fixtures cover the new chain where relevant.

## Reporting Bugs

Open a GitHub issue with:

- Affected package and version
- `viem` or `wagmi` version when relevant
- Chain ID
- Minimal reproduction
- Expected and actual behavior

## Reporting Security Vulnerabilities

Do not open a public issue for security reports. Follow the process in [SECURITY.md](./SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
