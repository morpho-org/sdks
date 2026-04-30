import { type Address, type BlockTag, type Hex, isAddress, isHex } from "viem";
import { z } from "zod";

import type {
  RawLog,
  RawSimulationResult,
  SimulationLogger,
  SimulationTransaction,
  TenderlyRestConfig,
} from "../../types.js";

import { ExternalServiceError, SimulationRevertedError } from "../../errors.js";

interface TenderlySimulateRequest {
  network_id: string;
  from: string;
  to: string;
  input: string;
  value: string;
  save: boolean;
  save_if_fails: boolean;
  simulation_type: "full";
  block_number?: number | string;
}

interface TenderlyBundleRequest {
  simulations: TenderlySimulateRequest[];
}

// Zod validators for the subset of Tenderly responses we consume.
// Addresses must be 40-hex-digit `0x...` (not just any string); topics and
// data must be `0x`-prefixed hex so downstream `getAddress()` / `BigInt()`
// calls don't throw inside `parseTransfers`, silently dropping transfers.
const addressSchema = z.custom<Address>(
  (val) => typeof val === "string" && isAddress(val),
);
const hexSchema = z.custom<Hex>((val) => typeof val === "string" && isHex(val));

const tenderlyRawResponseSchema = z
  .object({
    simulation: z
      .object({
        id: z.string().optional(),
        status: z.boolean().optional(),
        error_message: z.string().optional(),
      })
      .passthrough(),
    transaction: z
      .object({
        error_message: z.string().optional(),
        transaction_info: z
          .object({
            logs: z
              .array(
                z
                  .object({
                    raw: z
                      .object({
                        address: addressSchema,
                        topics: z.array(hexSchema).optional(),
                        data: hexSchema.optional(),
                      })
                      .passthrough()
                      .optional(),
                  })
                  .passthrough(),
              )
              .optional(),
            asset_changes: z.unknown().optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

type TenderlyRawResponse = z.infer<typeof tenderlyRawResponseSchema>;

const tenderlyBundleRawResponseSchema = z
  .object({
    simulation_results: z.array(tenderlyRawResponseSchema).min(1),
  })
  .passthrough();

/**
 * Simulate transactions using Tenderly REST API.
 *
 * @param shareable - true persists the simulation in Tenderly and returns a shareable URL;
 *   false runs ephemerally with no URL. Translates to Tenderly's `save` wire field
 *   (`save_if_fails` is also set to `shareable` — so failed preview simulations are
 *   ALSO persisted and shareable. Callers that preview sensitive calldata should be
 *   aware this persists in Tenderly's dashboard regardless of success/failure).
 */
export async function simulateTenderlyRest(params: {
  config: TenderlyRestConfig;
  chainId: number;
  transactions: SimulationTransaction[];
  blockNumber?: bigint | BlockTag;
  shareable: boolean;
  signal?: AbortSignal;
  logger?: SimulationLogger;
}): Promise<RawSimulationResult> {
  const {
    config,
    chainId,
    transactions,
    blockNumber,
    shareable,
    signal,
    logger,
  } = params;
  const baseUrl = buildBaseUrl(config);

  try {
    if (transactions.length === 1) {
      return await simulateSingle({
        baseUrl,
        config,
        chainId,
        tx: transactions[0]!,
        blockNumber,
        shareable,
        signal,
        logger,
      });
    }

    return await simulateBundle({
      baseUrl,
      config,
      chainId,
      transactions,
      blockNumber,
      shareable,
      signal,
      logger,
    });
  } catch (error) {
    if (error instanceof SimulationRevertedError) throw error;
    if (error instanceof ExternalServiceError) throw error;
    throw new ExternalServiceError(
      `Tenderly REST API error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** URL-encode the path-segment config values so `/`, `?`, `#` can't retarget the request. */
function buildBaseUrl(config: TenderlyRestConfig): string {
  const account = encodeURIComponent(config.accountSlug);
  const project = encodeURIComponent(config.projectSlug);
  return `${config.apiBaseUrl}/api/v1/account/${account}/project/${project}`;
}

/** Build the `TenderlySimulateRequest` body for one transaction. Shared by single + bundle. */
function buildTxBody(
  tx: SimulationTransaction,
  chainId: number,
  shareable: boolean,
  blockNumber?: bigint | BlockTag,
): TenderlySimulateRequest {
  return {
    network_id: String(chainId),
    from: tx.from,
    to: tx.to,
    input: tx.data,
    value: String(tx.value ?? 0n),
    save: shareable,
    save_if_fails: shareable,
    simulation_type: "full",
    ...(blockNumber !== undefined && {
      block_number:
        typeof blockNumber === "bigint" ? String(blockNumber) : blockNumber,
    }),
  };
}

async function simulateSingle(params: {
  baseUrl: string;
  config: TenderlyRestConfig;
  chainId: number;
  tx: SimulationTransaction;
  blockNumber?: bigint | BlockTag;
  shareable: boolean;
  signal?: AbortSignal;
  logger?: SimulationLogger;
}): Promise<RawSimulationResult> {
  const {
    baseUrl,
    config,
    chainId,
    tx,
    blockNumber,
    shareable,
    signal,
    logger,
  } = params;

  const body = buildTxBody(tx, chainId, shareable, blockNumber);

  const response = await fetch(`${baseUrl}/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Key": config.accessToken,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new ExternalServiceError(
      `Tenderly REST API returned ${response.status}: ${response.statusText}`,
    );
  }

  const data = tenderlyRawResponseSchema.parse(await response.json());
  const result = parseTenderlyResponse(data, shareable);

  if (shareable && data.simulation.id) {
    const shared = await shareSimulation({
      baseUrl,
      config,
      simulationId: data.simulation.id,
      signal,
      logger,
    });
    if (!shared) result.tenderlyUrl = undefined;
  }

  return result;
}

async function simulateBundle(params: {
  baseUrl: string;
  config: TenderlyRestConfig;
  chainId: number;
  transactions: SimulationTransaction[];
  blockNumber?: bigint | BlockTag;
  shareable: boolean;
  signal?: AbortSignal;
  logger?: SimulationLogger;
}): Promise<RawSimulationResult> {
  const {
    baseUrl,
    config,
    chainId,
    transactions,
    blockNumber,
    shareable,
    signal,
    logger,
  } = params;

  const body: TenderlyBundleRequest = {
    simulations: transactions.map((tx) =>
      buildTxBody(tx, chainId, shareable, blockNumber),
    ),
  };

  const response = await fetch(`${baseUrl}/simulate-bundle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Key": config.accessToken,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new ExternalServiceError(
      `Tenderly REST API returned ${response.status}: ${response.statusText}`,
    );
  }

  const data = tenderlyBundleRawResponseSchema.parse(await response.json());
  const simulations = data.simulation_results;

  // Collect logs from ALL steps (approvals + main tx) for complete bundler retention coverage.
  // Only build the shareable URL from the last step; others parse with shareable=false.
  const allLogs: RawLog[] = [];
  let lastResult: RawSimulationResult | undefined;
  let lastSimulationId: string | undefined;
  for (let i = 0; i < simulations.length; i++) {
    const sim = simulations[i]!;
    const isLast = i === simulations.length - 1;
    const parsed = parseTenderlyResponse(sim, isLast && shareable);
    allLogs.push(...parsed.logs);
    if (isLast) {
      lastResult = parsed;
      lastSimulationId = sim.simulation.id;
    }
  }

  // Schema enforces `.min(1)` — lastResult is always defined after the loop.
  let tenderlyUrl = lastResult!.tenderlyUrl;

  if (shareable && tenderlyUrl && lastSimulationId) {
    const shared = await shareSimulation({
      baseUrl,
      config,
      simulationId: lastSimulationId,
      signal,
      logger,
    });
    if (!shared) tenderlyUrl = undefined;
  }

  return {
    logs: allLogs,
    tenderlyUrl,
    rawAssetChanges: lastResult!.rawAssetChanges,
  };
}

/**
 * Try to make a simulation publicly shareable. Returns true iff Tenderly's
 * `/share` endpoint responded 2xx. On any other outcome (non-ok response,
 * abort, network error), logs via `logger` and returns false — the caller
 * then clears `tenderlyUrl`. `AbortError` is re-thrown so cancellation
 * propagates cleanly instead of silently downgrading to "no URL".
 */
async function shareSimulation(params: {
  baseUrl: string;
  config: TenderlyRestConfig;
  simulationId: string;
  signal?: AbortSignal;
  logger?: SimulationLogger;
}): Promise<boolean> {
  const { baseUrl, config, simulationId, signal, logger } = params;
  const safeId = encodeURIComponent(simulationId);
  try {
    const response = await fetch(`${baseUrl}/simulations/${safeId}/share`, {
      method: "POST",
      headers: { "X-Access-Key": config.accessToken },
      signal,
    });
    if (!response.ok) {
      logger?.warn(
        "Tenderly /share returned non-ok; tenderlyUrl will be cleared",
        {
          simulationId,
          status: response.status,
          statusText: response.statusText,
        },
      );
      return false;
    }
    return true;
  } catch (error) {
    // Propagate cancellation; swallow only genuine fetch-layer failures.
    if (error instanceof Error && error.name === "AbortError") throw error;
    logger?.warn("Tenderly /share fetch failed; tenderlyUrl will be cleared", {
      simulationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function parseTenderlyResponse(
  data: TenderlyRawResponse,
  shareable: boolean,
): RawSimulationResult {
  const { simulation, transaction } = data;

  if (simulation.status !== true) {
    const errorMessage =
      transaction.error_message ||
      simulation.error_message ||
      "Transaction simulation reverted";
    // NOTE: `data` includes the full Tenderly response (request body, calldata,
    // asset changes). Callers that log `error.details` should redact — see
    // `errors.ts` doc for `SimulationRevertedError.details`.
    throw new SimulationRevertedError(errorMessage, data);
  }

  const rawLogs: RawLog[] = [];
  const logs = transaction.transaction_info.logs ?? [];
  for (const log of logs) {
    if (log.raw) {
      rawLogs.push({
        address: log.raw.address,
        topics: log.raw.topics ?? [],
        data: log.raw.data ?? "0x",
      });
    }
  }

  const tenderlyUrl =
    shareable && simulation.id
      ? `https://dashboard.tenderly.co/shared/simulation/${simulation.id}`
      : undefined;

  return {
    logs: rawLogs,
    tenderlyUrl,
    rawAssetChanges: transaction.transaction_info.asset_changes,
  };
}
