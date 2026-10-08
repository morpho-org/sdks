import type { BlockTag, Hex } from "viem";
import type { SimulationAuthorization } from "./authorizations.js";
import type { SimulationLimits } from "./limits.js";
import type { SimulationTransaction } from "./types.js";

/** Every simulation mode; source of `SimulationMode`. */
export const SIMULATION_MODES = ["preview", "final"] as const;

/** Simulation mode: `"preview"` accepts pending authorizations, `"final"` does not. */
export type SimulationMode = (typeof SIMULATION_MODES)[number];

/** A mined block the simulation runs on top of. */
export interface StateBlock {
  /** Block number the simulation runs on top of. */
  readonly number: bigint;
  /** Hash of that block; compared to the next block's `parentHash`. */
  readonly hash: Hex;
  /** Block timestamp in Unix seconds; the simulated block must not be earlier. */
  readonly timestamp: bigint;
}

/**
 * Input to `simulate()`. `authorizations` is accepted only in "preview";
 * `mode` defaults to "final".
 */
export interface SimulateParams {
  readonly chainId: number;
  readonly transactions: readonly SimulationTransaction[];
  /** Defaults to "final". */
  readonly mode?: SimulationMode;
  /** Pending wallet requests, in order. Preview only; rejected in final. */
  readonly authorizations?: readonly SimulationAuthorization[];
  /** Resolved once; defaults to "latest" ("finalized" on Monad, whose
   * "latest" block is not final). Only canonical (mined) blocks can be
   * pinned; `pending` has no stable hash and is rejected at runtime. */
  readonly blockNumber?: bigint | Exclude<BlockTag, "pending">;
  /** State block supplied by the caller, so `simulate()` skips the block
   * lookup; with no asset metadata reads it then sends only `eth_simulateV1`.
   * Cannot be combined with `blockNumber`.
   * Not checked against the endpoint: `hash` is compared only when the node
   * reports the next block (its `parentHash`) and `parentHashCheck` is on (off
   * by default on Stable, 988), and `timestamp` only bounds the simulated
   * block's timestamp. On Monad (143), supply a finalized block: `latest` is
   * not final there, so the block at that number can change and fail the
   * `parentHash` check. */
  readonly block?: StateBlock;
  /** Caller-selected quotes and percentage tolerances. Omitted limits are unchecked. */
  readonly limits?: SimulationLimits;
}
