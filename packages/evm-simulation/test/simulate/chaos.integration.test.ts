import { MarketParams } from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import {
  createFaultProxy,
  expectFailClosed,
  type FaultProxy,
  type FaultRule,
  fault,
} from "@morpho-org/test/chaos";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  parseEther,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import {
  InvalidSimulationResponseError,
  RpcTransportError,
  type SimulateParams,
  SimulationRevertedError,
  SlippageCheckUnavailableError,
  simulate,
} from "../../src/index.js";

const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 25_832_676n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const CbbtcUsdcBlue = new MarketParams({
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  loanToken: USDC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});
/** Token whose every call reverts, so a quoted balance read of it fails. */
const REVERTING_TOKEN: Address = "0x00000000000000000000000000000000000c4A05";
const SIMULATE = "eth_simulateV1";

const configFor = (url: string) => ({
  chains: new Map([[mainnet.id, { simulateV1Url: url }]]),
  timeoutMs: 30_000,
});

/**
 * Reads, requirements and construction run against the healthy fork; only
 * the returned simulate parameters are sent through the fault proxy.
 */
async function buildFundedSupply(client: AnvilTestClient<typeof mainnet>) {
  const assets = parseUnits("10", 6);
  const action = client
    .extend(morphoViemExtension({ supportSignature: false }))
    .morpho.blue(CbbtcUsdcBlue, mainnet.id)
    .supply({
      userAddress: client.account.address,
      assets,
      deadline: maxUint256,
    });
  for (const requirement of await action.getRequirements()) {
    if (!("to" in requirement)) continue;
    await client.sendTransaction({
      account: client.account,
      to: requirement.to,
      data: requirement.data,
      value: requirement.value,
    });
  }
  await client.deal({ erc20: USDC, amount: assets });
  const tx = action.buildTx();
  const params = {
    chainId: mainnet.id,
    limits: "none",
    transactions: [
      {
        from: client.account.address,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      },
    ],
  } satisfies SimulateParams;
  return { assets, tx, before: structuredClone(tx), params };
}

const calls = (proxy: FaultProxy, method = SIMULATE) =>
  proxy.log.filter((entry) => entry.method === method);

async function withProxy(
  {
    client,
    faults = [],
  }: {
    client: AnvilTestClient<typeof mainnet>;
    faults?: readonly FaultRule[];
  },
  run: (proxy: FaultProxy) => Promise<void>,
) {
  const proxy = await createFaultProxy({
    upstream: client.transport.url!,
    faults,
  });
  try {
    await run(proxy);
  } finally {
    await proxy.kill();
  }
}

