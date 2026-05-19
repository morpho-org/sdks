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

Biome owns formatting and linting. Run `pnpm lint` before pushing; the repository also runs Biome through lint-staged when hooks are installed.

The full style and packaging rules — NodeNext imports, `.js` extensions, type-only imports, `bigint` for onchain quantities, SDK type reuse, generated-output edits, etc. — live in [`AGENTS.md`](./AGENTS.md) §8. Don't restate them here; if you change them, change them there.

## Pull Request Process

1. Create a focused branch from the target base branch.
2. Make the smallest coherent change for the PR — one concern per PR (see [`AGENTS.md`](./AGENTS.md) §8).
3. Add or update tests when behavior changes. Tests are colocated next to source where the package is wired for it; see [`AGENTS.md`](./AGENTS.md) §5.
4. Run `pnpm lint` and `pnpm test`.
5. Add a changeset only for semver-relevant published package changes (see Changesets below).

## Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) for release management. The full policy on when a changeset is required, the bump levels, and the pre/post-release flow lives in [`AGENTS.md`](./AGENTS.md) §7 — read it once, then use this section as the operational quick-reference.

When a PR changes published package source in a way that should be released:

```bash
pnpm changeset
```

Bump levels: `patch` (bug fixes / internal maintenance), `minor` (additive surface), `major` (breaking changes). Commit the generated `.changeset/*.md` with the source change. Do NOT update `CHANGELOG.md` files manually in the feature PR — the generated release PR owns those edits.

Skip the changeset when the diff is repo metadata, non-API documentation-only, fixture-only, generated-output-only, or tests-only. JSDoc-only changes to published package source MAY ship a patch changeset when maintainers want them in release notes.

### Release flow (what happens after merge)

After changes land on `main` or `next`, the push workflow runs lint, build, and tests. If pending changesets exist, CI runs `pnpm run version`, pushes `changeset-release/<branch>`, and opens or updates the `chore: version packages (<branch>)` release PR. The release PR merge triggers publishing — `latest` from `main`, `next` from `next`. The publish job pushes git tags and creates one GitHub Release per published package.

Before merging `next` back into `main`, run `pnpm changeset pre exit` and commit the resulting `.changeset/pre.json` change so stable releases on `main` cannot inherit prerelease mode.

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
