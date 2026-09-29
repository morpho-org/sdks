import type { BlockTag } from "viem";
import type { PendingAuthorization } from "./authorizations.js";
import type { SimulationLimits } from "./limits.js";
import type { SimulationTransaction } from "./types.js";

/** Simulation mode: `"preview"` accepts pending authorizations, `"final"` does not. */
export type SimulationMode = "preview" | "final";

/** @internal Target `simulate()` input. `authorizations` is accepted only in "preview". */
export interface VerifiedSimulateParams {
  readonly chainId: number;
  readonly transactions: readonly SimulationTransaction[];
  /** Defaults to "final". */
  readonly mode?: SimulationMode;
  /** Pending wallet requests, in order. Preview only; rejected in final. */
  readonly authorizations?: readonly PendingAuthorization[];
  /** Resolved once; defaults to "latest". */
  readonly blockNumber?: bigint | BlockTag;
  /** Consumers may only tighten; omitted values use SDK defaults. */
  readonly limits?: SimulationLimits;
}
