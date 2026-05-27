# @morpho-org/test

## 2.8.1

### Patch Changes

- [#742](https://github.com/morpho-org/sdks/pull/742) [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix npm source metadata by publishing full repository URLs and monorepo package directories.

## 2.8.0

### Minor Changes

- [#596](https://github.com/morpho-org/sdks/pull/596) [`79443e5`](https://github.com/morpho-org/sdks/commit/79443e5814e939428b7e5bbeb30729903305cf81) Thanks [@0xbulma](https://github.com/0xbulma)! - Add `./mock` sub-export providing `createMockClient`, `mockRead`, and `expectReadCall` for transport-level viem mocking in unit tests. The mock installs a `vi.fn`-backed `custom()` transport on a real viem `Client`, so SDK code that uses `viem/actions` named imports (e.g. `readContract(client, …)`) resolves through it just as it would against a live RPC. `mockRead` matches every overload of a function name, so reads against contracts with overloaded `view`/`pure` methods don't silently miss.

### Patch Changes

- [#596](https://github.com/morpho-org/sdks/pull/596) [`79443e5`](https://github.com/morpho-org/sdks/commit/79443e5814e939428b7e5bbeb30729903305cf81) Thanks [@0xbulma](https://github.com/0xbulma)! - `mockRead` (from `@morpho-org/test/mock`) now ABI-encodes the supplied `result` **per overload** of the target function name rather than once against the ambiguous `functionName`. For ABIs where overloads share a return type the behaviour is unchanged (the same bytes are stored under every selector). For ABIs where overloads have **different** return types — e.g. `counter(uint256) returns (uint256)` and `counter(address) returns (bool)` — the encoded bytes now match each overload's declared output shape, so an `eth_call` to the bool overload no longer receives uint256-shaped bytes. If the supplied `result` does not match the return shape of **any** overload, `mockRead` now throws a clear `Error` (`"[mockRead] options.result does not match any return-type shape of overloads of <name>"`) instead of silently registering bytes that decode incorrectly.

  (Drive-by packaging cleanup: the previously-advertised CJS `require` condition for `./mock` is removed from `publishConfig.exports` and `mock.ts` is excluded from the CJS build. The entry was crash-on-load — `mock.ts` imports vitest, which rejects `require()` — so no working consumer is affected; only the unusable metadata is gone.)

## 2.7.3

### Patch Changes

- [#648](https://github.com/morpho-org/sdks/pull/648) [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh packages that need a release after direct dependency, peer dependency, or source compatibility changes.

  - Update direct runtime dependency ranges for packages using `@noble/hashes`, `zod`, `@velora-dex/sdk`, `mutative`, `viem-deal`, and `viem-tracer`.
  - Widen React and TypeScript peer ranges in the Wagmi adapters only where the updated development dependencies require it, while preserving the previous lower-bound support.
  - Keep the SDK source compatible with the refreshed toolchain and libraries, including TypeScript 6, `@noble/hashes` 2.x subpath imports, TanStack Query/Wagmi inference changes, and viem error formatting; related tests/assertions were updated to match the refreshed dependencies.
