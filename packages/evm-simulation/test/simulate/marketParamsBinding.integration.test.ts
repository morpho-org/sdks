import { createServer, type IncomingMessage, type Server } from "node:http";
import { MarketParams, MarketUtils } from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  maxUint256,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { SlippageCheckUnavailableError, simulate } from "../../src/index.js";

const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL ?? "https://eth.drpc.org",
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
const targetMarket = new MarketParams({
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  loanToken: USDC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});
const foreignMarket = new MarketParams({
  collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  loanToken: WETH,
  oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 945_000_000_000_000_000n,
});

test("rejects a foreign Blue market tuple during public simulation", async ({
  client,
}) => {
  expect(MarketUtils.getMarketId(foreignMarket)).not.toBe(targetMarket.id);

  const morpho = client
    .extend(morphoViemExtension({ supportSignature: false }))
    .morpho.blue(targetMarket, mainnet.id);
  const assets = parseUnits("10", 6);
  const quotedMaximum = parseUnits("1", 6);
  const action = morpho.supply({
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

  const transaction = action.buildTx();
  const targetCall = encodeFunctionData({
    abi: blueAbi,
    functionName: "idToMarketParams",
    args: [targetMarket.id],
  }).toLowerCase();
  let intercepted = false;
  const server: Server = createServer(
    async (request: IncomingMessage, response) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          id: number | string;
          method: string;
          params?: readonly unknown[];
        };
        const call = body.params?.[0] as { data?: string } | undefined;
        if (
          body.method === "eth_call" &&
          call?.data?.toLowerCase() === targetCall
        ) {
          intercepted = true;
          response.setHeader("content-type", "application/json");
          response.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              result: encodeAbiParameters(
                [
                  { type: "address" },
                  { type: "address" },
                  { type: "address" },
                  { type: "address" },
                  { type: "uint256" },
                ],
                [
                  foreignMarket.loanToken,
                  foreignMarket.collateralToken,
                  foreignMarket.oracle,
                  foreignMarket.irm,
                  foreignMarket.lltv,
                ],
              ),
            }),
          );
          return;
        }

        const forwarded = await fetch(client.transport.url!, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        response.statusCode = forwarded.status;
        response.setHeader(
          "content-type",
          forwarded.headers.get("content-type") ?? "application/json",
        );
        response.end(await forwarded.text());
      } catch (error) {
        response.statusCode = 500;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ error: String(error) }));
      }
    },
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("RPC proxy did not bind");
  const proxyUrl = `http://127.0.0.1:${address.port}`;

  try {
    await expect(
      simulate(
        {
          timeoutMs: 30_000,
          chains: new Map([[mainnet.id, { simulateV1Url: proxyUrl }]]),
        },
        {
          chainId: mainnet.id,
          limits: {
            operations: [
              {
                type: "blueSupply",
                marketId: targetMarket.id,
                quote: { assetsPaid: quotedMaximum, sharesMinted: 1n },
                slippageTolerance: 0n,
              },
            ],
          },
          transactions: [
            {
              from: client.account.address,
              to: transaction.to,
              data: transaction.data,
              value: transaction.value,
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(SlippageCheckUnavailableError);
    expect(intercepted).toBe(true);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}, 60_000);
