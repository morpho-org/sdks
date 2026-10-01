# evm-simulation Conventions

- Simulate EVM bundles only through `eth_simulateV1`. RPC failures, timeouts, unsupported configuration and execution reverts propagate as typed errors; never select another provider, retry execution, or return a successful result after failure. Give the sole execution the full `timeoutMs` budget (default 5000 ms) — one shared `AbortSignal` covers `eth_chainId`, `eth_getBlock*` and `eth_simulateV1`.
- Keep the simulation pipeline staged as request parsing → planning → `eth_simulateV1` boundary (chain identity → single block resolution → simulation with in-block state reads → response parsing → reorg check) → state parsing/diff → per-operation checks → transfer/retention derivation.
- The boundary requires an endpoint supporting `eth_simulateV1` with `stateOverrides` code injection, per-call `from`, and `traceTransfers`. There is no fallback backend.
- No balance inflation: `value` transfers are funded by the sender's real native balance. `validation: false` means gas is not charged, which is how gas is separated from economic effects.
- Block advancement is observed, not required: geth-style nodes report the simulated block as `stateBlockNumber + 1` while Anvil reports the pinned block itself. The boundary accepts exactly the pinned block or pinned+1; consumers must read `block.blockNumber`/`block.blockTimestamp` on the returned execution, never assume +1.
- Native balances are observed through a synthetic probe contract whose minimal `BALANCE`-reading bytecode is injected via `stateOverrides` code — no deployed helper or chain registry dependency — and through `traceTransfers` logs on the simulated calls; `calls`/`txIdx` index user transactions only.
- Let `SimulationRevertedError` propagate; a revert belongs to the bundle, not the backend.
- Keep RPC I/O under `src/simulate/backends/` and outputs normalized to the internal `SimulationExecution` type. Colocated transport-boundary tests cover request/response shapes and failures; pinned Anvil forks prove sequential state, real native funding, and standalone-bundle retention.
- Preview `authorizations` are prepared as simulated approval calls ahead of the user transactions and verified against the observed before/after state change; `limits.operations` is the caller's description of the bundle; each entry is checked against the state diff of its subject and only its pinned `expected*`/`min*`/`max*` fields are compared (`ConsumerLimitViolationError`). No calldata is decoded. Preparation calls and state reads carry `preparation`/`stateRead` identities and never get a public `txIdx` — `simulationTxs`, `calls` and `transfers.txIdx` index the caller's transactions only.
- Enforce retention by net `(restricted address, token)` balance across the blue-sdk `bundles` registry plus `midnightBundles` with `DUST_THRESHOLD = 100n`; skip only chains that catalog neither.
- Keep all thrown domain errors under `SimulationPackageError`; only `ExternalServiceError` is bypassable by callers.
- Add chains through caller `SimulationConfig.chains`; every per-chain `ChainSimulationConfig` requires `simulateV1Url`. Confirm blue-sdk `bundles` addresses intentionally.
- Keep unit tests colocated as `{module}.test.ts`; put shared unit fixtures in `src/test-helpers/`, which must stay out of published builds. Keep fork tests under `test/` as `*.integration.test.ts`.

- The unreleased v5 stack follows the narrow lifecycle exception in root `AGENTS.md` §7, which covers both the SDK-1291 Tenderly backend removal and the SDK-1293 legacy authorization-variant removal; SDK-1293 replaced the legacy authorization variants, narrowed `SimulateParams.blockNumber` to exclude `"pending"`, and cut the runtime over to the new input/authorization/limit types.

## Continuous Improvement

- Keep backend I/O isolated behind normalized execution results; public simulation behavior should not depend on hidden backend state.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer typed failures and explicit backend support rules over broad catch/fallback logic.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.

- `@morpho-org/morpho-sdk` is a direct runtime dependency of this package, used only through its root entry point for the requirements adapter; every morpho-sdk bump requires the root AGENTS.md §7 dependent package bump audit for evm-simulation.
- `DEFAULT_MIN_LLTV_BUFFER_WAD` must equal morpho-sdk's `DEFAULT_LLTV_BUFFER`; it stays a local constant so the verifier's floor is pinned independently of the builder — a drift shows up as a failing test in `src/simulate/request/effective-limits.test.ts`, not a silently moved threshold.
