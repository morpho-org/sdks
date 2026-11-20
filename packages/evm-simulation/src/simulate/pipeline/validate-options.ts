import { SimulationValidationError } from "../../errors.js";
import type { SimulationOptions } from "../../types.js";

const OPTION_KEYS: ReadonlySet<string> = new Set([
  "logger",
  "blockOverrides",
  "callGasLimit",
  "parentHashCheck",
  "timeoutMs",
]);
const MAX_TIMEOUT_MS = 2_147_483_647;
const BLOCK_OVERRIDE_KEYS: ReadonlySet<string> = new Set(["gasLimit"]);

/**
 * Reject invalid `simulate()` options before any RPC call: an unknown key
 * (such as 8.x's `chainId` or `simulateV1Url`), a `timeoutMs` that is set but
 * not an integer from 1 to 2147483647 (the largest delay Node timers keep), a
 * `blockOverrides.gasLimit` or `callGasLimit` that is set but not a positive
 * bigint, or a `parentHashCheck` that is set but not a boolean.
 *
 * @param options - The caller's options.
 * @throws {SimulationValidationError} When an option value is invalid.
 * @internal
 */
export function validateOptions(options: SimulationOptions): void {
  const unknownKeys = [
    ...Object.keys(options).filter((key) => !OPTION_KEYS.has(key)),
    ...Object.keys(options.blockOverrides ?? {})
      .filter((key) => !BLOCK_OVERRIDE_KEYS.has(key))
      .map((key) => `blockOverrides.${key}`),
  ];
  if (unknownKeys.length > 0) {
    throw new SimulationValidationError(
      `Unknown simulate() options: ${unknownKeys.map((key) => `"${key}"`).join(", ")}. Remove them; retries and endpoints are set on the caller's viem client transport.`,
      unknownKeys.map((key) => `${key}: unknown option`),
    );
  }
  const gasLimit: unknown = options.blockOverrides?.gasLimit;
  if (
    gasLimit !== undefined &&
    (typeof gasLimit !== "bigint" || gasLimit <= 0n)
  ) {
    throw new SimulationValidationError(
      `blockOverrides.gasLimit must be a positive bigint, got "${String(gasLimit)}" (${typeof gasLimit}). Pass a bigint greater than 0n or omit gasLimit.`,
      ["blockOverrides.gasLimit: must be a positive bigint"],
    );
  }
  const callGasLimit: unknown = options.callGasLimit;
  if (
    callGasLimit !== undefined &&
    (typeof callGasLimit !== "bigint" || callGasLimit <= 0n)
  ) {
    throw new SimulationValidationError(
      `callGasLimit must be a positive bigint, got "${String(callGasLimit)}" (${typeof callGasLimit}). Pass a bigint greater than 0n or omit callGasLimit.`,
      ["callGasLimit: must be a positive bigint"],
    );
  }
  const timeoutMs: unknown = options.timeoutMs;
  if (
    timeoutMs !== undefined &&
    (typeof timeoutMs !== "number" ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > MAX_TIMEOUT_MS)
  ) {
    throw new SimulationValidationError(
      `timeoutMs must be a whole number of milliseconds from 1 to 2147483647, got "${String(timeoutMs)}" (${typeof timeoutMs}). Pass a whole number of milliseconds from 1 to 2147483647 or omit timeoutMs.`,
      ["timeoutMs: must be an integer from 1 to 2147483647"],
    );
  }
  const parentHashCheck: unknown = options.parentHashCheck;
  if (parentHashCheck !== undefined && typeof parentHashCheck !== "boolean") {
    throw new SimulationValidationError(
      `parentHashCheck must be a boolean, got "${String(parentHashCheck)}" (${typeof parentHashCheck}). Pass true or false, or omit parentHashCheck.`,
      ["parentHashCheck: must be a boolean"],
    );
  }
}
