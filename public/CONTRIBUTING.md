# Contributing to Morpho SDKs

This monorepo contains the TypeScript SDK packages used to interact with the Morpho protocol, Morpho Vaults, simulation tooling, and related test utilities.

## Development Setup

### Prerequisites

- Node.js `>=26 <27`
- pnpm `11`, declared by the root `packageManager` field
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

Biome owns formatting and linting. Run `pnpm lint` before pushing; the repository also runs Biome through lint-staged when hooks are installed.

## How This Repository Is Released

This repository holds the source of each published release. Every commit on `main` is a release: it is synced from the SDK team's development repository once that release has passed its checks, and merging it publishes the changed packages to npm with provenance, tags them and creates one GitHub Release per package.

## Pull Request Process

1. Create a focused branch from `main`.
2. Make the smallest coherent change, one concern per PR.
3. Add or update tests when behavior changes. Colocate `*.test.ts` unit tests with their modules; put `*.integration.test.ts` fork/integration tests under the package's `test/` directory.
4. Run `pnpm lint` and `pnpm test`.

Maintainers port accepted changes to the development repository, and they reach `main` with the next release.

## Listing a New Chain to Support

Use this checklist when adding a chain to the SDKs.

### 1. Add the Chain ID

Update `packages/morpho-ts/src/chain.ts`:

```typescript
export enum ChainId {
  YourNewChain = 12345,
}
```

### 2. Add Chain Metadata

Update `CHAIN_METADATA` in `packages/morpho-ts/src/chain.ts`:

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

Update `_addressesRegistry` in `packages/morpho-ts/src/addresses.ts`:

```typescript
[ChainId.YourNewChain]: {
  blue: "0x...",
  bundles: {
    vaultExitBundlesV1: "0x...",
    vaultBundlesV1: "0x...",
    blueBundlesV1: "0x...",
  },
  adaptiveCurveIrm: "0x...",
  vaultV2BluePublicAllocator: "0x...",
  metaMorphoFactory: "0x...",
  chainlinkOracleFactory: "0x...",
  preLiquidationFactory: "0x...",
  wNative: "0x...",
},
```

Register USDC only when it supports ERC-2612 permit version 2. Add Permit2 when available so transactional flows can use Permit2 instead of classic ERC-20 approval.

### 4. Add Deployment Blocks

Update `_deployments` in `packages/morpho-ts/src/addresses.ts`:

```typescript
[ChainId.YourNewChain]: {
  blue: 12345678n,
  bundles: {
    vaultExitBundlesV1: 12345679n,
    vaultBundlesV1: 12345680n,
    blueBundlesV1: 12345681n,
  },
  adaptiveCurveIrm: 12345682n,
  vaultV2BluePublicAllocator: 12345683n,
  metaMorphoFactory: 12345684n,
  chainlinkOracleFactory: 12345685n,
  preLiquidationFactory: 12345686n,
  wNative: 12345687n,
},
```

### 5. Add Wrapped Native Token Mapping

Update `_unwrappedTokensMapping` in `packages/morpho-ts/src/addresses.ts`:

```typescript
[ChainId.YourNewChain]: {
  [_addressesRegistry[ChainId.YourNewChain].wNative]: NATIVE_ADDRESS,
},
```

### 6. Verify the Chain Listing

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
