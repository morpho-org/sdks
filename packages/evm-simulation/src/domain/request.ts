import type { BlockTag } from "viem";
import type { SimulationTransaction } from "../types.js";
import type { SimulationAuthorization } from "./authorizations.js";
import type { SimulationLimits } from "./limits.js";

/** Ordered caller transactions and constraints shared by both modes. */
export interface SimulationBaseParams {
  readonly chainId: number;
  readonly transactions: readonly Readonly<SimulationTransaction>[];
  /** Resolved once; defaults to latest. */
  readonly blockNumber?: bigint | BlockTag;
  readonly limits?: SimulationLimits;
}

/** Unsigned execution with explicit pending wallet requests. */
export interface PreviewSimulateParams extends SimulationBaseParams {
  readonly mode: "preview";
  readonly authorizations?: readonly SimulationAuthorization[];
}

/** Actual signed execution without synthetic permission preparation. */
export interface FinalSimulateParams extends SimulationBaseParams {
  readonly mode?: "final";
  readonly authorizations?: never;
}

/** v5 call contract; the boundary parser normalizes and brands it as `ParsedRequest`. */
export type SimulateParams = PreviewSimulateParams | FinalSimulateParams;

/** Explicit mode and authorization list after input parsing. */
export type NormalizedSimulateParams =
  | (SimulationBaseParams & {
      readonly mode: "preview";
      readonly authorizations: readonly SimulationAuthorization[];
    })
  | (SimulationBaseParams & {
      readonly mode: "final";
      readonly authorizations: readonly [];
    });
