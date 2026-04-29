# evm-simulation Conventions

- Simulate EVM bundles through Tenderly REST first when configured and supported; fall back to `eth_simulateV1` only for `ExternalServiceError`.
- Keep the simulation pipeline staged as validation, authorization resolution, backend execution, parsing, and retention checks.
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

## Continuous Improvement

- Keep backend I/O isolated behind normalized simulation results; public simulation behavior should not depend on hidden backend state.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer typed failures and explicit backend support rules over broad catch/fallback logic.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
