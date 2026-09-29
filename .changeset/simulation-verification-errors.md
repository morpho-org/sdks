---
"@morpho-org/evm-simulation": major
---

Add typed error classes for simulation verification (`UnsupportedOperationError`, `ProtocolBindingMismatchError`, `UnsupportedVerificationFeatureError`, `InvalidSimulationResponseError`, `MissingVerificationEvidenceError`, `AuthorizationRequestMismatchError`, `AssetChangeMismatchError`, `PermissionChangeMismatchError`, `StateChangeMismatchError`, `MarketConstraintViolationError`, `SlippageLimitExceededError`, `FeeMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`), each carrying a required frozen `SimulationErrorContext`. Export `SIMULATION_ERROR_CODES`, `SimulationErrorCode`, `SimulationErrorContext`, `SimulationErrorStage`, `SimulationRevertReason`, `isSimulationPackageError` and the new `SimulationMode`/`OperationType` types, and add `SimulationRevertedError.reasonCode` (default `"UNKNOWN_REVERT"`).

**Breaking:** `BlacklistViolationError.assetChanges` entries are now `{ address: Address; token: Address; netRetained: bigint }` instead of optional string fields, and `SimulationPackageError.code` is typed as `SimulationErrorCode`.
