# evm-simulation Conventions

- Simulate EVM bundles through Tenderly REST first when configured and supported; fall back to `eth_simulateV1` only for `ExternalServiceError`.
- Let `SimulationRevertedError` propagate; a revert belongs to the bundle, not the backend.
- Keep backend outputs normalized to `RawSimulationResult`; add new backends under `src/simulate/backends/` with colocated parity specs.
- Treat `shareable` as the only Tenderly persistence knob; translate it to `save` / `save_if_fails` only in the Tenderly REST adapter.
- Encode signature authorizations as `approve(spender, amount ?? maxUint256)` and prepend them to the simulated bundle.
- Screen all transfer and transaction `from` / `to` addresses; static sanctions always run, Chainalysis runs only when configured.
- Fail open on Chainalysis transport errors, but fail closed when an address was registered and lookup then fails.
- Enforce bundler retention by net `(bundler3 address, token)` balance with `DUST_THRESHOLD = 100n`; skip only unknown blue-sdk chains.
- Keep all thrown domain errors under `SimulationPackageError`; only `ExternalServiceError` is bypassable by callers.
- Add chains through caller `SimulationConfig.chains`; set `simulateV1Url`, optional Tenderly support, and confirm blue-sdk bundler addresses intentionally.
- Keep tests colocated as `{module}.spec.ts`; put shared fixtures in `src/test-helpers/`, which must stay out of published builds.
- Verify package changes with `pnpm --filter @morpho-org/evm-simulation build` and `pnpm --filter @morpho-org/evm-simulation test`.
