// Public fns (via feature-folder barrels)

// Errors (for instanceof checks by consumers)
export {
  BlacklistViolationError,
  ExternalServiceError,
  SimulationPackageError,
  SimulationRevertedError,
  SimulationValidationError,
  UnsupportedChainError,
} from "./errors.js";
export {
  buildEcrecoverShimCode,
  ECRECOVER_PRECOMPILE_ADDRESS,
  ECRECOVER_RELOCATED_ADDRESS,
} from "./simulate/ecrecover-override.js";
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
  TenderlyRpcConfig,
  Transfer,
} from "./types.js";
