import { AssertionError } from "node:assert";
import { createServer, request as nodeRequest } from "node:http";
import type { AddressInfo, Server } from "node:net";
import {
  ContractFunctionRevertedError,
  createPublicClient,
  ExecutionRevertedError,
  HttpRequestError,
  http,
  InternalRpcError,
  RpcError,
  RpcRequestError,
} from "viem";
import { mainnet } from "viem/chains";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  classifyError,
  createFaultProxy,
  expectFailClosed,
  type FaultProxy,
  FaultProxyInternalError,
  fault,
} from "./chaos.js";

let upstream: Server;
let upstreamUrl: string;
let upstreamMethods: string[];
let upstreamStatus: number;
let upstreamResponseBody: string | undefined;
let upstreamContentType: string;
let upstreamResponseGate: Promise<void> | undefined;
let onUpstreamRequestReceived: (() => void) | undefined;
let onUpstreamSocketClosed: (() => void) | undefined;
let proxy: FaultProxy | undefined;

const sendRaw = (
  body: string,
): Promise<{ readonly status: number; readonly body: string }> =>
  new Promise((resolve, reject) => {
    const request = nodeRequest(
      proxy!.url,
      {
        method: "POST",
        headers: {
          connection: "close",
          "content-type": "application/json",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end(body);
  });

const closeUpstream = (): Promise<void> =>
  new Promise((resolve) => {
    upstream.close(() => resolve());
    upstream.closeAllConnections();
  });

describe.sequential("createFaultProxy", () => {
  beforeEach(async () => {
    upstreamMethods = [];
    upstreamStatus = 200;
    upstreamResponseBody = undefined;
    upstreamContentType = "application/json";
    upstreamResponseGate = undefined;
    onUpstreamRequestReceived = undefined;
    onUpstreamSocketClosed = undefined;
    upstream = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      request.on("end", () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
          response.writeHead(200, {
            connection: "close",
            "content-type": "text/plain",
          });
          response.end("forwarded");
          return;
        }
        const calls = (Array.isArray(parsed)
          ? parsed
          : [parsed]) as unknown as {
          readonly id: unknown;
          readonly method?: string;
        }[];
        upstreamMethods.push(
          ...calls.flatMap((call) =>
            typeof call.method === "string" ? [call.method] : [],
          ),
        );
        const replies = calls.map((call) => ({
          jsonrpc: "2.0",
          id: call.id,
          result:
            call.method === "eth_chainId"
              ? "0x1"
              : call.method === "eth_blockNumber"
                ? "0x10"
                : call.method === "eth_call"
                  ? "0x"
                  : null,
        }));
        const respond = (): void => {
          if (response.destroyed) return;
          response.writeHead(upstreamStatus, {
            connection: "close",
            "content-type": upstreamContentType,
          });
          response.end(
            upstreamResponseBody ??
              JSON.stringify(Array.isArray(parsed) ? replies : replies[0]),
          );
        };
        if (upstreamResponseGate !== undefined) {
          request.socket.once("close", () => onUpstreamSocketClosed?.());
          onUpstreamRequestReceived?.();
          void upstreamResponseGate.then(respond);
          return;
        }
        respond();
      });
    });
    await new Promise<void>((resolve, reject) => {
      upstream.once("error", reject);
      upstream.listen(0, "127.0.0.1", resolve);
    });
    const address = upstream.address() as AddressInfo;
    upstreamUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await proxy?.kill();
    await closeUpstream();
    proxy = undefined;
  });
  test("default", async () => {
    proxy = await createFaultProxy({ upstream: upstreamUrl });
    const client = createPublicClient({
      chain: mainnet,
      transport: http(proxy.url, { retryCount: 0 }),
    });

    expect(await client.getChainId()).toBe(1);
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "forwarded" },
    ]);
    expect(upstreamMethods).toEqual(["eth_chainId"]);
  });

  test("error: rejects non-HTTP upstream URLs", async () => {
    await expect(
      createFaultProxy({ upstream: "ws://127.0.0.1:1" }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  test("behavior: binds to an explicit port", async () => {
    const reservation = createServer();
    await new Promise<void>((resolve, reject) => {
      reservation.once("error", reject);
      reservation.listen(0, "127.0.0.1", resolve);
    });
    const port = (reservation.address() as AddressInfo).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));

    proxy = await createFaultProxy({ upstream: upstreamUrl, port });

    expect(proxy.url.endsWith(`:${port}`)).toBe(true);
  });

  test("error: fault.status rejects invalid HTTP status codes", () => {
    expect(() => fault.status(42)).toThrow(RangeError);
    expect(() => fault.status(1000)).toThrow(RangeError);
    expect(() => fault.status(100.5)).toThrow(RangeError);
  });

  test("behavior: refuse destroys the connection as an infrastructure failure", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [{ method: "eth_chainId", fault: fault.refuse() }],
    });
    const client = createPublicClient({
      chain: mainnet,
      transport: http(proxy.url, { retryCount: 0 }),
    });
    const error = await client.getChainId().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpRequestError);
    expect(classifyError(error)).toBe("infra");
    expect(proxy.log).toEqual([{ method: "eth_chainId", outcome: "refuse" }]);
    expect(upstreamMethods).toEqual([]);
  });

  test("behavior: HTTP status faults preserve status and classify as infrastructure", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [{ method: "eth_blockNumber", fault: fault.status(429) }],
    });
    const client = createPublicClient({
      chain: mainnet,
      transport: http(proxy.url, { retryCount: 0 }),
    });
    const error = await client
      .getBlockNumber()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error).toMatchObject({ status: 429 });
    expect(classifyError(error)).toBe("infra");
    expect(proxy.log).toEqual([
      { method: "eth_blockNumber", outcome: "status" },
    ]);
  });

  test("behavior: HTTP errors with raw HTML retain their status", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        { method: "eth_blockNumber", fault: fault.status(503, "<html>") },
      ],
    });
    const client = createPublicClient({
      chain: mainnet,
      transport: http(proxy.url, { retryCount: 0 }),
    });
    const error = await client
      .getBlockNumber()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error).toMatchObject({ status: 503 });
    expect(classifyError(error)).toBe("infra");
    expect(proxy.log).toEqual([
      { method: "eth_blockNumber", outcome: "status" },
    ]);
  });

  test("behavior: HTTP 429 with a JSON-RPC limit error is classified as infrastructure", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        {
          method: "eth_blockNumber",
          fault: fault.status(
            429,
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              error: { code: -32005, message: "rate limited" },
            }),
          ),
        },
      ],
    });
    const client = createPublicClient({
      chain: mainnet,
      transport: http(proxy.url, { retryCount: 0 }),
    });
    const error = await client
      .getBlockNumber()
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ name: "LimitExceededRpcError" });
    expect(classifyError(error)).toBe("infra");
    expect(proxy.log).toEqual([
      { method: "eth_blockNumber", outcome: "status" },
    ]);
  });

  test("behavior: malformed JSON response is an integrity failure", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [{ method: "eth_chainId", fault: fault.rawBody("not json") }],
    });
    const client = createPublicClient({
      chain: mainnet,
      transport: http(proxy.url, { retryCount: 0 }),
    });
    const error = await client.getChainId().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpRequestError);
    expect(classifyError(error)).toBe("integrity");
    expect(proxy.log).toEqual([{ method: "eth_chainId", outcome: "rawBody" }]);
  });

  test("behavior: JSON-RPC limit error is an infrastructure failure", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        {
          method: "eth_blockNumber",
          fault: fault.rpcError(-32005, "rate limited"),
        },
      ],
    });
    const client = createPublicClient({
      chain: mainnet,
      transport: http(proxy.url, { retryCount: 0 }),
    });
    const error = await client
      .getBlockNumber()
      .catch((caught: unknown) => caught);

    expect(classifyError(error)).toBe("infra");
    expect(proxy.log).toEqual([
      { method: "eth_blockNumber", outcome: "rpcError" },
    ]);
    expect(upstreamMethods).toEqual([]);
  });

  test("behavior: JSON-RPC execution-revert error remains a revert", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        {
          method: "eth_call",
          fault: fault.rpcError(3, "execution reverted"),
        },
      ],
    });
    const client = createPublicClient({
      chain: mainnet,
      transport: http(proxy.url, { retryCount: 0 }),
    });
    const error = await client
      .call({ to: "0x0000000000000000000000000000000000000001" })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ name: "CallExecutionError" });
    expect(classifyError(error)).toBe("revert");
    await expect(
      expectFailClosed(Promise.reject(error), "revert"),
    ).resolves.toBe(error);
    expect(proxy.log).toEqual([{ method: "eth_call", outcome: "rpcError" }]);
    expect(upstreamMethods).toEqual([]);
  });

  test("behavior: forwardThenDrop receives upstream response before dropping the client", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [{ method: "eth_blockNumber", fault: fault.forwardThenDrop() }],
    });
    const client = createPublicClient({
      chain: mainnet,
      transport: http(proxy.url, { retryCount: 0 }),
    });
    const error = await client
      .getBlockNumber()
      .catch((caught: unknown) => caught);

    expect(classifyError(error)).toBe("infra");
    expect(upstreamMethods).toEqual(["eth_blockNumber"]);
    expect(proxy.log).toEqual([
      { method: "eth_blockNumber", outcome: "forwardThenDrop" },
    ]);
  });

  test("behavior: forwardThenDrop reports a closed upstream as 502", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [{ method: "eth_blockNumber", fault: fault.forwardThenDrop() }],
    });
    await closeUpstream();
    const response = await sendRaw(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber" }),
    );

    expect(response.status).toBe(502);
    expect(response.body).toContain("ECONNREFUSED");
    expect(proxy.log).toEqual([
      { method: "eth_blockNumber", outcome: "upstreamError" },
    ]);
  });

  test("behavior: nth matches a number, an array, and omitted indexes", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [{ method: "eth_blockNumber", nth: 1, fault: fault.status(503) }],
    });
    let client = createPublicClient({
      chain: mainnet,
      cacheTime: 0,
      transport: http(proxy.url, { retryCount: 0 }),
    });

    expect(await client.getBlockNumber()).toBe(16n);
    await expect(client.getBlockNumber()).rejects.toMatchObject({
      status: 503,
    });
    expect(await client.getBlockNumber()).toBe(16n);
    proxy.setFaults([
      { method: "eth_blockNumber", nth: [0, 2], fault: fault.status(429) },
    ]);
    await expect(client.getBlockNumber()).rejects.toMatchObject({
      status: 429,
    });
    expect(await client.getBlockNumber()).toBe(16n);
    await expect(client.getBlockNumber()).rejects.toMatchObject({
      status: 429,
    });
    proxy.setFaults([{ method: "eth_blockNumber", fault: fault.status(503) }]);
    client = createPublicClient({
      chain: mainnet,
      transport: http(proxy.url, { retryCount: 0 }),
    });
    await expect(client.getBlockNumber()).rejects.toMatchObject({
      status: 503,
    });
    await expect(client.getBlockNumber()).rejects.toMatchObject({
      status: 503,
    });
    expect(proxy.log).toEqual([
      { method: "eth_blockNumber", outcome: "forwarded" },
      { method: "eth_blockNumber", outcome: "status" },
      { method: "eth_blockNumber", outcome: "forwarded" },
      { method: "eth_blockNumber", outcome: "status" },
      { method: "eth_blockNumber", outcome: "forwarded" },
      { method: "eth_blockNumber", outcome: "status" },
      { method: "eth_blockNumber", outcome: "status" },
      { method: "eth_blockNumber", outcome: "status" },
    ]);
    expect(upstreamMethods).toEqual([
      "eth_blockNumber",
      "eth_blockNumber",
      "eth_blockNumber",
    ]);
  });

  test("behavior: first matching rule wins", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        { method: "eth_chainId", fault: fault.status(429) },
        { method: "eth_chainId", fault: fault.status(503) },
      ],
    });
    const client = createPublicClient({
      chain: mainnet,
      transport: http(proxy.url, { retryCount: 0 }),
    });
    const error = await client.getChainId().catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 429 });
    expect(proxy.log).toEqual([{ method: "eth_chainId", outcome: "status" }]);
  });

  test("behavior: match selects the same concurrent call regardless of arrival order", async () => {
    proxy = await createFaultProxy({ upstream: upstreamUrl });
    const client = createPublicClient({
      chain: mainnet,
      cacheTime: 0,
      transport: http(proxy.url, { retryCount: 0 }),
    });
    const targetTo = "0x0000000000000000000000000000000000000002";
    const otherTo = "0x0000000000000000000000000000000000000001";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      proxy.setFaults([
        {
          method: "eth_call",
          match: ({ params }) => {
            const [transaction] = Array.isArray(params) ? params : [];
            return (
              transaction !== null &&
              typeof transaction === "object" &&
              !Array.isArray(transaction) &&
              "to" in transaction &&
              transaction.to === targetTo
            );
          },
          fault: fault.rpcError(-32000, "targeted call"),
        },
      ]);
      const requestOrder =
        attempt % 2 === 0
          ? ([otherTo, targetTo] as const)
          : ([targetTo, otherTo] as const);
      const results = await Promise.all(
        requestOrder.map((to) =>
          client.call({ to }).then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
        ),
      );

      expect(results[requestOrder.indexOf(targetTo)]?.ok).toBe(false);
      expect(results[requestOrder.indexOf(otherTo)]?.ok).toBe(true);
      expect(
        proxy.log.slice(-2).filter((entry) => entry.outcome === "rpcError"),
      ).toHaveLength(1);
      expect(
        proxy.log.slice(-2).filter((entry) => entry.outcome === "forwarded"),
      ).toHaveLength(1);
    }
  });

  test("behavior: one RPC error in a batch forwards the other calls and restores order", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        { method: "eth_chainId", fault: fault.rpcError(-32005, "limited") },
      ],
    });
    const response = await sendRaw(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_blockNumber" },
        { jsonrpc: "2.0", id: 2, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 3, method: "eth_getBalance" },
      ]),
    );
    const replies = JSON.parse(response.body) as {
      readonly id: number;
      readonly result?: string | null;
      readonly error?: { readonly code: number };
    }[];

    expect(response.status).toBe(200);
    expect(replies.map((reply) => reply.id)).toEqual([1, 2, 3]);
    expect(replies.map((reply) => reply.error?.code ?? reply.result)).toEqual([
      "0x10",
      -32005,
      null,
    ]);
    expect(upstreamMethods).toEqual(["eth_blockNumber", "eth_getBalance"]);
    expect(proxy.log).toEqual([
      { method: "eth_blockNumber", outcome: "forwarded" },
      { method: "eth_chainId", outcome: "rpcError" },
      { method: "eth_getBalance", outcome: "forwarded" },
    ]);
  });

  test("behavior: all-rpcError batches skip upstream and single errors stay objects", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        {
          method: "eth_chainId",
          fault: fault.rpcError(-32001, "first", { retry: false }),
        },
        { method: "eth_blockNumber", fault: fault.rpcError(-32002, "second") },
      ],
    });
    const batch = await sendRaw(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
      ]),
    );
    const batchReplies = JSON.parse(batch.body) as {
      readonly id: number;
      readonly error?: {
        readonly code: number;
        readonly message: string;
        readonly data?: unknown;
      };
    }[];
    const single = await sendRaw(
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "eth_chainId" }),
    );
    const singleReply = JSON.parse(single.body) as {
      readonly id: number;
      readonly error?: {
        readonly code: number;
        readonly message: string;
        readonly data?: unknown;
      };
    };

    expect(batch.status).toBe(200);
    expect(batchReplies.map((reply) => reply.id)).toEqual([1, 2]);
    expect(batchReplies.map((reply) => reply.error?.code)).toEqual([
      -32001, -32002,
    ]);
    expect(batchReplies[0]?.error).toEqual({
      code: -32001,
      message: "first",
      data: { retry: false },
    });
    expect(batchReplies[1]?.error).not.toHaveProperty("data");
    expect(Array.isArray(singleReply)).toBe(false);
    expect(singleReply).toMatchObject({
      id: 3,
      error: { code: -32001, data: { retry: false } },
    });
    expect(upstreamMethods).toEqual([]);
  });

  test("behavior: mixed batch logs RPC and upstream errors in request order", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        { method: "eth_chainId", fault: fault.rpcError(-32005, "limited") },
      ],
    });
    await closeUpstream();
    const response = await sendRaw(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
      ]),
    );

    expect(response.status).toBe(502);
    expect(response.body).toContain("ECONNREFUSED");
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "rpcError" },
      { method: "eth_blockNumber", outcome: "upstreamError" },
    ]);
  });

  test("behavior: mixed batch preserves duplicate ids around RPC faults", async () => {
    upstreamResponseBody = JSON.stringify([
      { jsonrpc: "2.0", id: 1, result: "0x1" },
      { jsonrpc: "2.0", id: 1, result: "0x2" },
    ]);
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        { method: "eth_chainId", fault: fault.rpcError(-32005, "limited") },
      ],
    });
    const response = await sendRaw(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_blockNumber" },
        { jsonrpc: "2.0", id: 2, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 1, method: "eth_getBalance" },
      ]),
    );
    const replies = JSON.parse(response.body) as {
      readonly id: number;
      readonly error?: { readonly code: number };
      readonly result?: string;
    }[];

    expect(response.status).toBe(200);
    expect(replies.map((reply) => reply.id)).toEqual([1, 2, 1]);
    expect(replies[0]?.result).toBe("0x1");
    expect(replies[1]?.error?.code).toBe(-32005);
    expect(replies[2]?.result).toBe("0x2");
    expect(proxy.log).toEqual([
      { method: "eth_blockNumber", outcome: "forwarded" },
      { method: "eth_chainId", outcome: "rpcError" },
      { method: "eth_getBalance", outcome: "forwarded" },
    ]);
  });

  test("behavior: request-wide batch faults override RPC errors in the log", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        { method: "eth_chainId", fault: fault.rpcError(-32005, "limited") },
        { method: "eth_blockNumber", fault: fault.status(503) },
      ],
    });
    const response = await sendRaw(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
      ]),
    );

    expect(response.status).toBe(503);
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "status" },
      { method: "eth_blockNumber", outcome: "status" },
    ]);
  });

  test("behavior: mixed batch preserves an upstream HTTP error status", async () => {
    upstreamStatus = 503;
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        { method: "eth_chainId", fault: fault.rpcError(-32005, "limited") },
      ],
    });
    const response = await sendRaw(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
      ]),
    );
    const replies = JSON.parse(response.body) as {
      readonly id: number;
      readonly error?: { readonly code: number };
      readonly result?: string;
    }[];

    expect(response.status).toBe(503);
    expect(replies.map((reply) => reply.id)).toEqual([1, 2]);
    expect(replies[0]?.error?.code).toBe(-32005);
    expect(replies[1]?.result).toBe("0x10");
    expect(upstreamMethods).toEqual(["eth_blockNumber"]);
  });

  test("behavior: mixed batch merges a single-object upstream reply", async () => {
    upstreamStatus = 503;
    upstreamResponseBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      result: "0x10",
    });
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        { method: "eth_chainId", fault: fault.rpcError(-32005, "limited") },
      ],
    });
    const response = await sendRaw(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
      ]),
    );
    const replies = JSON.parse(response.body) as {
      readonly id: number;
      readonly error?: { readonly code: number };
      readonly result?: string;
    }[];

    expect(response.status).toBe(503);
    expect(replies.map((reply) => reply.id)).toEqual([1, 2]);
    expect(replies[0]?.error?.code).toBe(-32005);
    expect(replies[1]?.result).toBe("0x10");
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "rpcError" },
      { method: "eth_blockNumber", outcome: "forwarded" },
    ]);
  });

  test("behavior: mixed batch rejects an unmergeable upstream body", async () => {
    upstreamStatus = 503;
    upstreamContentType = "text/html";
    upstreamResponseBody = "<html>Service Unavailable</html>";
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        { method: "eth_chainId", fault: fault.rpcError(-32005, "limited") },
      ],
    });
    const response = await sendRaw(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
      ]),
    );

    expect(response).toEqual({
      status: 502,
      body: "Upstream request failed: Upstream response was not a mergeable JSON-RPC reply",
    });
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "rpcError" },
      { method: "eth_blockNumber", outcome: "upstreamError" },
    ]);
  });

  test("error: unrelated handler failure is retained for teardown", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        {
          method: "eth_chainId",
          match: () => {
            throw new Error("match failed");
          },
          fault: fault.rpcError(-32000, "internal"),
        },
      ],
    });
    const response = await sendRaw(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId" }),
    );

    expect(response).toEqual({
      status: 500,
      body: "Fault proxy internal error: match failed",
    });
    expect(proxy.errors.map((error) => error.message)).toEqual([
      "match failed",
    ]);
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "internalError" },
    ]);
    const teardown = proxy.kill();
    await expect(teardown).rejects.toThrow(
      "Fault proxy encountered internal errors",
    );
    await expect(teardown).rejects.toBeInstanceOf(FaultProxyInternalError);
    proxy = undefined;
  });

  test("error: BigInt fault data returns 500 and fails teardown", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        {
          method: "eth_chainId",
          fault: fault.rpcError(-32000, "internal", 1n),
        },
      ],
    });
    const response = await sendRaw(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId" }),
    );

    expect(response.status).toBe(500);
    expect(response.body).toBe(
      `Fault proxy internal error: ${proxy.errors[0]?.message}`,
    );
    expect(proxy.errors[0]).toBeInstanceOf(TypeError);
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "internalError" },
    ]);
    await expect(proxy.kill()).rejects.toThrow(
      "Fault proxy encountered internal errors",
    );
    await expect(proxy.kill()).rejects.toBeInstanceOf(FaultProxyInternalError);
    proxy = undefined;
  });

  test("behavior: mixed batch rejects a missing upstream reply without sending a short batch", async () => {
    upstreamResponseBody = JSON.stringify([
      { jsonrpc: "2.0", id: 1, result: "0x1" },
    ]);
    proxy = await createFaultProxy({ upstream: upstreamUrl });
    const response = await sendRaw(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
      ]),
    );

    expect(response).toEqual({
      status: 502,
      body: "Upstream request failed: Upstream response was not a mergeable JSON-RPC reply",
    });
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "forwarded" },
      { method: "eth_blockNumber", outcome: "upstreamError" },
    ]);
  });

  test("behavior: mixed batch passes through a non-JSON upstream response", async () => {
    upstreamStatus = 503;
    upstreamResponseBody = "<html>down</html>";
    upstreamContentType = "text/html; charset=utf-8";
    proxy = await createFaultProxy({ upstream: upstreamUrl });
    const response = await sendRaw(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
      ]),
    );

    expect(response).toEqual({
      status: 503,
      body: "<html>down</html>",
    });
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "forwarded" },
      { method: "eth_blockNumber", outcome: "forwarded" },
    ]);
  });

  test("behavior: request-level batch fault applies to every call", async () => {
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [{ method: "eth_chainId", fault: fault.status(503, "offline") }],
    });
    const response = await sendRaw(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_blockNumber" },
        { jsonrpc: "2.0", id: 2, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 3, method: "eth_getBalance" },
      ]),
    );

    expect(response).toEqual({ status: 503, body: "offline" });
    expect(upstreamMethods).toEqual([]);
    expect(proxy.log).toEqual([
      { method: "eth_blockNumber", outcome: "status" },
      { method: "eth_chainId", outcome: "status" },
      { method: "eth_getBalance", outcome: "status" },
    ]);
  });

  test("behavior: malformed JSON is forwarded without a log entry", async () => {
    proxy = await createFaultProxy({ upstream: upstreamUrl });
    const response = await sendRaw("{");
    const requestWithoutMethod = await sendRaw(
      JSON.stringify({ jsonrpc: "2.0", id: 1 }),
    );

    expect(response).toEqual({ status: 200, body: "forwarded" });
    expect(requestWithoutMethod.status).toBe(200);
    expect(upstreamMethods).toEqual([]);
    expect(proxy.log).toEqual([]);
  });

  test("behavior: revive while live is a no-op and forwards requests", async () => {
    proxy = await createFaultProxy({ upstream: upstreamUrl });
    await proxy.revive();

    expect(
      await sendRaw(
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId" }),
      ),
    ).toEqual({
      status: 200,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }),
    });
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "forwarded" },
    ]);
  });

  test("error: revive rejects EADDRINUSE when another server holds the port", async () => {
    proxy = await createFaultProxy({ upstream: upstreamUrl });
    const port = Number(new URL(proxy.url).port);
    await proxy.kill();
    const holder = createServer();
    await new Promise<void>((resolve, reject) => {
      holder.once("error", reject);
      holder.listen(port, "127.0.0.1", () => resolve());
    });

    await expect(proxy.revive()).rejects.toMatchObject({ code: "EADDRINUSE" });
    await new Promise<void>((resolve) => holder.close(() => resolve()));
  });

  test("behavior: kill is idempotent and revive reuses the same URL and port", async () => {
    proxy = await createFaultProxy({ upstream: upstreamUrl });
    const url = proxy.url;
    const client = createPublicClient({
      chain: mainnet,
      transport: http(url, { retryCount: 0 }),
    });
    await proxy.kill();
    await proxy.kill();
    const error = await client.getChainId().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpRequestError);
    let current: unknown = error;
    let refused = false;
    while (current instanceof Error) {
      const candidate = current as Error & { readonly code?: unknown };
      if (candidate.code === "ECONNREFUSED") refused = true;
      current = candidate.cause;
    }
    expect(refused).toBe(true);

    await proxy.revive();
    expect(proxy.url).toBe(url);
    expect(await client.getChainId()).toBe(1);
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "forwarded" },
    ]);
  });

  test("behavior: logs pending before the upstream reply and finalizes afterward", async () => {
    let markReceived!: () => void;
    const received = new Promise<void>((resolve) => {
      markReceived = resolve;
    });
    let releaseResponse!: () => void;
    upstreamResponseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    onUpstreamRequestReceived = markReceived;
    proxy = await createFaultProxy({ upstream: upstreamUrl });

    const responsePromise = sendRaw(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId" }),
    );
    await received;
    expect(proxy.log).toEqual([{ method: "eth_chainId", outcome: "pending" }]);

    releaseResponse();
    expect((await responsePromise).status).toBe(200);
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "forwarded" },
    ]);
  });

  test("behavior: logs RPC errors before waiting for forwarded batch calls", async () => {
    let markReceived!: () => void;
    const received = new Promise<void>((resolve) => {
      markReceived = resolve;
    });
    let releaseResponse!: () => void;
    upstreamResponseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    onUpstreamRequestReceived = markReceived;
    proxy = await createFaultProxy({
      upstream: upstreamUrl,
      faults: [
        { method: "eth_chainId", fault: fault.rpcError(-32005, "limited") },
      ],
    });

    const responsePromise = sendRaw(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
      ]),
    );
    await received;
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "rpcError" },
      { method: "eth_blockNumber", outcome: "pending" },
    ]);

    releaseResponse();
    expect((await responsePromise).status).toBe(200);
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "rpcError" },
      { method: "eth_blockNumber", outcome: "forwarded" },
    ]);
  });

  test("behavior: kill closes a pending upstream request and finalizes its log", async () => {
    let markReceived!: () => void;
    const received = new Promise<void>((resolve) => {
      markReceived = resolve;
    });
    let markSocketClosed!: () => void;
    const socketClosed = new Promise<void>((resolve) => {
      markSocketClosed = resolve;
    });
    upstreamResponseGate = new Promise<void>(() => {});
    onUpstreamRequestReceived = markReceived;
    onUpstreamSocketClosed = markSocketClosed;
    proxy = await createFaultProxy({ upstream: upstreamUrl });

    const clientResponse = sendRaw(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId" }),
    ).catch(() => undefined);
    await received;
    expect(proxy.log).toEqual([{ method: "eth_chainId", outcome: "pending" }]);

    await proxy.kill();
    await socketClosed;
    await clientResponse;
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "upstreamError" },
    ]);
  });

  test("behavior: upstream errors return 502 and are logged", async () => {
    proxy = await createFaultProxy({ upstream: upstreamUrl });
    await closeUpstream();
    const response = await sendRaw(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId" }),
    );

    expect(response.status).toBe(502);
    expect(response.body).toContain("ECONNREFUSED");
    expect(proxy.log).toEqual([
      { method: "eth_chainId", outcome: "upstreamError" },
    ]);
  });
});

