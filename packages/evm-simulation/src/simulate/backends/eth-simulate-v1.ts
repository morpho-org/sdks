import {
  http,
  type BlockTag,
  createPublicClient,
  getAddress,
  maxUint256,
} from "viem";

import type {
  RawLog,
  RawSimulationResult,
  SimulationTransaction,
} from "../../types.js";

import {
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
} from "../../errors.js";

/**
 * Simulate transactions using eth_simulateV1 (viem simulateCalls).
 *
 * Uses stateOverride to set the user's ETH balance high enough to avoid
 * false "insufficient balance for gas" reverts.
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

    const rawLogs: RawLog[] = [];
    for (const r of results) {
      for (const log of r.logs ?? []) {
        rawLogs.push({
          address: log.address,
          topics: [...log.topics],
          data: log.data ?? "0x",
        });
      }
    }

    return { logs: rawLogs };
  } catch (error) {
    if (error instanceof SimulationRevertedError) throw error;
    if (error instanceof ExternalServiceError) throw error;
    throw new ExternalServiceError(
      `eth_simulateV1 error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
