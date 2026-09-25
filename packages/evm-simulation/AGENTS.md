# evm-simulation Conventions

- Simulate EVM bundles only through `eth_simulateV1`. RPC failures, timeouts, unsupported configuration and execution reverts propagate as typed errors; never select another provider, retry execution, or return a successful result after failure. Give the sole execution the full `timeoutMs` budget (default 5000 ms) — one shared `AbortSignal` covers `eth_chainId`, `eth_getBlock*` and `eth_simulateV1`.
- Keep the simulation pipeline staged as request parsing → planning → `eth_simulateV1` boundary (chain identity, single block resolution + reorg check, probes) → evidence parsing → transfer/retention derivation.
- The boundary requires an endpoint supporting `eth_simulateV1` with `stateOverrides` code injection, per-call `from`, and `traceTransfers`. There is no fallback backend.
- No balance inflation: `value` transfers are funded by the sender's real native balance. `validation: false` means gas is not charged, which is how gas is separated from economic effects.
- Block advancement is observed, not required: geth-style nodes report the simulated block as `stateBlockNumber + 1` while Anvil reports the pinned block itself. The boundary rejects only a block behind the pinned state; consumers must read `context.blockNumber`/`context.blockTimestamp`, never assume +1.
- Native balances are observed through a synthetic probe contract whose minimal `BALANCE`-reading bytecode is injected via `stateOverrides` code — no deployed helper or chain registry dependency. Probes are interleaved between user transactions and never exposed in `SimulationResult`; `calls`/`txIdx` index user transactions only.
- Let `SimulationRevertedError` propagate; a revert belongs to the bundle, not the backend.
- Keep RPC I/O under `src/simulate/backends/` and outputs normalized to the `ExecutionEvidence` stage type. Colocated transport-boundary tests cover request/response shapes and failures; pinned Anvil forks prove sequential state, real native funding, and standalone-bundle retention.
- Preview `authorizations` and consumer `limits` parse and normalize, but fail typed with `UnsupportedVerificationFeatureError` until authorization preparation (PR5) and limit enforcement (PR6) land.
- Enforce retention by net `(restricted address, token)` balance across the blue-sdk `bundles` registry plus `midnightBundles` with `DUST_THRESHOLD = 100n`; skip only chains that catalog neither.
- Keep all thrown domain errors under `SimulationPackageError`; only `ExternalServiceError` is bypassable by callers.
- Add chains through caller `SimulationConfig.chains`; every per-chain `ChainSimulationConfig` requires `simulateV1Url`. Confirm blue-sdk `bundles` addresses intentionally.
- Keep unit tests colocated as `{module}.test.ts`; put shared unit fixtures in `src/test-helpers/`, which must stay out of published builds. Keep fork tests under `test/` as `*.integration.test.ts`.
- `src/decode/` holds pure calldata/requirement adapters (`toSimulationAuthorizations`, `decodeOperations`) that turn morpho-sdk inputs into domain types without touching RPC or pipeline state; they are exported but not wired into the simulation pipeline.

- The unreleased v5 stack follows the narrow lifecycle exception in root `AGENTS.md` §7. SDK-1291 retires the backend; SDK-1293 replaced the legacy authorization variants and cut the runtime over to the domain types.

## Continuous Improvement

- Keep backend I/O isolated behind normalized evidence; public simulation behavior should not depend on hidden backend state.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer typed failures and explicit backend support rules over broad catch/fallback logic.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
