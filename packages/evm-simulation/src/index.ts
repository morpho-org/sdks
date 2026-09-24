// Public fns (via feature-folder barrels)

// Types
export type {
  AuthorizationDomain,
  BlueAuthorizationTypedData,
  Erc2612TypedData,
  Permit2SignatureTransferTypedData,
  SimulationAuthorization,
} from "./domain/authorizations.js";
export type {
  ConsumerConstraintContext,
  SimulationComparison,
  SimulationErrorContext,
  SimulationErrorLocation,
  SimulationStage,
  SimulationSubject,
} from "./domain/diagnostics.js";
export type { ExecutionContext } from "./domain/evidence.js";
export type {
  EffectiveSimulationLimits,
  MarketSupplyMinimum,
  OperationLimit,
  OperationLimitFields,
  SimulationDeallocation,
  SimulationLimits,
  TokenAmount,
} from "./domain/limits.js";
export type {
  FinalSimulateParams,
  PreviewSimulateParams,
  SimulateParams,
} from "./domain/request.js";
// Errors (for instanceof checks by consumers)
export {
  AssetChangeMismatchError,
  AuthorizationRequestMismatchError,
  BlacklistViolationError,
  ConsumerLimitViolationError,
  ExternalServiceError,
  FeeMismatchError,
  InvalidSimulationResponseError,
  MarketConstraintViolationError,
  MissingVerificationEvidenceError,
  PermissionChangeMismatchError,
  ProtocolBindingMismatchError,
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
export { simulate } from "./simulate/index.js";
// Default limit constants
export {
  DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS,
  DEFAULT_MAX_SLIPPAGE_WAD,
  DEFAULT_MIN_LLTV_BUFFER_WAD,
} from "./simulate/request/index.js";
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
