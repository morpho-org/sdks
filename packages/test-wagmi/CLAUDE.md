# test-wagmi Conventions

- Build Wagmi fixtures on top of `@morpho-org/test`; do not spawn Anvil directly here.
- `createWagmiTest` extends `createViemTest` with a Wagmi `config` fixture.
- Use Wagmi's `mock` connector with `testAccount()` addresses.
- React helpers wrap renders with `WagmiProvider` and `QueryClientProvider`.
- Clear caller-provided query clients before render helpers reuse them.
- Disable Wagmi reconnects in tests: `reconnectOnMount: false`.
- Default React Query tests to `retry: false` and infinite `gcTime`.
- Extend async waits through the wrapper `waitFor`, not raw Testing Library defaults.
