---
"@morpho-org/evm-simulation": major
---

Add typed error classes for simulation verification (`UnsupportedOperationError`, `ProtocolBindingMismatchError`, `UnsupportedVerificationFeatureError`, `InvalidSimulationResponseError`, `MissingVerificationEvidenceError`, `AuthorizationRequestMismatchError`, `AssetChangeMismatchError`, `PermissionChangeMismatchError`, `StateChangeMismatchError`, `MarketConstraintViolationError`, `SlippageLimitExceededError`, `FeeMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`), each carrying a required frozen `SimulationErrorContext`; existing errors accept an optional one. Export `SIMULATION_ERROR_CODES`, `SimulationErrorCode`, `SimulationErrorContext`, `isSimulationPackageError` (narrowing to `SimulationPackageErrorLike`), `RetainedAsset`, `SimulationMode` and `OperationType`.

Add `SimulationVerificationError`, the abstract base of the verification errors (`context` is required and non-optional on it).

Add a Morpho revert catalog: `SimulationRevertedError.revert?: SimulationRevertReason` identifies the reverting contract (Blue, Vault V1, Vault V2, Vault V2 adapters, VaultBundlesV1, VaultExitBundlesV1, Permit2) and its revert string / custom error name, typed from the pinned ABIs; `BLUE_REVERT_REASONS`, `VAULT_V1_REVERT_REASONS`, `VAULT_V2_REVERT_REASONS`, `VAULT_V2_ADAPTER_REVERT_REASONS`, `VAULT_BUNDLES_V1_REVERT_REASONS`, `VAULT_EXIT_BUNDLES_V1_REVERT_REASONS` and `PERMIT2_REVERT_REASONS` are local copies of the ABIs' error names.

**Breaking (types only):** `SimulationPackageError.code` is typed as `SimulationErrorCode` (subclasses outside the catalog no longer compile), the base class declares `readonly context?: SimulationErrorContext`, and `BlacklistViolationError.assetChanges` is `readonly RetainedAsset[]`. Runtime values are unchanged.
