import {
  type Address,
  type BlockTag,
  type Hex,
  isAddress,
  isHex,
  maxUint256,
  numberToHex,
} from "viem";
import { z } from "zod";
import {
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
} from "../../errors.js";
import type {
  RawCall,
  RawLog,
  RawSimulationResult,
  SimulationTransaction,
  TenderlyRpcConfig,
} from "../../types.js";

interface TenderlyRpcCall {
  from: Address;
  to: Address;
  // `tenderly_simulateTransaction` keys calldata as `input`,
  // `tenderly_simulateBundle` keys it as `data`. Setting both lets the
  // same call shape work for either method without branching at call sites.
  input: Hex;
  data: Hex;
  value: Hex;
}

const addressSchema = z.custom<Address>(
  (val) => typeof val === "string" && isAddress(val),
);
const hexSchema = z.custom<Hex>((val) => typeof val === "string" && isHex(val));

const traceFrameSchema = z
  .object({
    output: hexSchema.optional(),
    error: z.string().optional(),
    errorReason: z.string().optional(),
  })
  .passthrough();

const logSchema = z
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
  .passthrough();

const simResultSchema = z
  .object({
    status: z.boolean(),
    gasUsed: hexSchema,
    logs: z.array(logSchema).optional(),
    trace: z.array(traceFrameSchema).optional(),
    assetChanges: z.unknown().optional(),
    error: z.string().optional(),
    errorMessage: z.string().optional(),
  })
  .passthrough();

type SimResult = z.infer<typeof simResultSchema>;

const rpcErrorSchema = z
  .object({
    code: z.number().optional(),
    message: z.string(),
    data: z.unknown().optional(),
  })
  .passthrough();

function rpcEnvelope<T extends z.ZodTypeAny>(result: T) {
  return z
    .object({ result: result.optional(), error: rpcErrorSchema.optional() })
    .passthrough();
}

const singleEnvelope = rpcEnvelope(simResultSchema);
const bundleEnvelope = rpcEnvelope(z.array(simResultSchema).min(1));

/**
 * Simulate one or more transactions via Tenderly's Node Web3 Gateway.
 * Dispatches to `tenderly_simulateTransaction` for a single call and
 * `tenderly_simulateBundle` for a multi-call bundle.
 *
 * @param params.config - Tenderly RPC config (URL with access key embedded).
 * @param params.transactions - Bundle to simulate, in execution order.
 * @param params.blockNumber - Optional pinned block number or `BlockTag`. Defaults to `latest`.
 * @param params.signal - Optional `AbortSignal` for cancellation / timeout.
 * @returns A {@link RawSimulationResult} with one `RawCall` per input transaction.
 * @throws {SimulationValidationError} when `transactions` is empty.
 * @throws {SimulationRevertedError} when any simulated tx reports `status: false`.
 * @throws {ExternalServiceError} on non-2xx response, JSON-RPC envelope error,
 *   schema-validation failure, or fetch-layer failure.
 */
export async function simulateTenderlyRpc(params: {
  config: TenderlyRpcConfig;
  transactions: SimulationTransaction[];
  blockNumber?: bigint | BlockTag;
  signal?: AbortSignal;
}): Promise<RawSimulationResult> {
  const { config, transactions, blockNumber, signal } = params;

  const firstTx = transactions[0];
  if (!firstTx) {
    throw new SimulationValidationError(
      "At least one transaction is required",
      [],
    );
  }

  const block = encodeBlock(blockNumber);
  // Inflate sender ETH balance to avoid false "insufficient funds for gas"
  // reverts on wallets low on native gas token — mirrors simulateV1.
  const stateOverrides = buildStateOverrides(firstTx.from);

  try {
    if (transactions.length === 1) {
      const json = await rpcRequest({
        rpcUrl: config.rpcUrl,
        method: "tenderly_simulateTransaction",
        params: [buildCall(firstTx), block, stateOverrides],
        signal,
      });
      const result = unwrapResult(singleEnvelope.parse(json));
      return { calls: [toRawCall(result)] };
    }

    const json = await rpcRequest({
      rpcUrl: config.rpcUrl,
      method: "tenderly_simulateBundle",
      params: [transactions.map(buildCall), block, stateOverrides],
      signal,
    });
    const result = unwrapResult(bundleEnvelope.parse(json));
    return { calls: result.map(toRawCall) };
  } catch (error) {
    if (error instanceof SimulationRevertedError) throw error;
    if (error instanceof ExternalServiceError) throw error;
    throw new ExternalServiceError(
      `Tenderly RPC error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

async function rpcRequest(params: {
  rpcUrl: string;
  method: string;
  params: unknown[];
  signal?: AbortSignal;
}): Promise<unknown> {
  const { rpcUrl, method, params: rpcParams, signal } = params;
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: rpcParams }),
    signal,
  });
  if (!response.ok) {
    throw new ExternalServiceError(
      `Tenderly RPC returned ${response.status}: ${response.statusText}`,
    );
  }
  return await response.json();
}

function unwrapResult<T>(envelope: {
  result?: T;
  error?: { message: string };
}): T {
  if (envelope.error) {
    throw new ExternalServiceError(
      `Tenderly RPC error: ${envelope.error.message}`,
    );
  }
  if (envelope.result === undefined) {
    throw new ExternalServiceError("Tenderly RPC returned no result");
  }
  return envelope.result;
}

function buildCall(tx: SimulationTransaction): TenderlyRpcCall {
  return {
    from: tx.from,
    to: tx.to,
    input: tx.data,
    data: tx.data,
    value: numberToHex(tx.value ?? 0n),
  };
}

function buildStateOverrides(
  sender: Address,
): Record<Address, { balance: Hex }> {
  return { [sender]: { balance: numberToHex(maxUint256) } };
}

function encodeBlock(blockNumber?: bigint | BlockTag): string {
  if (blockNumber === undefined) return "latest";
  return typeof blockNumber === "bigint"
    ? numberToHex(blockNumber)
    : blockNumber;
}

function toRawCall(data: SimResult): RawCall {
  if (data.status !== true) {
    // Tenderly RPC surfaces the revert reason on the trace frame; the
    // top-level fields are checked as a defensive fallback.
    const traceError = data.trace?.find((f) => f.errorReason || f.error);
    const message =
      traceError?.errorReason ||
      traceError?.error ||
      data.errorMessage ||
      data.error ||
      "Transaction simulation reverted";
    throw new SimulationRevertedError(message, data);
  }
  const logs: RawLog[] = [];
  for (const log of data.logs ?? []) {
    if (log.raw) {
      logs.push({
        address: log.raw.address,
        topics: log.raw.topics ?? [],
        data: log.raw.data ?? "0x",
      });
    }
  }
  return {
    logs,
    status: true,
    returnData: data.trace?.[0]?.output ?? "0x",
    gasUsed: BigInt(data.gasUsed),
    assetChanges: data.assetChanges,
  };
}
