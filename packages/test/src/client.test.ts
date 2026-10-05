import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type Hex,
  http,
  InternalRpcError,
  numberToHex,
  WaitForTransactionReceiptTimeoutError,
  zeroAddress,
  zeroHash,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { createAnvilTestClient } from "./client.js";

const hash: Hex = `0x${"11".repeat(32)}`;

const receipt = {
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
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Reply = { result: unknown } | { error: { code: number; message: string } };

const startNode = async (reply: (method: string) => Promise<Reply>) => {
  const methods: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      const { id, method } = JSON.parse(body);
      methods.push(method);
      const response = await reply(method);
      if (res.destroyed) return;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id, ...response }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    methods,
    client: createAnvilTestClient(
      http(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
        retryCount: 0,
      }),
      mainnet,
    ),
    close: () => server.close(),
  };
};

describe("createAnvilTestClient", () => {
  test("polls receipts faster than viem's default interval", () => {
    const client = createAnvilTestClient(http("http://127.0.0.1:0"), mainnet);

    expect(client.pollingInterval).toBe(50);
  });

  // Mines the transaction while a slow eth_getTransactionReceipt is in flight,
  // then never mines another block, like Anvil's automine on a fork.
  test("resolves a receipt mined while its fetch is in flight", async () => {
    let mined = false;
    setTimeout(() => {
      mined = true;
    }, 120);

    const node = await startNode(async (method) => {
      if (method === "eth_blockNumber")
        return { result: numberToHex(mined ? 101 : 100) };

      const minedAtRequest = mined;
      await sleep(200);
      return {
        result:
          method === "eth_getTransactionReceipt" && minedAtRequest
            ? receipt
            : null,
      };
    });
    try {
      await expect(
        node.client.waitForTransactionReceipt({ hash, timeout: 3_000 }),
      ).resolves.toMatchObject({ transactionHash: hash });
    } finally {
      node.close();
    }
  });

  test("times out when the receipt never appears", async () => {
    const node = await startNode(async () => ({ result: null }));
    try {
      await expect(
        node.client.waitForTransactionReceipt({ hash, timeout: 300 }),
      ).rejects.toBeInstanceOf(WaitForTransactionReceiptTimeoutError);
    } finally {
      node.close();
    }
  });

  test("times out while a receipt fetch hangs", async () => {
    const node = await startNode(async () => {
      await sleep(2_000);
      return { result: null };
    });
    try {
      const start = Date.now();
      await expect(
        node.client.waitForTransactionReceipt({ hash, timeout: 300 }),
      ).rejects.toBeInstanceOf(WaitForTransactionReceiptTimeoutError);
      expect(Date.now() - start).toBeLessThan(1_000);
    } finally {
      node.close();
    }
  });

  test("rethrows RPC errors without polling again", async () => {
    const node = await startNode(async () => ({
      error: { code: InternalRpcError.code, message: "boom" },
    }));
    try {
      await expect(
        node.client.waitForTransactionReceipt({ hash, timeout: 3_000 }),
      ).rejects.toBeInstanceOf(InternalRpcError);
      await sleep(200);
      expect(node.methods).toEqual(["eth_getTransactionReceipt"]);
    } finally {
      node.close();
    }
  });
});
