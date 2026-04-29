# Contributing to `@morpho-org/morpho-sdk`

Thanks for taking the time to contribute. This document describes the development workflow, code style, and PR process for this repository.

## Development Setup

### Prerequisites

- **Node.js `24`** — see [`.nvmrc`](./.nvmrc). Use `nvm use` to match.
- **pnpm `10`** — declared via the `packageManager` field in `package.json`. Enable with `corepack enable`.
- **Git**.

### Clone & install

```bash
git clone https://github.com/morpho-org/morpho-sdk.git
cd morpho-sdk
pnpm install --frozen-lockfile
```

### Running the test suite

Tests hit real Ethereum mainnet state via a forked RPC. Set a `MAINNET_RPC_URL` environment variable pointing to an Ethereum mainnet RPC endpoint:

```bash
export MAINNET_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/<your-key>"
pnpm test
```

A free-tier Alchemy or Infura key is sufficient. The CI runs the full suite on every PR — if you cannot configure a local RPC, push a draft PR and rely on CI for test validation.

Other useful commands:

```bash
pnpm lint          # Biome check
pnpm build         # TS typecheck + build to ./lib
pnpm test:ui       # Vitest UI
pnpm test:coverage # Coverage report
```

## Code Style

This repository uses [Biome](https://biomejs.dev/) for formatting and linting.

- **Indentation:** 2 spaces
- **Quotes:** double quotes
- **No unused imports or variables** — `pnpm lint` will flag them
- **Strict TypeScript:** zero `any`, all strict flags enabled, `type` imports where possible, `readonly` on properties
- **Immutability:** every returned `Transaction` object must be `deepFreeze`-d
- **Comments:** default to no comments. Add one only when the _why_ is non-obvious

Run `pnpm lint` before pushing. A pre-commit hook (`husky`) runs it automatically if installed.

## Architecture

Before making non-trivial changes, read:

- [`README.md`](./README.md) — high-level usage
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — layering, dependency map
- [`CLAUDE.md`](./CLAUDE.md) — non-negotiables (immutability, LLTV buffer, `maxSharePrice`, etc.)

The SDK enforces a strict **Client → Entity → Action** layering. Never skip a layer. Never bypass the general adapter for deposits (inflation attack vector).

## Pull Request Process

1. **Fork** the repo and create a branch from `main`. Use a descriptive prefix: `feat/...`, `fix/...`, `chore/...`, `docs/...`.
2. Make your changes. Keep PRs focused — one logical change per PR.
3. **Add a changeset** describing user-facing impact:
   ```bash
   pnpm changeset
   ```
   Pick `patch` / `minor` / `major` and write a short changelog entry. PRs without a changeset will fail CI.
4. Run `pnpm lint && pnpm build && pnpm test` locally.
5. Push and open a PR against `main`.
6. CI must pass. A maintainer will review.
7. Once approved, a maintainer will merge. The `changesets/action` bot will open a "Version Packages" PR; merging that PR triggers the npm release.

## Reporting bugs

Open an issue on GitHub. Include:

- SDK version
- `viem` version
- Chain ID
- Minimal reproduction (the exact call that misbehaves)
- Expected vs actual behavior

## Reporting security vulnerabilities

**Do not open a public issue.** See [SECURITY.md](./SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
