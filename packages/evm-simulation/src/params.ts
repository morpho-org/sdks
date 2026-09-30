import type { BlockTag } from "viem";
import type { SimulationAuthorization } from "./authorizations.js";
import type { SimulationLimits } from "./limits.js";
import type { SimulationTransaction } from "./types.js";

/** Every simulation mode; source of `SimulationMode`. */
export const SIMULATION_MODES = ["preview", "final"] as const;

/** Simulation mode: `"preview"` accepts pending authorizations, `"final"` does not. */
export type SimulationMode = (typeof SIMULATION_MODES)[number];

/**
 * v5 verified-simulation input; `simulate()` accepts it once SDK-1293 cuts the
 * pipeline over. `authorizations` is accepted only in "preview".
 */
export interface SimulateParams {
  readonly chainId: number;
  readonly transactions: readonly SimulationTransaction[];
  /** Defaults to "final". */
  readonly mode?: SimulationMode;
  /** Pending wallet requests, in order. Preview only; rejected in final. */
  readonly authorizations?: readonly SimulationAuthorization[];
  /** Resolved once; defaults to "latest". Only canonical (mined) blocks can be
   * pinned; `pending` has no stable hash and is rejected at runtime. */
  readonly blockNumber?: bigint | Exclude<BlockTag, "pending">;
  /** Consumers may only tighten; omitted values use SDK defaults. */
  readonly limits?: SimulationLimits;
}
