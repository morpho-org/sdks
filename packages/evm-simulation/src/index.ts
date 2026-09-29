// Public fns (via feature-folder barrels)

export type {
  RetainedAsset,
  SimulationErrorCode,
  SimulationErrorContext,
  SimulationErrorStage,
  SimulationRevertReason,
} from "./errors.js";
// Errors (for instanceof checks by consumers)
export {
  AssetChangeMismatchError,
  AuthorizationRequestMismatchError,
  BlacklistViolationError,
  ConsumerLimitViolationError,
  ExternalServiceError,
  FeeMismatchError,
  InvalidSimulationResponseError,
  isSimulationPackageError,
  MarketConstraintViolationError,
  MissingVerificationEvidenceError,
  PermissionChangeMismatchError,
  ProtocolBindingMismatchError,
  SIMULATION_ERROR_CODES,
  SimulationPackageError,
  SimulationRevertedError,
  SimulationValidationError,
  SlippageLimitExceededError,
  StateChangeMismatchError,
  UnexpectedSimulationError,
  UnsupportedChainError,
  UnsupportedOperationError,
  UnsupportedVerificationFeatureError,
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
