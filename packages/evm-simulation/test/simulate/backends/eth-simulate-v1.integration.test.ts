import { type Address, encodeFunctionData, parseEther } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { executePlan } from "../../../src/simulate/backends/eth-simulate-v1.js";
import { planExecution } from "../../../src/simulate/plan/plan-execution.js";
import { parseRequest } from "../../../src/simulate/request/parse-request.js";
import { nativeReads } from "../../../src/simulate/state/native.js";
import { decodeStateRead } from "../../../src/simulate/state/read-state.js";
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
      transactions: transactions.map((tx) => ({ ...tx, from: owner })),
    }),
    owner,
    preparations: [],
    reads: nativeReads([owner]),
    intermediateReads: nativeReads([owner]),
  });
}

const readAssets = (execution: Awaited<ReturnType<typeof executePlan>>) =>
  execution.stateReads
    .filter((r) => r.read.kind === "native.balance")
    .map((r) => ({
      phase: r.phase,
      account: r.read.kind === "native.balance" ? r.read.account : undefined,
      assets: decodeStateRead(r.read, r.returnData).value,
    }));

describe.sequential("executePlan — pinned execution on a mainnet fork", () => {
  test("deterministic pinned metadata", async ({ client }) => {
    // Anvil requires the eth_simulateV1 pin to equal node head and reports
    // block.number === the pin (no base+1 advancement like geth).
    const head = await client.getBlockNumber();
    const pinned = await client.getBlock({ blockNumber: head });
    const plan = planFor(
      [{ to: RECIPIENT, data: "0x" }],
      client.account.address,
    );

    const execution = await executePlan({
      rpcUrl: client.transport.url!,
      plan,
      blockNumber: head,
    });

    expect(execution.block.chainId).toBe(mainnet.id);
    expect(execution.block.stateBlockNumber).toBe(head);
    expect(execution.block.stateBlockHash).toBe(pinned.hash);
    expect(execution.block.blockNumber).toBeGreaterThanOrEqual(head);
    expect(execution.block.blockTimestamp).toBeGreaterThanOrEqual(
      execution.block.stateBlockTimestamp,
    );

    // Re-running at the same pin yields a deep-equal block and readings.
    const again = await executePlan({
      rpcUrl: client.transport.url!,
      plan,
      blockNumber: head,
    });
    expect(again.block).toEqual(execution.block);
    expect(again.stateReads).toEqual(execution.stateReads);

    // "latest" on the pinned fork resolves to the same pinned block.
    const latest = await executePlan({
      rpcUrl: client.transport.url!,
      plan,
      blockNumber: "latest",
    });
    expect(latest.block.stateBlockNumber).toBe(head);
  });

  test("probe readings report the owner's real native balance", async ({
    client,
  }) => {
    const balance = await client.getBalance({
      address: client.account.address,
    });
    const execution = await executePlan({
      rpcUrl: client.transport.url!,
      plan: planFor([{ to: RECIPIENT, data: "0x" }], client.account.address),
      blockNumber: await client.getBlockNumber(),
    });

    const readings = readAssets(execution);
    expect(readings).toHaveLength(3);
    for (const reading of readings) {
      expect(reading.account).toBe(client.account.address);
      expect(reading.assets).toBe(balance);
    }
  });

  test("sequential state: deposit then withdraw moves the native balance", async ({
    client,
  }) => {
    const amount = parseEther("0.5");
    const before = await client.getBalance({
      address: client.account.address,
    });

    const execution = await executePlan({
      rpcUrl: client.transport.url!,
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
      blockNumber: await client.getBlockNumber(),
    });

    const [before_, afterTx0, afterTx1, after] = readAssets(execution).map(
      (r) => r.assets,
    );
    expect(before_).toBe(before);
    // After the deposit the balance dropped by exactly `value` — validation:
    // false means no gas is charged.
    expect(afterTx0).toBe(before - amount);
    // The withdraw refunds it.
    expect(afterTx1).toBe(before);
    expect(after).toBe(before);
    expect(execution.calls).toHaveLength(6);
  });
});
