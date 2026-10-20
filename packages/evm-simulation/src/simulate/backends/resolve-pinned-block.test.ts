import { numberToHex } from "viem";
import { vi } from "vitest";
import {
  InvalidSimulationResponseError,
  RpcTransportError,
} from "../../errors.js";
import { createSimulationClient } from "./client.js";
import { resolvePinnedBlock } from "./resolve-pinned-block.js";

const fetchMock = vi.fn<typeof fetch>();
const rpc = (result: unknown) =>
  Response.json({ jsonrpc: "2.0", id: 1, result });

const client = () => createSimulationClient("https://rpc.example");

const block = {
  number: numberToHex(20_000_000n),
  hash: `0x${"ab".repeat(32)}`,
  timestamp: numberToHex(1_700_000_000n),
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe.sequential("resolvePinnedBlock", () => {
  test("default: resolves an explicit block number", async () => {
    fetchMock.mockResolvedValueOnce(rpc(block));
    const pinned = await resolvePinnedBlock({
      client: client(),
      blockNumber: 20_000_000n,
    });
    expect(pinned).toEqual({
      number: 20_000_000n,
      hash: block.hash,
      timestamp: 1_700_000_000n,
    });
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).params,
    ).toEqual(["0x1312d00", false]);
  });

  test("behavior: resolves latest into a single pin", async () => {
    fetchMock.mockResolvedValueOnce(rpc(block));
    const pinned = await resolvePinnedBlock({ client: client() });
    expect(pinned.number).toBe(20_000_000n);
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).params,
    ).toEqual(["latest", false]);
  });

  test("behavior: resolves a tag", async () => {
    fetchMock.mockResolvedValueOnce(rpc(block));
    await resolvePinnedBlock({ client: client(), blockNumber: "finalized" });
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).params,
    ).toEqual(["finalized", false]);
  });

  test("error: InvalidSimulationResponseError on a numberless/hashless block", async () => {
    fetchMock.mockResolvedValueOnce(rpc({ timestamp: "0x0" }));
    await expect(
      resolvePinnedBlock({ client: client() }),
    ).rejects.toBeInstanceOf(InvalidSimulationResponseError);
  });

  test("error: InvalidSimulationResponseError for a non-JSON 2xx reply", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>ok</html>"));
    const error = await resolvePinnedBlock({ client: client() }).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect(error).not.toBeInstanceOf(RpcTransportError);
  });

  test("error: InvalidSimulationResponseError for a JSON null 2xx reply", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("null", { headers: { "Content-Type": "application/json" } }),
    );
    const error = await resolvePinnedBlock({ client: client() }).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect(error).not.toBeInstanceOf(RpcTransportError);
  });

  test.each([42, true, "ok", [], {}])(
    "error: RpcTransportError for a JSON 2xx body without an RPC result (%j)",
    async (body) => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        }),
      );
      const error = await resolvePinnedBlock({ client: client() }).catch(
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(RpcTransportError);
      expect(error).not.toBeInstanceOf(InvalidSimulationResponseError);
    },
  );

  test("error: RpcTransportError for an empty 2xx block reply", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const error = await resolvePinnedBlock({ client: client() }).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(RpcTransportError);
    expect(error).not.toBeInstanceOf(InvalidSimulationResponseError);
  });

  test("error: InvalidSimulationResponseError for an empty JSON 2xx block reply", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const error = await resolvePinnedBlock({ client: client() }).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect(error).not.toBeInstanceOf(RpcTransportError);
  });

  test("error: RpcTransportError omits viem diagnostics", async () => {
    fetchMock.mockRejectedValueOnce(
      new Error("request failed: https://rpc.example"),
    );
    const error = await resolvePinnedBlock({ client: client() }).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(RpcTransportError);
    expect((error as Error).message).not.toContain("https://rpc.example");
  });

  test("error: preserves the abort reason", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      resolvePinnedBlock({ client: client(), signal: controller.signal }),
    ).rejects.toMatchObject({
      cause: controller.signal.reason,
      code: "RPC_TRANSPORT_ERROR",
    });
  });
});
