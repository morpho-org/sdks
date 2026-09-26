import {
  type Address,
  encodeFunctionData,
  ethAddress,
  getAddress,
  parseEther,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { executePlan } from "../../../src/simulate/backends/eth-simulate-v1.js";
import { planExecution } from "../../../src/simulate/plan/plan-execution.js";
import { parseRequest } from "../../../src/simulate/request/parse-request.js";
import { makeValidated } from "../../../src/test-helpers/index.js";
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
  const request = parseRequest({
    chainId: mainnet.id,
    transactions: transactions.map((tx) => ({ ...tx, from: owner })),
  });
  return planExecution(makeValidated({ request, owner }), {
    full: [],
    permissions: [],
  });
}

describe.sequential("executePlan — pinned evidence on a mainnet fork", () => {
  test("deterministic pinned metadata", async ({ client }) => {
    // Anvil requires the eth_simulateV1 pin to equal node head and reports
    // block.number === the pin (no base+1 advancement like geth).
    const head = await client.getBlockNumber();
    const pinned = await client.getBlock({ blockNumber: head });
    const plan = planFor(
      [{ to: RECIPIENT, data: "0x" }],
      client.account.address,
    );

    const evidence = await executePlan({
      rpcUrl: client.transport.url!,
      plan,
      pinnedBlock: {
        number: head,
        hash: pinned.hash!,
        timestamp: pinned.timestamp,
      },
    });

    expect(evidence.context.chainId).toBe(mainnet.id);
    expect(evidence.context.stateBlockNumber).toBe(head);
    expect(evidence.context.stateBlockHash).toBe(pinned.hash);
    expect(evidence.context.blockNumber).toBeGreaterThanOrEqual(head);
    expect(evidence.context.blockTimestamp).toBeGreaterThanOrEqual(
      evidence.context.stateBlockTimestamp,
    );

    // Re-running at the same pin yields deep-equal context and snapshots.
    const again = await executePlan({
      rpcUrl: client.transport.url!,
      plan,
      pinnedBlock: {
        number: head,
        hash: pinned.hash!,
        timestamp: pinned.timestamp,
      },
    });
    expect(again.context).toEqual(evidence.context);
    expect(again.snapshots).toEqual(evidence.snapshots);
  });

  test("probe snapshots report the owner's real native balance", async ({
    client,
  }) => {
    const balance = await client.getBalance({
      address: client.account.address,
    });
    const head = await client.getBlock({ blockTag: "latest" });
    const evidence = await executePlan({
      rpcUrl: client.transport.url!,
      plan: planFor([{ to: RECIPIENT, data: "0x" }], client.account.address),
      pinnedBlock: {
        number: head.number!,
        hash: head.hash!,
        timestamp: head.timestamp,
      },
    });

    expect(evidence.snapshots).toHaveLength(2);
    for (const snapshot of evidence.snapshots) {
      expect(snapshot.snapshot.wallet).toEqual([
        {
          account: client.account.address,
          token: getAddress(ethAddress),
          assets: balance,
        },
      ]);
    }
  });

  test("sequential state: deposit then withdraw moves the native balance", async ({
    client,
  }) => {
    const amount = parseEther("0.5");
    const before = await client.getBalance({
      address: client.account.address,
    });

    const evidence = await executePlan({
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
      pinnedBlock: {
        number: (await client.getBlock({ blockTag: "latest" })).number!,
        hash: (await client.getBlock({ blockTag: "latest" })).hash!,
        timestamp: (await client.getBlock({ blockTag: "latest" })).timestamp,
      },
    });

    const [before_, intermediate, after] = evidence.snapshots.map(
      (s) => s.snapshot.wallet[0]!.assets,
    );
    expect(before_).toBe(before);
    // After the deposit the balance dropped by exactly `value` — validation:
    // false means no gas is charged.
    expect(intermediate).toBe(before - amount);
    // The withdraw refunds it.
    expect(after).toBe(before);
    expect(evidence.calls).toHaveLength(5);
  });
});
