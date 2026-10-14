# Contributing to Morpho SDKs

This monorepo contains the TypeScript SDK packages used to interact with the Morpho protocol, Morpho Vaults, simulation tooling, and related test utilities.

## Development Setup

### Prerequisites

- Node.js `>=26 <27`
- pnpm `11`, declared by the root `packageManager` field
- Git
- Optional: a Morpho eRPC key (`ERPC_SECRET`); without it, hand-written fork suites use the chain's public RPC and registry E2E suites are skipped

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

Fork suites need Foundry's Anvil v1.8.5, the version CI pins (`foundryup -i v1.8.5`). On older Anvil versions, the Base Midnight fork tests fail.

Hand-written Anvil fork suites fall back to the chain's public RPC when `ERPC_SECRET` is unset. Registry-driven E2E suites require the Morpho eRPC and skip eligible chains without the secret; WDK integration suites are skipped without it. Outside contributors can run tests that do not require those fork suites:

```bash
pnpm test
```

Registry-driven E2E suites run every scenario on each chain whose address registry has the
scenario's deployments, forked at a pinned block through the Morpho eRPC. `E2E_CHAINS` selects
chains by id or `ChainId` name; selecting a chain without `ERPC_SECRET` throws
`E2eErpcSecretUnsetError`. Public contributors can run hand-written fork suites against the chain's
public RPC, but registry-driven E2E forks and WDK integration suites are skipped without an eRPC key:

```bash
pnpm test:e2e                                    # every eligible chain when ERPC_SECRET is set
E2E_CHAINS=BaseMainnet pnpm test:e2e             # one chain (or E2E_CHAINS=8453)
pnpm test:e2e -t e2e/vaultV2                     # one scenario family
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

This repository holds the source of each published release. Every push to `main` is a release: the SDK team's development repository builds it once that release has passed its checks, and a dedicated GitHub App pushes it to `main` as GitHub-signed commits, without a pull request. That push publishes the changed packages to npm with provenance, tags them and creates one GitHub Release per package.

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
