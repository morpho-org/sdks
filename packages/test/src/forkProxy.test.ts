import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, onTestFinished, test } from "vitest";
import { createForkBootstrapBlock, startForkProxy } from "./forkProxy.js";

type JsonRpcRequest = { id: number; method: string; params?: unknown[] };

const startUpstream = async (
  resultFor: (request: JsonRpcRequest) => unknown = ({ method }) => method,
) => {
  const requests: { body: unknown; headers: IncomingHttpHeaders }[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body: JsonRpcRequest | JsonRpcRequest[] = JSON.parse(raw);
    requests.push({ body, headers: req.headers });
    const answer = (request: JsonRpcRequest) =>
      request.method === "eth_fail"
        ? {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32000, message: "boom" },
          }
        : { jsonrpc: "2.0", id: request.id, result: resultFor(request) };
    res
      .writeHead(
        !Array.isArray(body) && body.method === "http_error" ? 503 : 200,
        {
          "content-type": "application/json",
          "x-upstream": "yes",
        },
      )
      .end(
        JSON.stringify(Array.isArray(body) ? body.map(answer) : answer(body)),
      );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => {
    server.close();
  });

  return {
    requests,
    close: () => server.close(),
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/rpc?token=s3cret`,
  };
};

const postRpc =
  (url: string) =>
  (body: unknown, headers: Record<string, string> = {}) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

const startProxy = async (upstreamUrl: string) => {
  const proxy = await startForkProxy(upstreamUrl);
  onTestFinished(proxy.close);
  return postRpc(proxy.url);
};

// onTestFinished binds to the running test only outside concurrent mode.
describe.sequential("startForkProxy", () => {
  test("behavior: caches only a valid pinned block during startup", async () => {
    const result = { number: "0x2a", hash: `0x${"ab".repeat(32)}` };
    const upstream = await startUpstream(({ id }) =>
      id === 1 ? null : result,
    );
    const bootstrapBlock = createForkBootstrapBlock(42n);
    const first = await startForkProxy(upstream.url, bootstrapBlock);
    onTestFinished(first.close);
    const second = await startForkProxy(upstream.url, bootstrapBlock);
    onTestFinished(second.close);

    const request = {
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: ["0x2a", false],
    };
    const read =
      (url: string) =>
      async (id: number, params = request.params) =>
        (await postRpc(url)({ ...request, id, params })).json();
    const readFirst = read(first.url);
    const readSecond = read(second.url);

    await expect(readFirst(1)).resolves.toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: null,
    });
    await expect(readFirst(2)).resolves.toEqual({
      jsonrpc: "2.0",
      id: 2,
      result,
    });
    first.finishStartup();
    await expect(readSecond(3)).resolves.toEqual({
      jsonrpc: "2.0",
      id: 3,
      result,
    });
    expect(upstream.requests).toHaveLength(2);

    await readSecond(4, ["latest", false]);
    await readSecond(5, ["0x2a", true]);
    await (await postRpc(second.url)([{ ...request, id: 6 }])).json();
    second.finishStartup();
    await readSecond(7);
    expect(upstream.requests).toHaveLength(6);
  });

  test("default: forwards requests, headers, status and errors unchanged", async () => {
    const upstream = await startUpstream();
    const send = await startProxy(upstream.url);

    const response = await send(
      { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
      { authorization: "Bearer token" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-upstream")).toBe("yes");
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: "eth_chainId",
    });
    expect(upstream.requests[0]?.headers.authorization).toBe("Bearer token");

    await expect(
      (await send({ jsonrpc: "2.0", id: 2, method: "eth_fail" })).json(),
    ).resolves.toEqual({
      jsonrpc: "2.0",
      id: 2,
      error: { code: -32000, message: "boom" },
    });
    expect(
      (await send({ jsonrpc: "2.0", id: 3, method: "http_error" })).status,
    ).toBe(503);
    expect(upstream.requests).toHaveLength(3);
  });

  test("behavior: sends URL credentials as Basic auth", async () => {
    const upstream = await startUpstream();
    const send = await startProxy(
      upstream.url.replace("http://", "http://user:p%40ss@"),
    );

    expect(
      (await send({ jsonrpc: "2.0", id: 1, method: "eth_chainId" })).status,
    ).toBe(200);
    expect(upstream.requests[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("user:p@ss").toString("base64")}`,
    );
  });

  test("behavior: keeps a request's own authorization over URL credentials", async () => {
    const upstream = await startUpstream();
    const send = await startProxy(
      upstream.url.replace("http://", "http://user:pass@"),
    );

    await send(
      { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
      { authorization: "Bearer token" },
    );
    expect(upstream.requests[0]?.headers.authorization).toBe("Bearer token");
  });

  test("behavior: answers anvil_nodeInfo locally with Method not found", async () => {
    const upstream = await startUpstream();
    const send = await startProxy(upstream.url);

    await expect(
      (await send({ jsonrpc: "2.0", id: 7, method: "anvil_nodeInfo" })).json(),
    ).resolves.toEqual({
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32601, message: "Method not found" },
    });
    await expect(
      (
        await send([{ jsonrpc: "2.0", id: 8, method: "anvil_nodeInfo" }])
      ).json(),
    ).resolves.toEqual([
      {
        jsonrpc: "2.0",
        id: 8,
        error: { code: -32601, message: "Method not found" },
      },
    ]);
    expect(upstream.requests).toEqual([]);
  });

  test("behavior: forwards the rest of a batch holding anvil_nodeInfo", async () => {
    const upstream = await startUpstream();
    const send = await startProxy(upstream.url);

    const response = await send([
      { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
      { jsonrpc: "2.0", id: 2, method: "anvil_nodeInfo" },
      { jsonrpc: "2.0", id: 3, method: "eth_fail" },
    ]);
    await expect(response.json()).resolves.toEqual([
      { jsonrpc: "2.0", id: 1, result: "eth_chainId" },
      { jsonrpc: "2.0", id: 3, error: { code: -32000, message: "boom" } },
      {
        jsonrpc: "2.0",
        id: 2,
        error: { code: -32601, message: "Method not found" },
      },
    ]);
    expect(upstream.requests.map(({ body }) => body)).toEqual([
      [
        { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 3, method: "eth_fail" },
      ],
    ]);
  });

  test("error: answers 502 without the upstream URL when the fork RPC is unreachable", async () => {
    const upstream = await startUpstream();
    upstream.close();
    const send = await startProxy(upstream.url);

    const response = await send({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
    });
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).toContain("ECONNREFUSED");
    expect(text).not.toContain("s3cret");
  });
});
