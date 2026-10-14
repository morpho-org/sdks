import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, onTestFinished, test } from "vitest";
import { startForkProxy } from "./forkProxy.js";

type JsonRpcRequest = { id: number; method: string };

const startUpstream = async () => {
  const requests: { body: unknown; headers: IncomingHttpHeaders }[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body: JsonRpcRequest | JsonRpcRequest[] = JSON.parse(raw);
    requests.push({ body, headers: req.headers });
    const answer = ({ id, method }: JsonRpcRequest) =>
      method === "eth_fail"
        ? { jsonrpc: "2.0", id, error: { code: -32000, message: "boom" } }
        : { jsonrpc: "2.0", id, result: method };
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

const startProxy = async (upstreamUrl: string) => {
  const proxy = await startForkProxy(upstreamUrl);
  onTestFinished(proxy.close);

  return (body: unknown, headers: Record<string, string> = {}) =>
    fetch(proxy.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
};

// onTestFinished binds to the running test only outside concurrent mode.
describe.sequential("startForkProxy", () => {
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
    const url = new URL(upstream.url);
    url.username = "user";
    url.password = "p@ss";
    const send = await startProxy(url.href);

    expect(
      (await send({ jsonrpc: "2.0", id: 1, method: "eth_chainId" })).status,
    ).toBe(200);
    expect(upstream.requests[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("user:p@ss").toString("base64")}`,
    );
  });

  test("behavior: keeps a request's own authorization over URL credentials", async () => {
    const upstream = await startUpstream();
    const url = new URL(upstream.url);
    url.username = "user";
    url.password = "pass";
    const send = await startProxy(url.href);

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
