import type { Address, BlockTag } from "viem";
import { ExternalServiceError, UnsupportedChainError } from "../../errors.js";
import type {
  RawSimulationResult,
  SimulationConfig,
  SimulationTransaction,
  TenderlyRpcConfig,
} from "../../types.js";
import { simulateTenderlyRpc, simulateV1 } from "../backends/index.js";
import { resolveChain } from "./resolve-chain.js";

/** Total budget for a single `simulate()` call across both backends. */
const DEFAULT_TIMEOUT_MS = 5000;

/** Fraction of `timeoutMs` Tenderly runs alone before the backends are hedged. */
const TENDERLY_HEDGE_RATIO = 0.4;

/**
 * Minimum budget (ms) handed to `eth_simulateV1` when it starts.
 *
 * The floor keeps the fallback viable when little or no overall time remains,
 * at the cost of treating `timeoutMs` as a soft ceiling.
 */
const FALLBACK_MIN_BUDGET_MS = 1500;

/**
 * Stage 4 of the simulate() pipeline.
 *
 * Tenderly runs alone for the first 40% of `timeoutMs`, then both backends run
 * in parallel. The first definitive result wins: a success or a non-service
 * error. A backend's `ExternalServiceError` waits for the other backend, and
 * if both fail that way the fallback error is thrown. The fallback receives
 * at least `FALLBACK_MIN_BUDGET_MS`. Tenderly-only chains get the full budget;
 * simulateV1-only chains are unchanged.
 */
export async function executeSimulation(params: {
  config: SimulationConfig;
  chainId: number;
  transactions: SimulationTransaction[];
  blockNumber?: bigint | BlockTag;
  wNative?: Address | null;
}): Promise<RawSimulationResult> {
  const { config, chainId, transactions, blockNumber, wNative } = params;
  const chain = resolveChain(config, chainId);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (chain.tenderlyRpc && chain.simulateV1Url) {
    return await executeHedgedSimulation({
      config,
      chainId,
      tenderlyRpc: chain.tenderlyRpc,
      simulateV1Url: chain.simulateV1Url,
      transactions,
      blockNumber,
      wNative,
      timeoutMs,
    });
  }

  if (chain.tenderlyRpc) {
    // Backend output is trusted as execution evidence; shape checks cannot catch a well-formed forged result. See THREAT_MODEL.md, RPC.
    return await simulateTenderlyRpc({
      config: chain.tenderlyRpc,
      transactions,
      blockNumber,
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  /* v8 ignore next: resolveChain rejects this state before executeSimulation reaches the fallback path. */
  if (!chain.simulateV1Url) {
    throw new UnsupportedChainError(chainId);
  }

  return await simulateV1({
    rpcUrl: chain.simulateV1Url,
    chainId,
    transactions,
    blockNumber,
    wNative,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

type Backend = "tenderly" | "eth_simulateV1";
type FallbackReason = "tenderly_slow" | "tenderly_error";

type BackendOutcome =
  | {
      backend: Backend;
      type: "success";
      result: RawSimulationResult;
    }
  | {
      backend: Backend;
      type: "error";
      error: unknown;
    };

function toBackendOutcome(
  backend: Backend,
  promise: Promise<RawSimulationResult>,
): Promise<BackendOutcome> {
  return promise.then(
    (result) => ({ backend, type: "success", result }),
    (error: unknown) => ({ backend, type: "error", error }),
  );
}

async function executeHedgedSimulation(params: {
  config: SimulationConfig;
  chainId: number;
  tenderlyRpc: TenderlyRpcConfig;
  simulateV1Url: string;
  transactions: SimulationTransaction[];
  blockNumber?: bigint | BlockTag;
  wNative?: Address | null;
  timeoutMs: number;
}): Promise<RawSimulationResult> {
  const {
    config,
    chainId,
    tenderlyRpc,
    simulateV1Url,
    transactions,
    blockNumber,
    wNative,
    timeoutMs,
  } = params;
  const start = Date.now();
  const deadline = start + timeoutMs;
  const hedgeDelayMs = Math.floor(timeoutMs * TENDERLY_HEDGE_RATIO);
  const tenderlyController = new AbortController();
  const fallbackController = new AbortController();
  const pending = new Map<Backend, Promise<BackendOutcome>>();
  let fallbackReason: FallbackReason | undefined;
  let tenderlyError: ExternalServiceError | undefined;
  let fallbackError: ExternalServiceError | undefined;
  let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

  const tenderlyPromise = toBackendOutcome(
    "tenderly",
    simulateTenderlyRpc({
      config: tenderlyRpc,
      transactions,
      blockNumber,
      signal: AbortSignal.any([
        tenderlyController.signal,
        AbortSignal.timeout(timeoutMs),
      ]),
    }),
  );
  pending.set("tenderly", tenderlyPromise);

  const startFallback = (reason: FallbackReason) => {
    if (fallbackReason !== undefined) return;

    fallbackReason = reason;
    if (hedgeTimer !== undefined) clearTimeout(hedgeTimer);
    const fallbackPromise = toBackendOutcome(
      "eth_simulateV1",
      simulateV1({
        rpcUrl: simulateV1Url,
        chainId,
        transactions,
        blockNumber,
        wNative,
        signal: AbortSignal.any([
          fallbackController.signal,
          AbortSignal.timeout(
            Math.max(deadline - Date.now(), FALLBACK_MIN_BUDGET_MS),
          ),
        ]),
      }),
    );
    pending.set("eth_simulateV1", fallbackPromise);
  };

  hedgeTimer = setTimeout(() => {
    if (!pending.has("tenderly")) return;

    config.logger?.info(
      "Tenderly simulation slow, starting eth_simulateV1 in parallel",
      { chainId, hedgeDelayMs },
    );
    startFallback("tenderly_slow");
  }, hedgeDelayMs);

  try {
    while (pending.size > 0) {
      const outcome = await Promise.race(pending.values());
      pending.delete(outcome.backend);

      if (
        outcome.type === "success" ||
        !(outcome.error instanceof ExternalServiceError)
      ) {
        if (outcome.backend === "tenderly") {
          fallbackController.abort();
        } else {
          tenderlyController.abort();
        }

        if (fallbackReason !== undefined) {
          config.logger?.info("Simulation backend selected", {
            chainId,
            backend: outcome.backend,
            fallbackReason,
            outcome: outcome.type === "success" ? "success" : "error",
            elapsedMs: Date.now() - start,
          });
        }

        if (outcome.type === "success") return outcome.result;
        throw outcome.error;
      }

      if (outcome.backend === "tenderly") {
        tenderlyError = outcome.error;
        config.logger?.warn("Tenderly simulation failed, attempting fallback", {
          chainId,
          error: outcome.error.message,
          fallbackReason: "tenderly_error",
          elapsedMs: Date.now() - start,
        });
        startFallback("tenderly_error");
      } else {
        fallbackError = outcome.error;
      }

      if (tenderlyError && fallbackError) {
        config.logger?.warn("Simulation fallback failed", {
          chainId,
          fallbackReason,
          error: fallbackError.message,
          elapsedMs: Date.now() - start,
        });
        throw fallbackError;
      }
    }

    throw fallbackError ?? tenderlyError;
  } finally {
    if (hedgeTimer !== undefined) clearTimeout(hedgeTimer);
  }
}
