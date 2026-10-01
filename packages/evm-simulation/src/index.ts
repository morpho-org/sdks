// Public fns (via feature-folder barrels)

export type {
  BlueAuthorization,
  BlueAuthorizationSignature,
  BlueAuthorizationTypedData,
  Eip712Domain,
  Eip712Field,
  Erc20ApprovalAuthorization,
  Erc2612PermitAuthorization,
  Erc2612PermitTypedData,
  Permit2TransferAuthorization,
  Permit2TransferTypedData,
  SimulationAuthorization,
} from "./authorizations.js";
export type {
  RetainedAsset,
  SimulationErrorCode,
  SimulationErrorContext,
  SimulationExecutionContext,
  SimulationExecutionReason,
  SimulationPreparationContext,
  SimulationStage,
  SimulationTransportContext,
  SimulationValidationContext,
  SimulationVerificationContext,
} from "./errors.js";
// Errors (for instanceof checks by consumers)
export {
  AssetChangeMismatchError,
  AuthorizationRequestMismatchError,
  BlacklistViolationError,
  ConsumerLimitViolationError,
  ExternalServiceError,
  InvalidSimulationResponseError,
  isSimulationPackageError,
  MarketConstraintViolationError,
  MissingVerificationEvidenceError,
  PermissionChangeMismatchError,
  SIMULATION_ERROR_CODES,
  SimulationPackageError,
  SimulationRevertedError,
  SimulationValidationError,
  StateChangeMismatchError,
  UnexpectedSimulationError,
  UnsupportedChainError,
  UnsupportedOperationError,
} from "./errors.js";
export type {
  BlueAuthorizationSubject,
  BlueMarketOperationSubject,
  BlueMarketOperationType,
  BlueRefinanceSubject,
  OperationLimit,
  OperationType,
  SimulationLimits,
  SimulationOperationSubject,
  SlippageLimits,
  SlippageQuote,
  VaultOperationSubject,
  VaultOperationType,
  VaultV1MigrateToV2Subject,
} from "./limits.js";
export {
  BLUE_MARKET_OPERATION_TYPES,
  OPERATION_TYPES,
  VAULT_OPERATION_TYPES,
} from "./limits.js";
export type {
  SimulateParams,
  SimulationMode,
} from "./params.js";
export { SIMULATION_MODES } from "./params.js";
export { toSimulationAuthorizations } from "./requirements/index.js";
export type {
  AuthorizationPreparation,
  SimulatedOperation,
  SimulationVerification,
  VerifiedSimulationResult,
} from "./result.js";
export { simulate } from "./simulate/index.js";
// Types
export type {
  AccountAssetChanges,
  AssetChange,
  ChainSimulationConfig,
  RawLog,
  SimulationCall,
  SimulationConfig,
  SimulationLogger,
  SimulationResult,
  SimulationTransaction,
  Transfer,
} from "./types.js";
