import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";
import { RpcTransportError } from "../../src/index.js";
import { executePlan } from "../../src/simulate/backends/eth-simulate-v1.js";
import { planExecution } from "../../src/simulate/plan/plan-execution.js";
import { parseRequest } from "../../src/simulate/request/index.js";
import {
  simulateOrThrow,
  simulationClientFor,
} from "../../src/test-helpers/index.js";

const test = createViemTest(mainnet, {
  forkUrl:
    process.env.MAINNET_RPC_URL ??
    getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 25_832_676n,
  chainId: mainnet.id,
});

function recordRequests(url: string) {
  const requests: { method: string; params: unknown[] }[] = [];
  const client = simulationClientFor(url, mainnet, 30_000, (input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return fetch(input, init);
  });
  return { client, requests };
}

function forkUrl(url: string | undefined): string {
  if (url === undefined)
    throw new Error("Anvil fork transport must have a URL");
  return url;
}

test("error: an orphaned pin fails closed after replacement at the same height", async ({
  client,
}) => {
  const snapshot = await client.snapshot();
  await client.mine({ blocks: 1 });
  const pinned = await client.getBlock({ blockTag: "latest" });
  const params = {
    limits: "none" as const,
    block: {
      number: pinned.number,
      hash: pinned.hash,
      timestamp: pinned.timestamp,
    },
    transactions: [
      {
        from: client.account.address,
        to: "0x0000000000000000000000000000000000000002" as const,
        value: 0n,
        data: "0x" as const,
      },
    ],
  };
  const { client: simulationClient, requests } = recordRequests(
    forkUrl(client.transport.url),
  );
  await expect(
    simulateOrThrow(simulationClient, params, { parentHashCheck: false }),
  ).resolves.toBeDefined();

  await client.revert({ id: snapshot });
  await client.setNextBlockTimestamp({ timestamp: pinned.timestamp + 1n });
  await client.mine({ blocks: 1 });
  const replacement = await client.getBlock({ blockTag: "latest" });
  expect(replacement.number).toBe(pinned.number);
  expect(replacement.hash).not.toBe(pinned.hash);

  requests.length = 0;
  await expect(
    simulateOrThrow(simulationClient, params, { parentHashCheck: false }),
  ).rejects.toBeInstanceOf(RpcTransportError);
  expect(requests).toEqual([
    expect.objectContaining({
      method: "eth_getBlockByHash",
      params: [pinned.hash, false],
    }),
  ]);
});

test("error: the simulation boundary rejects an orphan hash without a supplied-pin lookup", async ({
  client,
}) => {
  const snapshot = await client.snapshot();
  await client.mine({ blocks: 1 });
  const pinned = await client.getBlock({ blockTag: "latest" });
  const request = parseRequest(
    {
      limits: "none",
      transactions: [
        {
          from: client.account.address,
          to: "0x0000000000000000000000000000000000000002",
          data: "0x",
          value: 0n,
        },
      ],
    },
    mainnet.id,
  );
  const plan = planExecution({
    request,
    owner: client.account.address,
    preparations: [],
    reads: [],
  });
  const { client: simulationClient, requests } = recordRequests(
    forkUrl(client.transport.url),
  );
  const params = {
    client: simulationClient,
    plan,
    stateBlock: {
      number: pinned.number,
      hash: pinned.hash,
      timestamp: pinned.timestamp,
    },
    validation: false,
    parentHashCheck: false,
  };
  await expect(executePlan(params)).resolves.toBeDefined();

  await client.revert({ id: snapshot });
  await client.setNextBlockTimestamp({ timestamp: pinned.timestamp + 1n });
  await client.mine({ blocks: 1 });
  const replacement = await client.getBlock({ blockTag: "latest" });
  expect(replacement.number).toBe(pinned.number);
  expect(replacement.hash).not.toBe(pinned.hash);

  requests.length = 0;
  await expect(executePlan(params)).rejects.toBeInstanceOf(RpcTransportError);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.method).toBe("eth_simulateV1");
  expect(requests[0]?.params[1]).toEqual({
    blockHash: pinned.hash,
    requireCanonical: true,
  });
});
