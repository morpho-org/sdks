// Public fns (via feature-folder barrels)
export { screenAddresses } from "./screen-addresses/index.js";
export { simulate } from "./simulate/index.js";

// Types
export type {
  ChainSimulationConfig,
  SimulateParams,
  SimulationAuthorization,
  SimulationConfig,
  SimulationLogger,
  SimulationResult,
  SimulationTransaction,
  TenderlyRestConfig,
  Transfer,
} from "./types.js";

// Errors (for instanceof checks by consumers)
export {
  SimulationPackageError,
  SimulationRevertedError,
  BlacklistViolationError,
  AddressScreeningError,
  ExternalServiceError,
  SimulationValidationError,
  UnsupportedChainError,
} from "./errors.js";