describe.sequential("chaos: S9 RPC dies between construction and simulation", () => {
  test("baseline: the healthy proxy forwards one eth_simulateV1", async ({
    client,
  }) => {
    const { params } = await buildFundedSupply(client);
    await withProxy({ client }, async (proxy) => {
      const result = await simulate(configFor(proxy.url), params);
      expect(result.simulationTxs).toHaveLength(1);
      expect(calls(proxy).map((entry) => entry.outcome)).toEqual(["forwarded"]);
    });
  }, 60_000);

  test("error: endpoint dead before simulate → RpcTransportError, no eth_simulateV1", async ({
    client,
  }) => {
    const { tx, before, params } = await buildFundedSupply(client);
    await withProxy({ client }, async (proxy) => {
      await proxy.kill();
      const error = await expectFailClosed(
        simulate(configFor(proxy.url), params),
        "infra",
      );
      expect(error).toBeInstanceOf(RpcTransportError);
      expect(error).not.toBeInstanceOf(SimulationRevertedError);
      expect(proxy.log).toEqual([]);
    });
    expect(Object.isFrozen(tx)).toBe(true);
    expect(tx).toEqual(before);
  }, 60_000);

  test.for([
    { name: "refused", rule: fault.refuse() },
    { name: "answered 503", rule: fault.status(503) },
    { name: "dropped after forwarding", rule: fault.forwardThenDrop() },
  ])(
    "error: pinned block resolves, eth_simulateV1 $name → RpcTransportError (transport), one attempt",
    async ({ name: _, rule }, { client }) => {
      const { tx, before, params } = await buildFundedSupply(client);
      await withProxy(
        { client, faults: [{ method: SIMULATE, fault: rule }] },
        async (proxy) => {
          const error = await expectFailClosed(
            simulate(configFor(proxy.url), params),
            "infra",
          );
          expect(error).toBeInstanceOf(RpcTransportError);
          expect(
            calls(proxy, "eth_getBlockByNumber").map((e) => e.outcome),
          ).toEqual(["forwarded"]);
          expect(calls(proxy).map((e) => e.outcome)).toEqual([rule.kind]);
          // After the failed eth_simulateV1, only the served-chain probe runs.
          const failedAt = proxy.log.findIndex((e) => e.method === SIMULATE);
          expect(
            proxy.log.slice(failedAt + 1).map((e) => [e.method, e.outcome]),
          ).toEqual([["eth_chainId", "forwarded"]]);
        },
      );
      expect(Object.isFrozen(tx)).toBe(true);
      expect(tx).toEqual(before);
    },
  );

  test("error: eth_simulateV1 succeeds, a planned state read fails → SlippageCheckUnavailableError", async ({
    client,
  }) => {
    const { assets, tx, before, params } = await buildFundedSupply(client);
    await client.setCode({
      address: REVERTING_TOKEN,
      bytecode: "0x60006000fd",
    });
    await withProxy({ client }, async (proxy) => {
      const error = await expectFailClosed(
        simulate(configFor(proxy.url), {
          ...params,
          limits: {
            operations: [
              {
                type: "blueSupply",
                marketId: CbbtcUsdcBlue.id,
                assetPaid: REVERTING_TOKEN,
                slippageTolerance: 0n,
                quote: { assetsPaid: assets, sharesMinted: 1n },
              },
            ],
          },
        }),
        "integrity",
      );
      expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
      expect(error).not.toBeInstanceOf(RpcTransportError);
      expect(calls(proxy).map((e) => e.outcome)).toEqual(["forwarded"]);
    });
    expect(Object.isFrozen(tx)).toBe(true);
    expect(tx).toEqual(before);
  }, 60_000);
});

describe.sequential("chaos: S3 malformed RPC responses", () => {
  // Block-structure and per-call defects are covered at the transport boundary
  // by parse-response.test.ts; these pin how malformed bodies reach callers.
  test.for([
    {
      method: SIMULATE,
      name: "non-JSON 200 body",
      body: "<html>bad gateway</html>",
    },
    {
      method: SIMULATE,
      name: "neither result nor error",
      body: '{"jsonrpc":"2.0","id":1}',
    },
    {
      method: SIMULATE,
      name: "result: null",
      body: '{"jsonrpc":"2.0","id":1,"result":null}',
    },
    {
      method: SIMULATE,
      name: "wrong-typed result",
      body: '{"jsonrpc":"2.0","id":1,"result":42}',
    },
    {
      method: SIMULATE,
      name: "batch-shaped reply",
      body: '[{"jsonrpc":"2.0","id":1,"result":[]}]',
    },
    {
      method: "eth_getBlockByNumber",
      name: "non-JSON 200 body",
      body: "<html>bad gateway</html>",
    },
    {
      method: SIMULATE,
      name: "truncated mid-JSON",
      body: '{"jsonrpc":"2.0","id":1,"result":[{"number":"0x',
    },
  ])(
    "error: $method $name → InvalidSimulationResponseError, never bypassable",
    async ({ method, body }, { client }) => {
      const { tx, before, params } = await buildFundedSupply(client);
      await withProxy(
        { client, faults: [{ method, fault: fault.rawBody(body) }] },
        async (proxy) => {
          const error = await expectFailClosed(
            simulate(configFor(proxy.url), params),
            "integrity",
          );
          expect(error).toBeInstanceOf(InvalidSimulationResponseError);
          expect(error).not.toBeInstanceOf(RpcTransportError);
          if (method !== SIMULATE) expect(calls(proxy)).toEqual([]);
          else {
            // One attempt, and nothing runs after the integrity failure.
            expect(calls(proxy).map((e) => e.outcome)).toEqual(["rawBody"]);
            expect(proxy.log.at(-1)?.method).toBe(SIMULATE);
          }
        },
      );
      expect(Object.isFrozen(tx)).toBe(true);
      expect(tx).toEqual(before);
    },
  );

  test("behavior: a missing block result stays an RpcTransportError", async ({
    client,
  }) => {
    // viem reads an absent `result` as a null block, which a lagging node also
    // returns; it is an outage, not a malformed answer (THREAT_MODEL.md).
    const { params } = await buildFundedSupply(client);
    await withProxy(
      {
        client,
        faults: [
          {
            method: "eth_getBlockByNumber",
            fault: fault.rawBody('{"jsonrpc":"2.0","id":1}'),
          },
        ],
      },
      async (proxy) => {
        const error = await expectFailClosed(
          simulate(configFor(proxy.url), params),
          "infra",
        );
        expect(error).toBeInstanceOf(RpcTransportError);
        expect(error).not.toBeInstanceOf(InvalidSimulationResponseError);
        expect(calls(proxy)).toEqual([]);
      },
    );
  }, 60_000);
});

