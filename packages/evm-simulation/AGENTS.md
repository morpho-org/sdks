# evm-simulation Conventions

- Simulate EVM bundles only through `eth_simulateV1`. RPC failures, timeouts, unsupported configuration and execution reverts propagate as typed errors; never select another provider, retry execution, or return a successful result after failure. Give the sole request the full `timeoutMs` budget (default 5000 ms).
- Keep the simulation pipeline staged as validation, authorization resolution, backend execution, parsing, and retention checks.
- Let `SimulationRevertedError` propagate; a revert belongs to the bundle, not the backend.
- Keep RPC I/O under `src/simulate/backends/` and outputs normalized to `RawSimulationResult`. Colocated transport-boundary tests cover request/response shapes and failures; pinned Anvil forks prove ERC-20/internal-native transfer reporting and standalone-bundle retention.
- Encode signature authorizations as `approve(spender, amount ?? maxUint256)` and prepend them to the simulated bundle.
- Enforce retention by net `(restricted address, token)` balance across the blue-sdk `bundles` registry plus `midnightBundles` with `DUST_THRESHOLD = 100n`; skip only chains that catalog neither.
- Keep all thrown domain errors under `SimulationPackageError`; only `ExternalServiceError` is bypassable by callers.
- Add chains through caller `SimulationConfig.chains`; every per-chain `ChainSimulationConfig` requires `simulateV1Url`. Confirm blue-sdk `bundles` addresses intentionally.
- Keep unit tests colocated as `{module}.test.ts`; put shared unit fixtures in `src/test-helpers/`, which must stay out of published builds. Keep fork tests under `test/` as `*.integration.test.ts`.

- The unreleased v5 stack follows the narrow lifecycle exception in root `AGENTS.md` §7. SDK-1291 retires the backend; SDK-1293 replaces the legacy authorization variants. Preserve error constructors and result fields during this step.

## Continuous Improvement

- Keep backend I/O isolated behind normalized simulation results; public simulation behavior should not depend on hidden backend state.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer typed failures and explicit backend support rules over broad catch/fallback logic.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
