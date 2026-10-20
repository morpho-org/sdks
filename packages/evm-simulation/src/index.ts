export type { SimulationErrorResponse } from "./error-response.js";
export { toSimulationErrorResponse } from "./error-response.js";
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
} from "./errors.js";
// Errors (for instanceof checks by consumers)
export {
  AuthorizationRequestMismatchError,
  BlacklistViolationError,
  ConsumerLimitViolationError,
  InvalidChainIdError,
  InvalidSimulationResponseError,
  isSimulationPackageError,
  RpcTransportError,
  SIMULATION_ERROR_CODES,
  SimulationAssertError,
  SimulationPackageError,
  SimulationRevertedError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
  UnexpectedSimulationError,
  UnsupportedChainError,
  UnsupportedOperationError,
} from "./errors.js";
export type {
  BlueMarketOperationSubject,
  BlueMarketOperationType,
  BluePositionBounds,
  BlueRefinanceSubject,
  ForceExitDeallocationQuote,
  InKindPositionQuote,
  OperationLimit,
  OperationType,
  SharePriceLimit,
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
  StateBlock,
} from "./params.js";
export { SIMULATION_MODES } from "./params.js";
export { toSimulationAuthorizations } from "./requirements/index.js";
export type {
  AuthorizationPreparation,
  SimulatedOperation,
  SimulationVerification,
  VerifiedSimulationResult,
} from "./result.js";
export type { AssertionBounds } from "./simulate/assertions.js";
export {
  erc20BalanceAssertion,
  maxDepositAssertion,
  nativeBalanceAssertion,
} from "./simulate/assertions.js";
export { simulate } from "./simulate/index.js";
// Types
export type {
  AccountAssetChanges,
  Assertion,
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
