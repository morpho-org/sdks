import { type Hex, isHex } from "viem";
import {
  isSimulationPackageError,
  type SimulationErrorCode,
} from "./errors.js";

/** JSON-safe public failure fields. Stack, cause, and specialized diagnostic fields are omitted. */
export interface SimulationErrorResponse {
  /** SDK discriminator; RPC failures use RPC_TRANSPORT_ERROR. */
  readonly code: SimulationErrorCode;
  /** Human-readable SDK message, or a generic message for infrastructure/unexpected failures. */
  readonly message: string;
  /** Original revert bytes when available. */
  readonly revertData?: Hex;
  /** Zero-based caller transaction index for a transaction revert or assertion failure; omitted when unknown. */
  readonly transactionIndex?: number;
}

/**
 * Select public failure fields without serializing the original exception.
 * Domain messages are retained verbatim; this is not a general message sanitizer.
 * Log the original exception server-side and attach request IDs in the service.
 * @param error - Anything caught from simulation.
 * @returns A frozen JSON-safe response without stack, cause, or bigint fields.
 * @example
 * ```ts
 * import { SimulationRevertedError, toSimulationErrorResponse } from "@morpho-org/evm-simulation";
 * const error = new SimulationRevertedError("InsufficientBalance(1283)", "0xdeadbeef");
 * const body = JSON.stringify(toSimulationErrorResponse(error));
 * // {"code":"SIMULATION_REVERTED","message":"InsufficientBalance(1283)","revertData":"0xdeadbeef"}
 * ```
 */
export function toSimulationErrorResponse(
  error: unknown,
): SimulationErrorResponse {
  if (
    !isSimulationPackageError(error) ||
    error.code === "UNEXPECTED_SIMULATION_ERROR"
  ) {
    return Object.freeze({
      code: "UNEXPECTED_SIMULATION_ERROR",
      message: "Simulation failed unexpectedly.",
    });
  }
  if (error.code === "RPC_TRANSPORT_ERROR") {
    return Object.freeze({
      code: error.code,
      message: "RPC request failed. Check the endpoint and try again.",
    });
  }
  return Object.freeze({
    code: error.code,
    message: error.message,
    ...(error.code === "SIMULATION_REVERTED" &&
    "revertData" in error &&
    isHex(error.revertData)
      ? { revertData: error.revertData }
      : {}),
    ...((error.code === "SIMULATION_REVERTED" ||
      error.code === "SIMULATION_ASSERT_FAILED") &&
    "transactionIndex" in error &&
    typeof error.transactionIndex === "number" &&
    Number.isSafeInteger(error.transactionIndex) &&
    error.transactionIndex >= 0
      ? { transactionIndex: error.transactionIndex }
      : {}),
  });
}