describe("classifyError", () => {
  test("default", () => {
    expect(classifyError(new Error("unrecognized"))).toBe("unknown");
  });

  test("behavior: classifies each error category", () => {
    class ChainIdMismatchError extends Error {}
    class InvalidSimulationResponseError extends Error {
      override name = "InvalidSimulationResponseError";
    }
    class InvalidChainIdError extends InvalidSimulationResponseError {}
    class SlippageCheckUnavailableError extends Error {
      override name = "SlippageCheckUnavailableError";
    }
    class SimulationRevertedError extends Error {
      constructor(readonly revertData: string) {
        super();
      }
    }
    class UnsupportedChainError extends Error {}
    class DepositOwnerMismatchError extends Error {}
    class DepositSpenderMismatchError extends Error {}
    class DepositAssetMismatchError extends Error {}
    class DepositAmountMismatchError extends Error {}

    expect(
      classifyError(
        new HttpRequestError({ url: "http://localhost", status: 503 }),
      ),
    ).toBe("infra");
    expect(classifyError(new SlippageCheckUnavailableError())).toBe(
      "integrity",
    );
    expect(
      classifyError(
        new HttpRequestError({
          url: "http://localhost",
          status: 502,
          cause: new SyntaxError("invalid JSON"),
        }),
      ),
    ).toBe("infra");
    expect(
      classifyError(
        new HttpRequestError({
          url: "http://localhost",
          status: 200,
          cause: new SyntaxError("invalid JSON"),
        }),
      ),
    ).toBe("integrity");
    expect(classifyError(new InvalidChainIdError())).toBe("chain");
    expect(
      classifyError(
        new ContractFunctionRevertedError({ abi: [], functionName: "f" }),
      ),
    ).toBe("revert");
    expect(classifyError(new SimulationRevertedError("0x815e1d64"))).toBe(
      "auth",
    );
    expect(classifyError(new SimulationRevertedError("0x70f65caa"))).toBe(
      "auth",
    );
    expect(classifyError(new SimulationRevertedError("0xdeadbeef"))).toBe(
      "revert",
    );
    expect(classifyError(new UnsupportedChainError())).toBe("config");
    class MissingContractCodeError extends Error {}
    expect(classifyError(new MissingContractCodeError())).toBe("config");
    class BlacklistViolationError extends Error {}
    expect(classifyError(new BlacklistViolationError())).toBe("config");
    class ConsumerLimitViolationError extends Error {}
    expect(classifyError(new ConsumerLimitViolationError())).toBe("revert");
    expect(classifyError(new DepositOwnerMismatchError())).toBe("auth");
    expect(classifyError(new DepositSpenderMismatchError())).toBe("auth");
    expect(classifyError(new DepositAssetMismatchError())).toBe("auth");
    expect(classifyError(new DepositAmountMismatchError())).toBe("auth");
    expect(classifyError(new ChainIdMismatchError())).toBe("chain");
  });

  test.each([
    ["SimulationRevertedError", "revert"],
    ["ContractFunctionRevertedError", "revert"],
    ["ExecutionRevertedError", "revert"],
    ["InvalidChainIdError", "chain"],
    ["ChainIdMismatchError", "chain"],
    ["ChainMismatchError", "chain"],
    ["HttpRequestError", "infra"],
    ["InvalidSimulationResponseError", "integrity"],
    ["AbiDecodingZeroDataError", "integrity"],
    ["AbiDecodingDataSizeTooSmallError", "integrity"],
    ["InvalidHexValueError", "integrity"],
    ["InvalidSignatureError", "auth"],
    ["AddressMismatchError", "auth"],
    ["ExpiredDeadlineError", "auth"],
    ["UnsupportedErc20ApprovalSpenderError", "auth"],
    ["BundlesPermitMismatchError", "auth"],
    ["BundlesRequirementSignatureMismatchError", "auth"],
    ["Permit2SignatureTransferNonceAlreadyUsedError", "auth"],
    ["InvalidPermitDomainChainIdError", "auth"],
    ["InvalidPermitDomainVerifyingContractError", "auth"],
    ["AuthorizationRequestMismatchError", "auth"],
    ["ContractFunctionZeroDataError", "config"],
    ["SimulationValidationError", "config"],
    ["UnsupportedChainError", "config"],
    ["RpcTransportError", "infra"],
    ["TimeoutError", "infra"],
    ["LimitExceededRpcError", "infra"],
    ["InternalRpcError", "infra"],
    ["ResourceUnavailableRpcError", "infra"],
    ["RpcRequestError", "infra"],
  ] as const)("behavior: classifies %s as %s", (name, category) => {
    expect(classifyError(Object.assign(new Error(), { name }))).toBe(category);
  });

  test.each([
    "0x70f65caa",
    "0x756688fe",
    "0xcd21db4f",
    "0x815e1d64",
    "0x8baa579f",
    "0x4be6321b",
    "0xb0669cbc",
  ])("behavior: classifies revert selector %s as auth", (revertData) => {
    const error = Object.assign(new Error(), {
      name: "SimulationRevertedError",
      revertData,
    });

    expect(classifyError(error)).toBe("auth");
  });

  test("behavior: classifies upper-case revert data with encoded arguments as auth", () => {
    const error = Object.assign(new Error(), {
      name: "SimulationRevertedError",
      revertData: `0xCD21DB4F${"0".repeat(62)}2A`,
    });

    expect(classifyError(error)).toBe("auth");
  });

  test("behavior: classifies UnknownTokenError as config", () => {
    class UnknownTokenError extends Error {}

    expect(classifyError(new UnknownTokenError())).toBe("config");
  });

  test("behavior: classifies MissingPermitDomainNameError as config", () => {
    class MissingPermitDomainNameError extends Error {}

    expect(classifyError(new MissingPermitDomainNameError())).toBe("config");
  });

  test("behavior: classifies MalformedTokenMetadataError as integrity", () => {
    class MalformedTokenMetadataError extends Error {}

    expect(classifyError(new MalformedTokenMetadataError())).toBe("integrity");
  });
  test("behavior: returns the outermost recognized category in a cause chain", () => {
    class RpcTransportError extends Error {
      constructor(cause: Error) {
        super("external service failed", { cause });
      }
    }
    const httpError = new HttpRequestError({
      url: "http://localhost",
      status: 503,
    });
    const contractError = new ContractFunctionRevertedError({
      abi: [],
      functionName: "f",
    });
    const rpcError = new RpcRequestError({
      body: [],
      error: { code: 3, message: "execution reverted" },
      url: "http://localhost",
    });

    expect(classifyError(new RpcTransportError(httpError))).toBe("infra");
    expect(classifyError(new Error("wrapped", { cause: contractError }))).toBe(
      "revert",
    );
    expect(classifyError(new ExecutionRevertedError({ cause: rpcError }))).toBe(
      "revert",
    );
  });

  test("behavior: stops safely on cause cycles and non-Error values", () => {
    const cycle = new Error("cycle");
    Object.defineProperty(cycle, "cause", { value: cycle });

    expect(classifyError(cycle)).toBe("unknown");
    expect(classifyError("not an Error")).toBe("unknown");
    expect(classifyError(undefined)).toBe("unknown");
  });
});

