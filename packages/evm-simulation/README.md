# @morpho-org/evm-simulation

## Overview

EVM transaction simulation engine for Morpho — bundle execution preview,
transfer parsing, and net per-account balance changes.

## Installation

```bash
pnpm add @morpho-org/evm-simulation
```

## Usage

```ts
import {
  simulate,
  type SimulationConfig,
  SimulationRevertedError
} from "@morpho-org/evm-simulation";

const config: SimulationConfig = {
  chains: new Map([
    [1, { simulateV1Url: process.env.MAINNET_RPC_URL! }],
  ]),
  timeoutMs: 5000,
};

try {
  const { simulationTxs, calls, transfers, assetChanges } = await simulate(
    config,
    {
      chainId: 1,
      // mode: "final" (default) executes the signed calldata against actual
      // permissions; mode: "preview" accepts typed authorization descriptors.
      transactions: [{ from: user, to: vault, data: encodedDeposit }],
      // limits: { maxSlippageWad: 1_00000000000000n },
    },
  );
} catch (err) {
  if (err instanceof SimulationRevertedError) {
    // show err.reason to the user; err.reasonCode is "UNKNOWN_REVERT" until
    // revert mapping lands with the verification pipeline
  }
  throw err;
}
```

Every chain entry requires `simulateV1Url`, pointing to a JSON-RPC endpoint that supports `eth_simulateV1`. Execution uses the full `timeoutMs` budget (default 5000 ms), with no retries or provider fallback. RPC failures, timeouts and reverts throw typed errors. The optional logger still reports parsing and retention warnings.

Native-ETH movements are observed through `traceTransfers` logs on the simulated calls — no `stateOverrides` or helper contracts are injected.

This is the unreleased v5 integration stack. See the [v4 → v5 migration guide](../../docs/migrations/evm-simulation-v4-to-v5.md) for the backend cutover and remaining release gates.

### API surface

All symbols below are re-exported from the package root.

- `simulate(config, params)` — run a bundle through the simulation pipeline.
- Config types: `SimulationConfig`, `ChainSimulationConfig`, `SimulationLogger`.
- Input types: `SimulateParams` (options object with `mode: "preview" | "final"`), `SimulationMode`, `SimulationTransaction`, `SimulationAuthorization` (the typed `erc20Approval` / `erc2612Permit` / `permit2SignatureTransfer` / `blueAuthorization` / `blueAuthorizationSignature` variants and their typed-data shapes `Erc2612PermitTypedData` / `Permit2TransferTypedData` / `BlueAuthorizationTypedData` / `Eip712Domain` / `Eip712Field`), `SimulationLimits`, `OperationLimit`, `OperationType`, `VaultDeallocation`, `MarketMinAssets`, and the per-operation limit types.
- Result types: `SimulationResult`, `SimulationCall`, `Transfer`, `AccountAssetChanges`, `AssetChange`, `RawLog`.
- Errors: `SimulationPackageError` (abstract base — `instanceof` it to catch any package error), `SimulationRevertedError`, `BlacklistViolationError`, `ExternalServiceError`, `SimulationValidationError`, `UnsupportedChainError`, and the verification errors `UnsupportedOperationError`, `ProtocolBindingMismatchError`, `UnsupportedVerificationFeatureError`, `InvalidSimulationResponseError`, `MissingVerificationEvidenceError`, `AuthorizationRequestMismatchError`, `AssetChangeMismatchError`, `PermissionChangeMismatchError`, `StateChangeMismatchError`, `MarketConstraintViolationError`, `SlippageLimitExceededError`, `FeeMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`.
- Error helpers: `SIMULATION_ERROR_CODES` / `SimulationErrorCode` (every `error.code`), `SimulationErrorContext` (frozen `error.context`; union of the per-stage `SimulationValidationContext`, `SimulationTransportContext`, `SimulationPreparationContext`, `SimulationExecutionContext`, `SimulationVerificationContext`), `SimulationStage`, `SimulationExecutionReason` (`SimulationRevertedError.reasonCode`), `isSimulationPackageError` (structural guard narrowing to `SimulationPackageError`), `RetainedAsset`.
- Verification vocabulary: `SIMULATION_MODES` / `SimulationMode`, `OPERATION_TYPES` / `OperationType`, `BLUE_MARKET_OPERATION_TYPES` / `BlueMarketOperationType`, `VAULT_OPERATION_TYPES` / `VaultOperationType`, `SimulationOperationSubject` and its members `BlueMarketOperationSubject`, `BlueRefinanceSubject`, `BlueAuthorizationSubject`, `VaultOperationSubject`, `VaultV1MigrateToV2Subject` (operation groups and the operation-keyed subject union that key the execution/verification `SimulationErrorContext`).
- Default limits: `DEFAULT_MAX_SLIPPAGE_WAD`, `DEFAULT_MIN_LLTV_BUFFER_WAD`, `DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS`.

Until the authorization-verification release, preview `authorizations` and `limits` are rejected once the state block is pinned, before the `eth_simulateV1` call, with `UnsupportedVerificationFeatureError` rather than silently ignored.

### Deeper docs

See [`CLAUDE.md`](./CLAUDE.md) in this directory for pipeline staging, the preview-authorization/limits feature
gate, the error hierarchy, retention rules, and the recipe for adding a
chain via `SimulationConfig.chains` — including how the state block is pinned and the
simulated block constrained to the pin or its immediate successor, and the
feature gate that rejects `authorizations` and `limits` until PR5/PR6 land.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
