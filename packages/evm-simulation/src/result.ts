import type { Address } from "viem";
import type { SimulationAuthorization } from "./authorizations.js";
import type {
  SimulationLimits,
  SimulationOperationSubject,
  SlippageLimits,
} from "./limits.js";
import type { SimulationMode } from "./params.js";
import type {
  SimulationCall,
  SimulationResult,
  SimulationTransaction,
} from "./types.js";

/** One operation described by the caller's `limits.operations`. */
export type SimulatedOperation = {
  /** Quote and percentage tolerance checked against the named subject over the whole bundle. */
  readonly checkedLimits: SlippageLimits;
  /** Resolved selector from the limit; defaults to the transaction sender. */
  readonly account: Address;
  /** Resolved selector from the limit; defaults to the transaction sender. */
  readonly receiver: Address;
} & SimulationOperationSubject;

/** How a pending authorization was modeled in preview. */
export interface AuthorizationPreparation {
  readonly authorizationIndex: number;
  readonly authorization: SimulationAuthorization;
  /** Approval calls simulated before the user transactions. */
  readonly calls: readonly {
    readonly transaction: SimulationTransaction;
    readonly result: SimulationCall;
  }[];
}

/** Optional slippage checks; execution success does not imply economic verification. */
export interface SimulationVerification {
  readonly mode: SimulationMode;
  readonly chainId: number;
  /**
   * Block `eth_simulateV1` executed in: the pinned state block or its
   * successor, depending on the node. Not a pin to pass back as
   * `SimulateParams.blockNumber`.
   */
  readonly blockNumber: bigint;
  /**
   * Timestamp (seconds) of the block `eth_simulateV1` executed in: the
   * pinned state block or its successor, depending on the node.
   */
  readonly blockTimestamp: bigint;
  /** Caller-supplied quotes and tolerances only; omitted limits remain unchecked. */
  readonly limits: Required<SimulationLimits>;
  readonly operations: readonly SimulatedOperation[];
  /** Preview only; always empty in final. */
  readonly authorizations: readonly AuthorizationPreparation[];
}

/** `simulationTxs` equals the caller's `transactions`; `txIdx` indexes only those. */
export interface VerifiedSimulationResult extends SimulationResult {
  readonly verification: SimulationVerification;
}
