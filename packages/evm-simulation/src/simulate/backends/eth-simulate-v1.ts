import {
  type Address,
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
  AssetChange,
  RawCall,
  RawSimulationResult,
  SimulationTransaction,
  Transfer,
} from "../../types.js";
import { parseTransfers } from "../parsing/index.js";

/**
 * Simulate transactions using eth_simulateV1 (viem simulateCalls).
 *
 * Uses stateOverride to set the user's ETH balance high enough to avoid
 * false "insufficient balance for gas" reverts.
 *
 * Derives `assetChanges` (the sender's net per-token delta) from the emitted
 * transfer logs, plus the sender's net native ETH outflow from the top-level
 * `value` of each transaction (reported under viem's `ethAddress` sentinel).
 *
 * Coverage on this path is therefore narrower than the Tenderly backend:
 * native ETH the sender *receives* through internal calls (e.g. a
 * `WETH.withdraw` refund, a swap that pays out ETH) emits no log and is not
 * reflected in `value`, so it is not captured. Only top-level ETH the sender
 * sends out is accounted for. For full native-ETH accounting use Tenderly.
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
        sender,
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
 * Reduce parsed transfer logs and top-level transaction values to the sender's
 * net per-token delta. Native ETH is the sender's total `value` outflow over the
 * bundle (sent ETH only — see `simulateV1` for the coverage caveat). The result
 * is sorted by token address for deterministic, cross-backend output.
 */
function toAssetChanges(params: {
  transfers: Transfer[];
  transactions: SimulationTransaction[];
  sender: Address;
}): AssetChange[] {
  const { transfers, transactions, sender } = params;
  const byToken = new Map<Address, bigint>();

  // Native ETH: the sender funds every top-level `value` in the bundle.
  let nativeOut = 0n;
  for (const { value } of transactions) {
    if (value) nativeOut += value;
  }
  if (nativeOut !== 0n) byToken.set(ethAddress, -nativeOut);

  for (const { token, from, to, amount } of transfers) {
    let diff = 0n;
    if (to === sender) diff += amount;
    if (from === sender) diff -= amount;
    if (diff === 0n) continue;
    byToken.set(token, (byToken.get(token) ?? 0n) + diff);
  }
  return [...byToken]
    .map(([token, diff]) => ({ token, diff }))
    .filter((c) => c.diff !== 0n)
    .sort((a, b) => a.token.toLowerCase().localeCompare(b.token.toLowerCase()));
}
