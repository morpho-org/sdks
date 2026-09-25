import type { BlockTag } from "viem";
import type { SimulationTransaction } from "../types.js";
import type { SimulationAuthorization } from "./authorizations.js";
import type { SimulationLimits } from "./limits.js";

/** Ordered caller transactions and constraints shared by both modes. @internal */
export interface SimulationBaseParams {
  readonly chainId: number;
  readonly transactions: readonly Readonly<SimulationTransaction>[];
  /** Resolved once; defaults to latest. */
  readonly blockNumber?: bigint | BlockTag;
  readonly limits?: SimulationLimits;
}

/** Unsigned execution with explicit pending wallet requests. @internal */
export interface PreviewSimulateParams extends SimulationBaseParams {
  readonly mode: "preview";
  readonly authorizations?: readonly SimulationAuthorization[];
}

/** Actual signed execution without synthetic permission preparation. @internal */
export interface FinalSimulateParams extends SimulationBaseParams {
  readonly mode?: "final";
  readonly authorizations?: never;
}

/** Target v5 call contract; the public barrel switches with the runtime parser. @internal */
export type SimulateParams = PreviewSimulateParams | FinalSimulateParams;

/** Explicit mode and authorization list after input parsing. @internal */
export type NormalizedSimulateParams =
  | (SimulationBaseParams & {
      readonly mode: "preview";
      readonly authorizations: readonly SimulationAuthorization[];
    })
  | (SimulationBaseParams & {
      readonly mode: "final";
      readonly authorizations: readonly [];
    });
