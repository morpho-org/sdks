import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { type Hex, http, numberToHex, zeroAddress, zeroHash } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { createAnvilTestClient } from "./client.js";

const hash: Hex = `0x${"11".repeat(32)}`;

// Mines the transaction while a slow eth_getTransactionReceipt is in flight,
// then never mines another block, like Anvil's automine on a fork.
const startSlowReceiptNode = async () => {
  let mined = false;
  setTimeout(() => {
    mined = true;
  }, 120);

  const receipt = () => ({
    transactionHash: hash,
    blockHash: zeroHash,
    blockNumber: "0x65",
    transactionIndex: "0x0",
    from: zeroAddress,
    to: zeroAddress,
    cumulativeGasUsed: "0x1",
    gasUsed: "0x1",
    effectiveGasPrice: "0x1",
    logs: [],
    logsBloom: `0x${"00".repeat(256)}`,
    status: "0x1",
    type: "0x0",
    contractAddress: null,
  });

  const result = async (method: string) => {
    if (method === "eth_blockNumber") return numberToHex(mined ? 101 : 100);

    const minedAtRequest = mined;
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (method === "eth_getTransactionReceipt")
      return minedAtRequest ? receipt() : null;
    return null;
  };

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      const { id, method } = JSON.parse(body);
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({ jsonrpc: "2.0", id, result: await result(method) }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => server.close(),
  };
};

describe("createAnvilTestClient", () => {
  test("polls receipts faster than viem's default interval", () => {
    const client = createAnvilTestClient(http("http://127.0.0.1:0"), mainnet);

    expect(client.pollingInterval).toBe(50);
  });

  test("resolves a receipt mined while its fetch is in flight", async () => {
    const node = await startSlowReceiptNode();
    try {
      const client = createAnvilTestClient(http(node.url), mainnet);

      const receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: 3_000,
      });

      expect(receipt.transactionHash).toBe(hash);
    } finally {
      node.close();
    }
  });
});
