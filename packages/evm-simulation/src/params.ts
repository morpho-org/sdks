import type { BlockTag, Hex } from "viem";
import type { SimulationAuthorization } from "./authorizations.js";
import type { SimulationLimits } from "./limits.js";
import type { SimulationLogger, SimulationTransaction } from "./types.js";

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
 * Input to `simulate()`. The chain comes from the passed client's
 * `client.chain.id`; `authorizations` is accepted only in "preview";
 * `mode` defaults to "final".
 */
export interface SimulateParams {
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
   * block's timestamp. */
  readonly block?: StateBlock;
  /** Caller-selected quotes and percentage tolerances. Omitted limits are unchecked. */
  readonly limits?: SimulationLimits;
  /**
   * Block overrides forwarded to `eth_simulateV1` as the simulated block's
   * `blockOverrides`. Omitted fields leave the node's defaults untouched.
   */
  readonly blockOverrides?: {
    /** Gas limit of the simulated block. Omitted: no gas limit override is sent. */
    readonly gasLimit?: bigint;
  };
  /**
   * Whether a simulated successor block's `parentHash` must equal the pinned
   * state block hash. Block number and timestamp checks always run.
   * Omitted: on everywhere except Stable (988), whose nodes report a
   * `parentHash` that never matches the pinned block.
   */
  readonly parentHashCheck?: boolean;
  /** Overall execution timeout budget in ms (default 5000). Must be a
   * positive integer within the `AbortSignal.timeout` range. In-flight
   * requests obey the caller's client transport (its own timeout and retry
   * policy); the budget bounds the steps `simulate()` drives. */
  readonly timeoutMs?: number;
  /** Optional logger for transfer-parsing and retention warnings. */
  readonly logger?: SimulationLogger;
}
