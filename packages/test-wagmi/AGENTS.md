# test-wagmi Conventions

## Deprecated package freeze

- `@morpho-org/test-wagmi` is frozen/deprecated. Do not make feature, address, ABI, dependency, test, JSDoc, refactor, or changeset updates in this package.
- Only PRs explicitly scoped to deprecation metadata or source deletion may touch this package, and those PRs must not add new supported behavior.
- If requested work appears to require this package, stop and move the maintained surface to `@morpho-org/morpho-sdk`, `@morpho-org/blue-sdk`, or `@morpho-org/blue-sdk-viem` as appropriate, or leave this package unchanged.

- Build Wagmi fixtures on top of `@morpho-org/test`; do not spawn Anvil directly here.
- `createWagmiTest` extends `createViemTest` with a Wagmi `config` fixture.
- `vitest.ts` owns fixture extension; `react.ts` owns provider wrapping.
- Use Wagmi's `mock` connector with `testAccount()` addresses.
- React helpers wrap renders with `WagmiProvider` and `QueryClientProvider`.
- Clear caller-provided query clients before render helpers reuse them.
- Disable Wagmi reconnects in tests: `reconnectOnMount: false`.
- Default React Query tests to `retry: false` and infinite `gcTime`.
- Extend async waits through the wrapper `waitFor`, not raw Testing Library defaults.

## Continuous Improvement

- This package is the React/Wagmi test boundary; do not move React fixture coupling into `@morpho-org/test`.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer composing base viem fixtures over duplicating fork or account setup.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
