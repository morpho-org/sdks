import {
  type BlockTag,
  createPublicClient,
  ethAddress,
  getAddress,
  http,
  maxUint256,
} from "viem";
import {
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
} from "../../errors.js";
import type {
  AccountAssetChanges,
  RawCall,
  RawSimulationResult,
  SimulationTransaction,
  Transfer,
} from "../../types.js";
import { type AssetChangeEntry, groupAssetChanges } from "../asset-changes.js";
import { parseTransfers } from "../parsing/index.js";

/**
 * Simulate transactions using eth_simulateV1 (viem simulateCalls).
 *
 * Uses stateOverride to set the user's ETH balance high enough to avoid
 * false "insufficient balance for gas" reverts.
 *
 * Derives `assetChanges` (net per-token deltas grouped by account) from the
 * emitted transfer logs, plus native ETH from each transaction's top-level
 * `value` (payer debited, recipient credited, under viem's `ethAddress`).
 *
 * Coverage on this path is therefore narrower than the Tenderly backend:
 * native ETH moved through internal calls (e.g. a `WETH.withdraw` refund, a
 * swap that pays out ETH) emits no log and is not reflected in `value`, so it
 * is not captured. For full native-ETH accounting use Tenderly.
 */
export async function simulateV1(params: {
  rpcUrl: string;
  chainId: number;
  transactions: SimulationTransaction[];
  blockNumber?: bigint | BlockTag;
  signal?: AbortSignal;
}): Promise<RawSimulationResult> {
  const { rpcUrl, transactions, blockNumber, signal } = params;

  const client = createPublicClient({
    transport: http(rpcUrl, {
      fetchOptions: signal ? { signal } : undefined,
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
      // Inflate sender ETH balance to prevent false "insufficient gas" reverts.
      // Without this, valid ERC20 flows fail when the sender has low ETH.
      stateOverrides: [{ address: sender, balance: maxUint256 }],
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

    return {
      calls: rawCalls,
      assetChanges: toAssetChanges({
        transfers: parseTransfers(rawCalls),
        transactions,
      }),
    };
  } catch (error) {
    if (error instanceof SimulationRevertedError) throw error;
    if (error instanceof ExternalServiceError) throw error;
    throw new ExternalServiceError(
      `eth_simulateV1 error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Reduce parsed transfer logs and top-level transaction values to net per-token
 * balance changes grouped by account. Native ETH is taken from the top-level
 * `value`s (payer debited, recipient credited — internal moves are not logged,
 * see `simulateV1` for the coverage caveat).
 */
function toAssetChanges(params: {
  transfers: Transfer[];
  transactions: SimulationTransaction[];
}): AccountAssetChanges[] {
  const { transfers, transactions } = params;
  const entries: AssetChangeEntry[] = [];

  for (const tx of transactions) {
    if (!tx.value) continue;
    entries.push({ account: tx.from, token: ethAddress, diff: -tx.value });
    entries.push({ account: tx.to, token: ethAddress, diff: tx.value });
  }

  for (const { token, from, to, amount } of transfers) {
    entries.push({ account: to, token, diff: amount });
    entries.push({ account: from, token, diff: -amount });
  }

  return groupAssetChanges(entries);
}
