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
export type {
  AppliedSimulationLimits,
  BlueAuthorizationLimit,
  BlueBorrowLimit,
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
  TokenAmount,
  VaultDeallocation,
  VaultDepositLimit,
  VaultInKindRedeemLimit,
  VaultRedeemLimit,
  VaultV1MigrateToV2Limit,
  VaultV2ForceRedeemLimit,
  VaultV2ForceWithdrawLimit,
  VaultWithdrawLimit,
  WalletLimits,
} from "./limits.js";
export type { SimulateParams, SimulationMode } from "./params.js";
export { simulate } from "./simulate/index.js";
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