describe("expectFailClosed", () => {
  test("default", async () => {
    const error = new ContractFunctionRevertedError({
      abi: [],
      functionName: "f",
    });

    await expect(
      expectFailClosed(Promise.reject(error), "revert"),
    ).resolves.toBe(error);
  });

  test("error: resolved promise", async () => {
    await expect(
      expectFailClosed(Promise.resolve(1n), "infra"),
    ).rejects.toBeInstanceOf(AssertionError);
    await expect(
      expectFailClosed(Promise.resolve(1n), "infra"),
    ).rejects.toThrow("1n");
  });

  test("error: non-Error rejection", async () => {
    await expect(
      expectFailClosed(Promise.reject("rejected value"), "infra"),
    ).rejects.toBeInstanceOf(AssertionError);
  });

  test("error: wrong category names the cause chain", async () => {
    await expect(
      expectFailClosed(Promise.reject(new Error("unknown")), "revert"),
    ).rejects.toThrow(/expected revert, got unknown; cause chain: Error/);
  });

  test("error: HTTP failures remain neighbouring chain failures", async () => {
    class ChainIdMismatchError extends Error {
      constructor(cause: Error) {
        super("chain mismatch", { cause });
      }
    }
    const error = new ChainIdMismatchError(
      new HttpRequestError({ url: "http://localhost", status: 503 }),
    );

    await expect(
      expectFailClosed(Promise.reject(error), "chain"),
    ).rejects.toBeInstanceOf(AssertionError);
  });

  test("error: fail-closed rejects neighbouring revert, integrity, and config failures", async () => {
    class RpcTransportError extends Error {
      constructor(cause: Error) {
        super("provider failed", { cause });
      }
    }
    class InvalidSimulationResponseError extends Error {
      override name = "InvalidSimulationResponseError";
      constructor(cause: Error) {
        super("invalid simulation response", { cause });
      }
    }
    class UnsupportedChainError extends Error {}

    const reverted = new ContractFunctionRevertedError({
      abi: [],
      functionName: "f",
    });
    const transport = new HttpRequestError({
      url: "http://localhost",
      status: 503,
    });
    const malformedResponse = new HttpRequestError({
      url: "http://localhost",
      status: 200,
      cause: new SyntaxError("invalid JSON"),
    });

    await expect(
      expectFailClosed(
        Promise.reject(new RpcTransportError(reverted)),
        "infra",
      ),
    ).rejects.toBeInstanceOf(AssertionError);
    await expect(
      expectFailClosed(
        Promise.reject(new InvalidSimulationResponseError(transport)),
        "integrity",
      ),
    ).rejects.toBeInstanceOf(AssertionError);
    await expect(
      expectFailClosed(
        Promise.reject(new RpcTransportError(malformedResponse)),
        "infra",
      ),
    ).rejects.toBeInstanceOf(AssertionError);
    await expect(
      expectFailClosed(
        Promise.reject(new RpcTransportError(new UnsupportedChainError())),
        "infra",
      ),
    ).rejects.toBeInstanceOf(AssertionError);
  });

  test("behavior: an outermost RpcRequestError satisfies an infrastructure expectation", async () => {
    const error = new RpcRequestError({
      body: [],
      error: { code: -32000, message: "node failure" },
      url: "http://localhost",
    });

    await expect(
      expectFailClosed(Promise.reject(error), "infra"),
    ).resolves.toBe(error);
  });

  test("behavior: RpcRequestError carries an outermost revert", async () => {
    const rpcError = new RpcRequestError({
      body: [],
      error: { code: 3, message: "execution reverted" },
      url: "http://localhost",
    });
    const error = new ExecutionRevertedError({ cause: rpcError });

    await expect(
      expectFailClosed(Promise.reject(error), "revert"),
    ).resolves.toBe(error);
  });

  test("behavior: viem RpcError subclasses are carriers", async () => {
    class UnlistedRpcError extends RpcError {
      constructor(cause: Error) {
        super(cause, { shortMessage: "node failure" });
      }
    }
    class ChainIdMismatchError extends Error {
      constructor(cause: Error) {
        super("chain mismatch", { cause });
      }
    }
    const error = new ExecutionRevertedError({
      cause: new UnlistedRpcError(new Error("node failure")),
    });
    const internalRpcError = new InternalRpcError(new Error("node failure"));
    const wrappedInternalRpcError = new ExecutionRevertedError({
      cause: internalRpcError,
    });
    const chainMismatchError = new ChainIdMismatchError(
      new UnlistedRpcError(
        new RpcRequestError({
          body: [],
          error: { code: -32000, message: "node failure" },
          url: "http://localhost",
        }),
      ),
    );

    expect(classifyError(internalRpcError)).toBe("infra");
    expect(classifyError(new UnlistedRpcError(new Error("node failure")))).toBe(
      "unknown",
    );
    await expect(
      expectFailClosed(Promise.reject(error), "revert"),
    ).resolves.toBe(error);
    await expect(
      expectFailClosed(Promise.reject(wrappedInternalRpcError), "revert"),
    ).resolves.toBe(wrappedInternalRpcError);
    await expect(
      expectFailClosed(Promise.reject(chainMismatchError), "chain"),
    ).resolves.toBe(chainMismatchError);
  });

  test("error: nested RpcRequestError is not a carrier", async () => {
    class ChainIdMismatchError extends Error {
      constructor(cause: Error) {
        super("chain mismatch", { cause });
      }
    }
    const error = new ChainIdMismatchError(
      new RpcRequestError({
        body: [],
        error: { code: -32000, message: "node failure" },
        url: "http://localhost",
      }),
    );

    await expect(
      expectFailClosed(Promise.reject(error), "chain"),
    ).rejects.toBeInstanceOf(AssertionError);
  });
});
