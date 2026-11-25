import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { InternalRpcError, RpcRequestError } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, type TestContext, test } from "vitest";
import { type AnvilLease, createLeasedClient } from "./anvilLease.js";

/**
 * Serves every JSON-RPC request with `status` and `body`, or drops the connection when `body` is
 * undefined, until the test owning `onTestFinished` ends.
 */
async function serve(
  { onTestFinished }: TestContext,
  { status, body }: { readonly status: number; readonly body?: object },
) {
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      if (body === undefined) {
        request.socket.destroy();
        return;
      }
      const { id } = JSON.parse(raw);
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id, ...body }));
    });
  });
  onTestFinished(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const openLease = (): AnvilLease => ({
  open: true,
  inFlight: 0,
  reusable: true,
});

describe("createLeasedClient", () => {
  test.for([
    { code: 3, error: RpcRequestError },
    { code: InternalRpcError.code, error: InternalRpcError },
  ])(
    "behavior: a JSON-RPC error response with code $code keeps the lease reusable",
    async ({ code, error }, context) => {
      const rpcUrl = await serve(context, {
        status: 200,
        body: { error: { code, message: "execution reverted" } },
      });
      const lease = openLease();
      const client = createLeasedClient(mainnet, { rpcUrl, lease });

      await expect(
        client.request({ method: "eth_call", params: [{}, "latest"] }),
      ).rejects.toBeInstanceOf(error);
      expect(lease).toEqual({ open: true, inFlight: 0, reusable: true });
    },
  );

  test.for([
    { name: "an HTTP failure", status: 500, body: { result: null } },
    { name: "a dropped connection", status: 200, body: undefined },
  ])("behavior: $name retires the lease", async ({ status, body }, context) => {
    const rpcUrl = await serve(context, { status, body });
    const lease = openLease();
    const client = createLeasedClient(mainnet, { rpcUrl, lease });

    const request = client.request({
      method: "anvil_mine",
      params: ["0x1", undefined],
    });
    await expect(request).rejects.not.toBeInstanceOf(RpcRequestError);
    expect(lease).toEqual({ open: true, inFlight: 0, reusable: false });
  });
});
