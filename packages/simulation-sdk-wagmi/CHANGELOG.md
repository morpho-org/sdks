# @morpho-org/simulation-sdk-wagmi

## 5.0.1

### Patch Changes

- [#722](https://github.com/morpho-org/sdks/pull/722) [`d2882d6`](https://github.com/morpho-org/sdks/commit/d2882d6535bfbd5dad09e022062b6f07f5fb2a53) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Deprecate `@morpho-org/simulation-sdk-wagmi` with no replacement package. See [DEPRECATION.md](./DEPRECATION.md) for the npm deprecation message, migration guidance, and the Wagmi-driven simulation hook surface that is not retained.

- Updated dependencies [[`d2882d6`](https://github.com/morpho-org/sdks/commit/d2882d6535bfbd5dad09e022062b6f07f5fb2a53), [`d2882d6`](https://github.com/morpho-org/sdks/commit/d2882d6535bfbd5dad09e022062b6f07f5fb2a53), [`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0)]:
  - @morpho-org/blue-sdk-wagmi@5.0.1
  - @morpho-org/simulation-sdk@4.0.1
  - @morpho-org/morpho-ts@2.5.2

## 5.0.0

### Patch Changes

- Updated dependencies [[`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987)]:
  - @morpho-org/blue-sdk@6.0.0
  - @morpho-org/blue-sdk-viem@5.0.0
  - @morpho-org/simulation-sdk@4.0.0
  - @morpho-org/blue-sdk-wagmi@5.0.0

## 4.0.2

### Patch Changes

- [#648](https://github.com/morpho-org/sdks/pull/648) [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh packages that need a release after direct dependency, peer dependency, or source compatibility changes.

  - Update direct runtime dependency ranges for packages using `@noble/hashes`, `zod`, `@velora-dex/sdk`, `mutative`, `viem-deal`, and `viem-tracer`.
  - Widen React and TypeScript peer ranges in the Wagmi adapters only where the updated development dependencies require it, while preserving the previous lower-bound support.
  - Keep the SDK source compatible with the refreshed toolchain and libraries, including TypeScript 6, `@noble/hashes` 2.x subpath imports, TanStack Query/Wagmi inference changes, and viem error formatting; related tests/assertions were updated to match the refreshed dependencies.

- Updated dependencies [[`9dce8b7`](https://github.com/morpho-org/sdks/commit/9dce8b7047266badf7c7c813074a08f51ccb8c0a), [`81825a8`](https://github.com/morpho-org/sdks/commit/81825a8864d8c4228c8476380d1ad7e76a5ee1c0), [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e)]:
  - @morpho-org/blue-sdk@5.23.3
  - @morpho-org/blue-sdk-viem@4.6.6
  - @morpho-org/blue-sdk-wagmi@4.0.2
  - @morpho-org/simulation-sdk@3.4.4
