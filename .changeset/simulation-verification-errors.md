---
"@morpho-org/evm-simulation": major
---

Add typed error classes for simulation verification (`UnsupportedOperationError`, `ProtocolBindingMismatchError`, `UnsupportedVerificationFeatureError`, `InvalidSimulationResponseError`, `MissingVerificationEvidenceError`, `AuthorizationRequestMismatchError`, `AssetChangeMismatchError`, `PermissionChangeMismatchError`, `StateChangeMismatchError`, `MarketConstraintViolationError`, `SlippageLimitExceededError`, `FeeMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`), each carrying a required frozen `SimulationErrorContext`; existing errors accept an optional one. `SimulationVerificationError` is their abstract base.

Export the error contract from ADR-2026-09-18: `SIMULATION_ERROR_CODES` / `SimulationErrorCode`, `SimulationErrorContext` (readonly, keyed by `stage`: `validation | preparation | execution | verification | transport`, every stage carrying `mode`, `chainId` and `blockNumber`; `execution`/`verification` further keyed by `operation`, which fixes the subject fields — `marketId`, `sourceMarketId`/`targetMarketId`, `vault`, `sourceVault`/`targetVault`, `authorized`), `SimulationStage`, `BlueMarketOperationType`, `VaultOperationType`, `SimulationExecutionReason`, `isSimulationPackageError` (structural guard narrowing to `SimulationPackageError`), `RetainedAsset`, `SIMULATION_MODES` / `SimulationMode` and `OPERATION_TYPES` / `OperationType`.

`SimulationRevertedError.reasonCode: SimulationExecutionReason` is the machine-readable cause of an execution failure (defaults to `"UNKNOWN_REVERT"`); `reason` stays a human-readable message that consumers must not parse.

These contracts are declared ahead of the verification pipeline: in this release no code path throws a `SimulationVerificationError` subclass and `reasonCode` is always `"UNKNOWN_REVERT"`. Revert mapping and verification land in the follow-up PRs (SDK-1293/1294).

**Breaking:** `BlacklistViolationError.assetChanges` entries are `{ address: Address; token: Address; netRetained: bigint }` (previously optional string addresses and a decimal-string amount). `SimulationPackageError.code` is typed as `SimulationErrorCode` and the base class declares `readonly context?: SimulationErrorContext`.