describe.sequential("chaos: S4 simulation revert with a healthy RPC", () => {
  const expectRevert = async (
    promise: Promise<unknown>,
    expectedMessage: RegExp = /reverted: /,
  ) => {
    const error = await expectFailClosed(promise, "revert");
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).not.toBeInstanceOf(RpcTransportError);
    const reverted = error as SimulationRevertedError;
    expect(reverted.message).toMatch(expectedMessage);
  };

  test("error: unfunded Blue supply reverts on the token pull", async ({
    client,
  }) => {
    const { params } = await buildFundedSupply(client);
    await client.deal({ erc20: USDC, amount: 0n });
    await withProxy({ client }, async (proxy) => {
      await expectRevert(
        simulate(configFor(proxy.url), params),
        /ERC20InsufficientBalance|transfer amount exceeds balance/,
      );
      expect(calls(proxy).map((e) => e.outcome)).toEqual(["forwarded"]);
    });
  }, 60_000);

  test("error: WETH withdraw above balance reverts in the token contract", async ({
    client,
  }) => {
    await withProxy({ client }, async (proxy) => {
      await expectRevert(
        simulate(configFor(proxy.url), {
          chainId: mainnet.id,
          limits: "none",
          transactions: [
            {
              from: client.account.address,
              to: WETH,
              data: encodeFunctionData({
                abi: [
                  {
                    type: "function",
                    name: "withdraw",
                    stateMutability: "nonpayable",
                    inputs: [{ name: "wad", type: "uint256" }],
                    outputs: [],
                  },
                ],
                functionName: "withdraw",
                args: [parseEther("1")],
              }),
            },
          ],
        }),
      );
      expect(calls(proxy).map((e) => e.outcome)).toEqual(["forwarded"]);
    });
  }, 60_000);

  test("error: ERC-20 transfer above balance reverts", async ({ client }) => {
    await client.deal({ erc20: USDC, amount: 0n });
    await withProxy({ client }, async (proxy) => {
      await expectRevert(
        simulate(configFor(proxy.url), {
          chainId: mainnet.id,
          limits: "none",
          transactions: [
            {
              from: client.account.address,
              to: USDC,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "transfer",
                args: [WETH, 1n],
              }),
            },
          ],
        }),
        /ERC20InsufficientBalance|transfer amount exceeds balance/,
      );
      expect(calls(proxy).map((e) => e.outcome)).toEqual(["forwarded"]);
    });
  }, 60_000);
});
