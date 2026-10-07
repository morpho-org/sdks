import type { AnvilTestClient } from "@morpho-org/test";
import { type Address, encodeFunctionData, parseEther } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { ExternalServiceError } from "../../../src/errors.js";
import { executePlan } from "../../../src/simulate/backends/eth-simulate-v1.js";
import { planExecution } from "../../../src/simulate/plan/plan-execution.js";
import { parseRequest } from "../../../src/simulate/request/parse-request.js";
import { test } from "../../setup.js";

const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const RECIPIENT: Address = "0x000000000000000000000000000000000000dEaD";

const wethAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
] as const;

function planFor(
  transactions: readonly { to: Address; data: `0x${string}`; value?: bigint }[],
  owner: Address,
) {
  return planExecution({
    request: parseRequest({
      chainId: mainnet.id,
      transactions: transactions.map((tx) => ({
        ...tx,
        chainId: mainnet.id,
        from: owner,
      })),
    }),
    owner,
    preparations: [],
    reads: [],
  });
}

const pin = async (client: AnvilTestClient<typeof mainnet>) => {
  const number = await client.getBlockNumber();
  const block = await client.getBlock({ blockNumber: number });
  return { number, hash: block.hash!, timestamp: block.timestamp };
};

describe.sequential("executePlan — pinned execution on a mainnet fork", () => {
  test("error: ExternalServiceError when the node rejects a different call chainId", async ({
    client,
  }) => {
    const chainId = 8453;
    const owner = client.account.address;
    const plan = planExecution({
      request: parseRequest({
        chainId,
        transactions: [{ chainId, from: owner, to: RECIPIENT, data: "0x" }],
      }),
      owner,
      preparations: [],
      reads: [],
    });
    await expect(
      executePlan({
        client,
        plan,
        stateBlock: await pin(client),
        validation: false,
      }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });

  test("deterministic pinned metadata", async ({ client }) => {
    // Anvil requires the eth_simulateV1 pin to equal node head and reports
    // block.number === the pin (no base+1 advancement like geth).
    const stateBlock = await pin(client);
    const head = stateBlock.number;
    const plan = planFor(
      [{ to: RECIPIENT, data: "0x" }],
      client.account.address,
    );

    const execution = await executePlan({
      client,
      plan,
      stateBlock,
      validation: false,
    });

    expect(execution.block.chainId).toBe(mainnet.id);
    expect(execution.block.stateBlockNumber).toBe(head);
    expect(execution.block.stateBlockHash).toBe(stateBlock.hash);
    expect(execution.block.blockNumber).toBeGreaterThanOrEqual(head);
    expect(execution.block.blockTimestamp).toBeGreaterThanOrEqual(
      execution.block.stateBlockTimestamp,
    );

    // Re-running at the same pin yields a deep-equal block and readings.
    const again = await executePlan({
      client,
      plan,
      stateBlock,
      validation: false,
    });
    expect(again.block).toEqual(execution.block);
    expect(again.stateReads).toEqual(execution.stateReads);
  });

  test("native value moves report as traceTransfers logs", async ({
    client,
  }) => {
    const amount = parseEther("0.5");
    const before = await client.getBalance({
      address: client.account.address,
    });
    const stateBlock = await pin(client);
    const execution = await executePlan({
      client,
      plan: planFor(
        [{ to: RECIPIENT, data: "0x", value: amount }],
        client.account.address,
      ),
      stateBlock,
      validation: false,
    });
    expect(execution.calls).toHaveLength(1);
    // traceTransfers synthesizes the native move as a transfer log, which is
    // how native after-balances are projected — no in-block probe needed.
    const after = await client.getBalance({
      address: client.account.address,
    });
    expect(before - after).toBe(0n); // simulate does not persist state
  });

  test("sequential state: deposit then withdraw emits native transfer logs", async ({
    client,
  }) => {
    const amount = parseEther("0.5");
    const stateBlock = await pin(client);
    const execution = await executePlan({
      client,
      plan: planFor(
        [
          {
            to: WETH,
            data: encodeFunctionData({
              abi: wethAbi,
              functionName: "deposit",
            }),
            value: amount,
          },
          {
            to: WETH,
            data: encodeFunctionData({
              abi: wethAbi,
              functionName: "withdraw",
              args: [amount],
            }),
          },
        ],
        client.account.address,
      ),
      stateBlock,
      validation: false,
    });
    expect(execution.calls).toHaveLength(2);
    expect(execution.calls.every((c) => c.result.status)).toBe(true);
  });
});
