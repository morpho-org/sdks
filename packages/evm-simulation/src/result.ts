import type { Address } from "viem";
import type { SimulationAuthorization } from "./authorizations.js";
import type {
  SimulationErrorSeverity,
  SimulationPackageError,
} from "./errors.js";
import type {
  CheckedSimulationInputLimits,
  CheckedSimulationLimits,
  CheckedSlippageLimits,
  SimulationOperationSubject,
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
  readonly checkedLimits: CheckedSlippageLimits;
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

/** Limit checks the caller requested (or "none" when explicitly opted out); execution success does not imply economic verification. */
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
  /**
   * Caller-supplied quotes and tolerances only: an object holds the checked
   * limits; `"none"` means the caller opted out and nothing was verified.
   */
  readonly limits: CheckedSimulationLimits | "none";
  readonly operations: readonly SimulatedOperation[];
  /** Preview only; always empty in final. */
  readonly authorizations: readonly AuthorizationPreparation[];
}

/** `simulationTxs` contains caller transaction fields; `txIdx` indexes only those. */
export interface VerifiedSimulationResult extends SimulationResult {
  readonly verification: SimulationVerification;
}

/** Verification for requests that may derive operation limits from typed inputs. */
export interface SimulationInputVerification
  extends Omit<SimulationVerification, "limits"> {
  /** Resolved quotes, per-side checks and quoted-side tolerances, or the explicit opt-out. */
  readonly limits: CheckedSimulationInputLimits | "none";
}

/** Simulation result for requests accepting input-based limits. */
export interface VerifiedSimulationInputResult extends SimulationResult {
  readonly verification: SimulationInputVerification;
}

/** Failure branch of a simulation report: the bundle is rejected and no result exists. */
export interface SimulationFailure {
  readonly ok: false;
  /** Highest severity of `failures` (`fatal` > `error` > `warn`); index a logger with it. */
  readonly severity: SimulationErrorSeverity;
  /** Every SDK failure of the run, flat, in pipeline order; never empty. */
  readonly failures: readonly SimulationPackageError[];
}

/** Report returned by `simulate` for quote-only `SimulateParams`. Read `result` only after `ok`. */
export type SimulationReport =
  | { readonly ok: true; readonly result: VerifiedSimulationResult }
  | SimulationFailure;

/** Report returned by `simulate` for `SimulateInputParams`. Read `result` only after `ok`. */
export type SimulationInputReport =
  | { readonly ok: true; readonly result: VerifiedSimulationInputResult }
  | SimulationFailure;
