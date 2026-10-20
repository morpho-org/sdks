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
import { describe, expect, test, vi } from "vitest";
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

const startNode = async (
  reply: (method: string) => Promise<Reply>,
  {
    replyToTxpool = false,
    timeout,
  }: { replyToTxpool?: boolean; timeout?: number } = {},
) => {
  const methods: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      const { id, method } = JSON.parse(body);
      methods.push(method);
      const response =
        method === "txpool_content" && !replyToTxpool
          ? { result: { pending: {}, queued: {} } }
          : await reply(method);
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
        timeout,
      }),
      mainnet,
    ),
    close: () => server.close(),
  };
};

describe.sequential("createAnvilTestClient", () => {
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

  test("waits for the automined block before querying its receipt", async () => {
    let sent = false;
    let postSendBlockPolls = 0;

    const node = await startNode(async (method) => {
      if (method === "anvil_getAutomine") return { result: true };

      if (method === "eth_blockNumber") {
        if (!sent) return { result: numberToHex(100) };
        postSendBlockPolls += 1;
        return {
          result: numberToHex(postSendBlockPolls >= 2 ? 101 : 100),
        };
      }

      if (method === "eth_sendRawTransaction") {
        sent = true;
        return { result: hash };
      }

      if (method === "eth_getTransactionReceipt") {
        expect(postSendBlockPolls).toBeGreaterThanOrEqual(2);
        return { result: receipt };
      }

      return { result: null };
    });

    try {
      await expect(
        node.client.sendRawTransaction({ serializedTransaction: "0x01" }),
      ).resolves.toBe(hash);

      expect(node.methods).toEqual([
        "anvil_getAutomine",
        "eth_blockNumber",
        "eth_sendRawTransaction",
        "eth_blockNumber",
        "eth_blockNumber",
        "txpool_content",
        "eth_getTransactionReceipt",
      ]);
    } finally {
      node.close();
    }
  });

  test("sends without block or receipt lookups when automine is off", async () => {
    const node = await startNode(async (method) => ({
      result: method === "eth_sendRawTransaction" ? hash : false,
    }));

    try {
      await expect(
        node.client.sendRawTransaction({ serializedTransaction: "0x01" }),
      ).resolves.toBe(hash);

      expect(node.methods).toEqual([
        "anvil_getAutomine",
        "eth_sendRawTransaction",
      ]);
    } finally {
      node.close();
    }
  });

  // The post-send eth_blockNumber never answers: the 180 s deadline must still
  // fire, rather than wait for that request to settle.
  test("times out while the automined block lookup stalls", async () => {
    let sent = false;
    let release = () => {};
    const stalled = new Promise<void>((resolve) => {
      release = resolve;
    });

    const node = await startNode(
      async (method) => {
        if (method === "anvil_getAutomine") return { result: true };
        if (method === "eth_sendRawTransaction") {
          sent = true;
          return { result: hash };
        }
        if (method === "eth_blockNumber" && sent) await stalled;
        return { result: numberToHex(100) };
      },
      { timeout: 0 },
    );

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const send = node.client.sendRawTransaction({
        serializedTransaction: "0x01",
      });
      const result = expect(send).rejects.toBeInstanceOf(
        WaitForTransactionReceiptTimeoutError,
      );

      while (node.methods.length < 4)
        await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(180_000);

      await result;
      expect(node.methods).toEqual([
        "anvil_getAutomine",
        "eth_blockNumber",
        "eth_sendRawTransaction",
        "eth_blockNumber",
      ]);
    } finally {
      release();
      vi.useRealTimers();
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

  test("uses viem's wait when other options are passed", async () => {
    let receiptRequests = 0;
    const node = await startNode(async (method) => {
      if (method === "eth_blockNumber") return { result: numberToHex(101) };
      if (method === "eth_getTransactionReceipt")
        return { result: receiptRequests++ > 0 ? receipt : null };
      return { result: null };
    });
    try {
      await expect(
        node.client.waitForTransactionReceipt({
          hash,
          timeout: 3_000,
          checkReplacement: false,
        }),
      ).resolves.toMatchObject({ transactionHash: hash });
      expect(node.methods).toContain("eth_blockNumber");
    } finally {
      node.close();
    }
  });

  test.each(["pending", "queued"] as const)(
    "skips the receipt lookup while the transaction is %s",
    async (pool) => {
      let pooled = true;
      setTimeout(() => {
        pooled = false;
      }, 200);

      const node = await startNode(
        async (method) => {
          if (method === "txpool_content")
            return {
              result: {
                pending: {},
                queued: {},
                ...(pooled && { [pool]: { [zeroAddress]: { "0": { hash } } } }),
              },
            };
          if (method === "eth_getTransactionReceipt")
            return { result: receipt };
          return { result: null };
        },
        { replyToTxpool: true },
      );
      try {
        await expect(
          node.client.waitForTransactionReceipt({ hash, timeout: 3_000 }),
        ).resolves.toMatchObject({ transactionHash: hash });
        expect(node.methods.length).toBeGreaterThan(2);
        expect(
          node.methods.filter(
            (method) => method === "eth_getTransactionReceipt",
          ),
        ).toEqual(["eth_getTransactionReceipt"]);
      } finally {
        node.close();
      }
    },
  );

  test("rethrows RPC errors without polling again", async () => {
    const node = await startNode(async () => ({
      error: { code: InternalRpcError.code, message: "boom" },
    }));
    try {
      await expect(
        node.client.waitForTransactionReceipt({ hash, timeout: 3_000 }),
      ).rejects.toBeInstanceOf(InternalRpcError);
      await sleep(200);
      expect(node.methods).toEqual([
        "txpool_content",
        "eth_getTransactionReceipt",
      ]);
    } finally {
      node.close();
    }
  });
});
