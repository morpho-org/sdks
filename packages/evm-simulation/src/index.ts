// Public fns (via feature-folder barrels)

export type {
  RetainedAsset,
  SimulationErrorCode,
  SimulationErrorContext,
  SimulationPackageErrorLike,
  SimulationRevertReason,
} from "./errors.js";
// Errors (for instanceof checks by consumers)
export {
  AssetChangeMismatchError,
  AuthorizationRequestMismatchError,
  BLUE_REVERT_REASONS,
  BlacklistViolationError,
  ConsumerLimitViolationError,
  ExternalServiceError,
  FeeMismatchError,
  InvalidSimulationResponseError,
  isSimulationPackageError,
  MarketConstraintViolationError,
  MissingVerificationEvidenceError,
  PERMIT2_REVERT_REASONS,
  PermissionChangeMismatchError,
  ProtocolBindingMismatchError,
  SIMULATION_ERROR_CODES,
  SimulationPackageError,
  SimulationRevertedError,
  SimulationValidationError,
  SimulationVerificationError,
  SlippageLimitExceededError,
  StateChangeMismatchError,
  UnexpectedSimulationError,
  UnsupportedChainError,
  UnsupportedOperationError,
  UnsupportedVerificationFeatureError,
  VAULT_BUNDLES_V1_REVERT_REASONS,
  VAULT_EXIT_BUNDLES_V1_REVERT_REASONS,
  VAULT_V1_REVERT_REASONS,
  VAULT_V2_ADAPTER_REVERT_REASONS,
  VAULT_V2_REVERT_REASONS,
} from "./errors.js";
export type { OperationType } from "./limits.js";
export type { SimulationMode } from "./params.js";
export { simulate } from "./simulate/index.js";
// Types
export type {
  AccountAssetChanges,
  AssetChange,
  ChainSimulationConfig,
  RawLog,
  SimulateParams,
  SimulationAuthorization,
  SimulationCall,
  SimulationConfig,
  SimulationLogger,
  SimulationResult,
  SimulationTransaction,
  Transfer,
} from "./types.js";
