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
export { DEFAULT_SIMULATION_GAS_PRICE } from "./simulate/fee-context.js";
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
