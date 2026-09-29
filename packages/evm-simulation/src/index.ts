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
  DecodedOperations,
  DecodeOperationsParams,
  PreLiquidationBinding,
  VaultBinding,
} from "./decode/index.js";
export {
  decodeOperations,
  toSimulationAuthorizations,
} from "./decode/index.js";
export type {
  DecodedOperation,
  DecodedOperationFields,
  MarketBinding,
  OperationAmount,
  OperationFunding,
  OperationIdentity,
  OperationReallocation,
  OperationSignature,
  ReferralFee,
} from "./decode/operation.js";
export type {
  RetainedAsset,
  SimulationErrorCode,
  SimulationErrorContext,
  SimulationExecutionReason,
  SimulationStage,
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
export type {
  BlueAuthorizationLimit,
  BlueBorrowLimit,
  BlueMarketOperationType,
  BlueRefinanceLimit,
  BlueRepayLimit,
  BlueRepayWithdrawCollateralLimit,
  BlueSupplyCollateralBorrowLimit,
  BlueSupplyCollateralLimit,
  BlueSupplyLimit,
  BlueWithdrawCollateralLimit,
  BlueWithdrawLimit,
  MarketMinAssets,
  OperationLimit,
  OperationType,
  SimulationLimits,
  SimulationOperationSubject,
  VaultDeallocation,
  VaultDepositLimit,
  VaultInKindRedeemLimit,
  VaultOperationType,
  VaultRedeemLimit,
  VaultV1MigrateToV2Limit,
  VaultV2ForceRedeemLimit,
  VaultV2ForceWithdrawLimit,
  VaultWithdrawLimit,
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
export { simulate } from "./simulate/index.js";
// Default limit constants
export {
  DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS,
  DEFAULT_MAX_SLIPPAGE_WAD,
  DEFAULT_MIN_LLTV_BUFFER_WAD,
} from "./simulate/request/index.js";
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
