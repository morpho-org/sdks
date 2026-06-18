# evm-simulation Conventions

- Simulate EVM bundles through Tenderly RPC (`tenderly_simulateTransaction` / `tenderly_simulateBundle`) first when configured for the chain; fall back to `eth_simulateV1` only for `ExternalServiceError`.
- Keep the simulation pipeline staged as validation, authorization resolution, backend execution, parsing, and retention checks.
- Let `SimulationRevertedError` propagate; a revert belongs to the bundle, not the backend.
- Keep backend outputs normalized to `RawSimulationResult`; add new backends under `src/simulate/backends/` with colocated parity specs.
- Encode signature authorizations as `approve(spender, amount ?? maxUint256)` and prepend them to the simulated bundle.
- To simulate a signature-gated call in place (e.g. an EIP-2612 `permit`) without a real signature, use `SimulateParams.ecrecoverOverride`: both backends install an `ecrecover` shim at `0x…0001` via a `code` state-override (Tenderly also relocates the genuine precompile via `movePrecompileToAddress`; `eth_simulateV1` installs the shim only — viem's serializer drops the relocation field). Build the shim bytecode via `buildEcrecoverShimCode`; the addresses are the `ECRECOVER_PRECOMPILE_ADDRESS` / `ECRECOVER_RELOCATED_ADDRESS` constants.
- Enforce bundler retention by net `(bundler3 address, token)` balance with `DUST_THRESHOLD = 100n`; skip only unknown blue-sdk chains.
- Keep all thrown domain errors under `SimulationPackageError`; only `ExternalServiceError` is bypassable by callers.
- Add chains through caller `SimulationConfig.chains`; the per-chain `ChainSimulationConfig` is a discriminated union enforcing at least one of `tenderlyRpc` or `simulateV1Url`. Confirm blue-sdk bundler addresses intentionally.
- Keep tests colocated as `{module}.spec.ts`; put shared fixtures in `src/test-helpers/`, which must stay out of published builds.

## Continuous Improvement

- Keep backend I/O isolated behind normalized simulation results; public simulation behavior should not depend on hidden backend state.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer typed failures and explicit backend support rules over broad catch/fallback logic.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
