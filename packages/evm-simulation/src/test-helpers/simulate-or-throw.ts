import { simulate } from "../index.js";
import type { SimulateInputParams, SimulateParams } from "../params.js";
import type {
  SimulationFailure,
  VerifiedSimulationInputResult,
  VerifiedSimulationResult,
} from "../result.js";
import type { SimulationExecution } from "../simulate/backends/parse-response.js";
import type { SimulationClient, SimulationOptions } from "../types.js";
import type { SimulationWarning } from "../warnings.js";

/** Test adapter: forked RPCs are slower than the SDK's 5000 ms default deadline. */
const TEST_TIMEOUT_MS = 30_000;

/** Test adapter: throw blocking failures, otherwise reject position warnings or unwrap the result. */
export function unwrapReport<T>(
  report:
    | {
        readonly ok: true;
        readonly result: T;
        readonly warnings: readonly SimulationWarning[];
      }
    | SimulationFailure,
): T {
  if (report.ok) {
    const positionWarning = report.warnings.find(
      ({ code }) => code === "UNEXPECTED_POSITION_CHANGE",
    );
    if (positionWarning) {
      throw new Error(positionWarning.message);
    }
    return report.result;
  }
  if (report.failures.length === 1) {
    throw report.failures[0];
  }
  throw new AggregateError(
    report.failures,
    "Simulation reported several failures.",
  );
}

/** Test adapter: the result, the only failure thrown, or every failure as an `AggregateError`. */
// biome-ignore lint/complexity/useMaxParams: The approved 9.0 API is simulate(client, params, options?).
export function simulateOrThrow(
  client: SimulationClient,
  params: SimulateParams,
  options?: SimulationOptions,
): Promise<VerifiedSimulationResult>;
// biome-ignore lint/complexity/useMaxParams: The approved 9.0 API is simulate(client, params, options?).
export function simulateOrThrow(
  client: SimulationClient,
  params: SimulateInputParams,
  options?: SimulationOptions,
): Promise<VerifiedSimulationInputResult>;
// biome-ignore lint/complexity/useMaxParams: The approved 9.0 API is simulate(client, params, options?).
export async function simulateOrThrow(
  client: SimulationClient,
  params: SimulateInputParams,
  options?: SimulationOptions,
): Promise<VerifiedSimulationInputResult> {
  return unwrapReport(
    await simulate(client, params, { timeoutMs: TEST_TIMEOUT_MS, ...options }),
  );
}

/** Test adapter: the result, or the run's first failure in pipeline order thrown. */
// biome-ignore lint/complexity/useMaxParams: The approved 9.0 API is simulate(client, params, options?).
export function simulateOrThrowFirst(
  client: SimulationClient,
  params: SimulateParams,
  options?: SimulationOptions,
): Promise<VerifiedSimulationResult>;
// biome-ignore lint/complexity/useMaxParams: The approved 9.0 API is simulate(client, params, options?).
export function simulateOrThrowFirst(
  client: SimulationClient,
  params: SimulateInputParams,
  options?: SimulationOptions,
): Promise<VerifiedSimulationInputResult>;
// biome-ignore lint/complexity/useMaxParams: The approved 9.0 API is simulate(client, params, options?).
export async function simulateOrThrowFirst(
  client: SimulationClient,
  params: SimulateInputParams,
  options?: SimulationOptions,
): Promise<VerifiedSimulationInputResult> {
  const report = await simulate(client, params, {
    timeoutMs: TEST_TIMEOUT_MS,
    ...options,
  });
  if (!report.ok) {
    throw report.failures[0];
  }
  return unwrapReport(report);
}

/** Test adapter: throw a reverted execution's terminal revert, else return the execution. */
export function throwRevert<T extends SimulationExecution>(execution: T): T {
  if (execution.reverted) {
    throw execution.failures.at(-1);
  }
  return execution;
}

/** Test adapter: the first reported failure of an `AggregateError`, else the value itself. */
export function firstFailure(error: unknown): unknown {
  return error instanceof AggregateError ? error.errors[0] : error;
}
