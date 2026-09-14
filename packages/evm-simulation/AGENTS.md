# evm-simulation Conventions

- Simulate EVM bundles through Tenderly RPC (`tenderly_simulateTransaction` / `tenderly_simulateBundle`) first when configured for the chain; fall back to `eth_simulateV1` only for `ExternalServiceError`.
- Keep the simulation pipeline staged as validation, authorization resolution, backend execution, parsing, and retention checks.
- Let `SimulationRevertedError` propagate; a revert belongs to the bundle, not the backend.
- Keep backend outputs normalized to `RawSimulationResult`; add new backends under `src/simulate/backends/` with colocated parity tests.
- Encode signature authorizations as `approve(spender, amount ?? maxUint256)` and prepend them to the simulated bundle.
- Enforce retention by net `(restricted address, token)` balance across the blue-sdk `bundler3` and `bundles` registries with `DUST_THRESHOLD = 100n`; skip only chains that catalog neither.
- Keep all thrown domain errors under `SimulationPackageError`; only `ExternalServiceError` is bypassable by callers.
- Add chains through caller `SimulationConfig.chains`; the per-chain `ChainSimulationConfig` is a discriminated union enforcing at least one of `tenderlyRpc` or `simulateV1Url`. Confirm blue-sdk bundler addresses intentionally.
- Keep unit tests colocated as `{module}.test.ts`; put shared unit fixtures in `src/test-helpers/`, which must stay out of published builds. Keep fork tests under `test/` as `*.integration.test.ts`.

## Continuous Improvement

- Keep backend I/O isolated behind normalized simulation results; public simulation behavior should not depend on hidden backend state.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer typed failures and explicit backend support rules over broad catch/fallback logic.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
