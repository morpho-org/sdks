import type { Address } from "viem";
import type { CheckedSimulationInputLimits } from "../limits.js";
import type { SimulationMode } from "../params.js";
import type { ExecutionBlock } from "./backends/parse-response.js";

/** Explicit simulation context shared by the checker and result assembly. @internal */
export interface CheckContext {
  readonly chainId: number;
  readonly mode: SimulationMode;
  readonly block: ExecutionBlock;
  readonly owner: Address;
  readonly limits: CheckedSimulationInputLimits;
}
