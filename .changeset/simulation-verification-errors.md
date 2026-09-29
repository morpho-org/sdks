---
"@morpho-org/evm-simulation": major
---

Add typed error classes for simulation verification (`UnsupportedOperationError`, `ProtocolBindingMismatchError`, `UnsupportedVerificationFeatureError`, `InvalidSimulationResponseError`, `MissingVerificationEvidenceError`, `AuthorizationRequestMismatchError`, `AssetChangeMismatchError`, `PermissionChangeMismatchError`, `StateChangeMismatchError`, `MarketConstraintViolationError`, `SlippageLimitExceededError`, `FeeMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`), each extending `SimulationPackageError` directly and accepting an optional frozen `SimulationErrorContext`, as do the existing errors.

Export the error contract from ADR-2026-09-18: `SIMULATION_ERROR_CODES` / `SimulationErrorCode`, `SimulationErrorContext` (readonly union of the per-stage `SimulationValidationContext`, `SimulationPreparationContext`, `SimulationExecutionContext`, `SimulationVerificationContext` and `SimulationTransportContext`, every stage carrying `mode`, `chainId` and `blockNumber`; `execution`/`verification` further keyed by `operation`, which fixes the subject fields — `marketId`, `sourceMarketId`/`targetMarketId`, `vault`, `sourceVault`/`targetVault`, `authorized`), `SimulationStage`, `BLUE_MARKET_OPERATION_TYPES` / `BlueMarketOperationType`, `VAULT_OPERATION_TYPES` / `VaultOperationType`, `SimulationOperationSubject` (the operation-keyed subject union, shared with decoded operations), `SimulationExecutionReason`, `isSimulationPackageError` (structural guard narrowing to `SimulationPackageError`; plain objects must carry the class `name` owning their `code`), `RetainedAsset`, `SIMULATION_MODES` / `SimulationMode` and `OPERATION_TYPES` / `OperationType`.

`SimulationRevertedError.reasonCode: SimulationExecutionReason` is the machine-readable cause of an execution failure (defaults to `"UNKNOWN_REVERT"`); `reason` stays a human-readable message that consumers must not parse.

These contracts are declared ahead of the verification pipeline: in this release no code path throws one of the new verification error classes and `reasonCode` is always `"UNKNOWN_REVERT"`. Revert mapping and verification land in the follow-up PRs (SDK-1293/1294).

**Breaking:** `BlacklistViolationError.assetChanges` entries are `{ address: Address; token: Address; netRetained: bigint }` (previously optional string addresses and a decimal-string amount). `SimulationPackageError.code` is typed as `SimulationErrorCode` and the base class declares `readonly context?: SimulationErrorContext`.
