import {
  type Address,
  BaseError,
  type BlockTag,
  createPublicClient,
  ExecutionRevertedError,
  getAddress,
  HttpRequestError,
  http,
  maxUint256,
} from "viem";
import {
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
} from "../../errors.js";
import type {
  RawCall,
  RawSimulationResult,
  SimulationTransaction,
} from "../../types.js";
import { type AssetChangeEntry, groupAssetChanges } from "../asset-changes.js";
import { parseTransfers } from "../parsing/index.js";

/**
 * Simulate transactions using eth_simulateV1 (viem simulateCalls).
 *
 * Uses stateOverride to set the user's ETH balance high enough to avoid
 * false "insufficient balance for gas" reverts.
 *
 * Runs with `traceTransfers` enabled, so the node synthesizes native-ETH moves
 * (the top-level `value` *and* ETH moved through internal calls — e.g. a
 * `WETH.withdraw` refund or a swap that pays out ETH) as `Transfer` events from
 * the native sentinel. Derives `assetChanges` (net per-token deltas grouped by
 * account) entirely from the emitted transfer logs, with native ETH normalized
 * to viem's `ethAddress`. Top-level `value` is intentionally *not* added on top:
 * `traceTransfers` already logs it, so adding it would double-count.
 *
 * @internal
 * @param params - RPC endpoint, chain, ordered transactions and optional block/native token/deadline.
 * @returns Per-call outputs and net balance changes derived from transfer logs.
 * @throws {SimulationValidationError} For empty calls or mixed senders.
 * @throws {SimulationRevertedError} When a call or the node reports an execution revert.
 * @throws {ExternalServiceError} When the RPC fails, times out or cannot be parsed.
 * @example
 * ```ts
 * import { simulateV1 } from "./eth-simulate-v1.js";
 *
 * const result = await simulateV1({
 *   rpcUrl: "https://rpc.example", chainId: 1,
 *   transactions: [{
 *     from: "0x1111111111111111111111111111111111111111",
 *     to: "0x2222222222222222222222222222222222222222",
 *     data: "0x", value: 1n,
 *   }],
 * });
 * // result.calls[0].status === true
 * ```
 */
export async function simulateV1(params: {
  rpcUrl: string;
  chainId: number;
  transactions: SimulationTransaction[];
  blockNumber?: bigint | BlockTag;
  wNative?: Address | null;
  signal?: AbortSignal;
}): Promise<RawSimulationResult> {
  const { rpcUrl, transactions, blockNumber, wNative, signal } = params;

  const client = createPublicClient({
    transport: http(rpcUrl, {
      fetchOptions: signal ? { signal } : undefined,
      // A failed request must not consume another attempt or a fresh budget.
      retryCount: 0,
      // The pipeline abort signal owns the overall execution deadline.
      timeout: signal ? 0 : undefined,
    }),
  });

  const firstTx = transactions[0];
  if (!firstTx) {
    throw new SimulationValidationError(
      "At least one transaction is required",
      [],
    );
  }

  const sender = getAddress(firstTx.from);

  // eth_simulateV1 executes all calls as the same account. Reject mixed senders
  // to avoid silently simulating under the wrong address.
  const mixedSender = transactions.find((tx) => getAddress(tx.from) !== sender);
  if (mixedSender) {
    throw new SimulationValidationError(
      "All transactions must have the same from address for eth_simulateV1",
      [`expected ${sender}, got ${mixedSender.from}`],
    );
  }

  const calls = transactions.map((tx) => ({
    to: tx.to,
    data: tx.data,
    value: tx.value,
  }));

  const blockParam =
    typeof blockNumber === "bigint"
      ? { blockNumber }
      : blockNumber !== undefined
        ? { blockTag: blockNumber }
        : {};

  try {
    const simulationResult = await client.simulateCalls({
      account: sender,
      calls,
      ...blockParam,
      // Synthesize native-ETH moves (top-level value + internal calls) as
      // Transfer logs from the native sentinel, so `parseTransfers` captures
      // ETH that emits no real log (e.g. a WETH.withdraw refund).
      traceTransfers: true,
      // Inflate sender ETH balance to prevent false "insufficient gas" reverts.
      // Without this, valid ERC20 flows fail when the sender has low ETH.
      // Use half of uint256 (not the ceiling) so the override leaves headroom
      // for inbound native ETH — e.g. a WETH.withdraw refund or a swap payout
      // would overflow the recipient balance and revert the value transfer if
      // the sender were pinned at maxUint256.
      stateOverrides: [{ address: sender, balance: maxUint256 / 2n }],
    });

    const results = simulationResult.results;

    if (!Array.isArray(results)) {
      throw new ExternalServiceError(
        "eth_simulateV1 returned unexpected response format",
      );
    }

    const failedResult = results.find((r) => r.status !== "success");
    if (failedResult) {
      throw new SimulationRevertedError(
        failedResult.error?.message ?? "Simulation failed",
        results,
      );
    }

    const rawCalls: RawCall[] = results.map((r) => ({
      logs: (r.logs ?? []).map((log) => ({
        address: log.address,
        topics: [...log.topics],
        data: log.data ?? "0x",
      })),
      status: r.status === "success",
      returnData: r.data ?? "0x",
      gasUsed: r.gasUsed,
    }));

    const entries: AssetChangeEntry[] = [];
    for (const { token, from, to, amount } of parseTransfers(rawCalls, {
      wNative,
    })) {
      entries.push({ account: to, token, diff: amount });
      entries.push({ account: from, token, diff: -amount });
    }

    return { calls: rawCalls, assetChanges: groupAssetChanges(entries) };
  } catch (error) {
    if (error instanceof SimulationRevertedError) throw error;
    if (error instanceof ExternalServiceError) throw error;
    // A node-level "execution reverted" is a property of the bundle, not the backend.
    if (error instanceof ExecutionRevertedError)
      throw new SimulationRevertedError(error.shortMessage, error);
    throw new ExternalServiceError(
      `eth_simulateV1 error: ${describeTransportError(error)}`,
      { cause: error },
    );
  }
}

// viem embeds the request URL (which may carry an access key) in `message`;
// `shortMessage` and the HTTP status do not.
function describeTransportError(error: unknown): string {
  if (error instanceof HttpRequestError)
    return error.status
      ? `${error.shortMessage} (status ${error.status})`
      : error.shortMessage;
  if (error instanceof BaseError) return error.shortMessage;
  return error instanceof Error ? error.message : String(error);
}
