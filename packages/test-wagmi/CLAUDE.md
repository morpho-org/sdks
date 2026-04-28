# test-wagmi Conventions

- Build Wagmi fixtures on top of `@morpho-org/test`; do not spawn Anvil directly here.
- `createWagmiTest` extends `createViemTest` with a Wagmi `config` fixture.
- Use Wagmi's `mock` connector with `testAccount()` addresses.
- React helpers wrap renders with `WagmiProvider` and `QueryClientProvider`.
- Clear caller-provided query clients before render helpers reuse them.
