import {
  CallExecutionError,
  createPublicClient,
  encodeErrorResult,
  http,
  offchainLookupAbiItem,
} from "viem";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SimulationValidationError } from "../../errors.js";
import { createSimulationClient } from "./client.js";

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return { ...actual, createPublicClient: vi.fn(actual.createPublicClient) };
});

afterEach(() => vi.unstubAllGlobals());

describe.sequential("createSimulationClient", () => {
  const rpcUrl = "https://rpc.example.com";
  const target = "0x0000000000000000000000000000000000000001";

  test("default: disables CCIP-Read", () => {
    expect(createSimulationClient(rpcUrl).ccipRead).toBe(false);
  });

  test("error: rejects clients without CCIP-Read configuration before any request", () => {
    const { ccipRead: _, ...client } = createPublicClient({
      transport: http(rpcUrl),
    });
    vi.mocked(createPublicClient).mockReturnValueOnce(client);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    expect(() => createSimulationClient(rpcUrl)).toThrow(
      SimulationValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(["0x", "0x1234"] as const)(
    "behavior: preserves successful call result %s",
    async (result) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ jsonrpc: "2.0", id: 0, result }));
      vi.stubGlobal("fetch", fetchMock);

      const response = await createSimulationClient(rpcUrl).call({
        to: target,
      });

      expect(response.data).toBe(result === "0x" ? undefined : result);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  test("error: OffchainLookup does not fetch a gateway URL", async () => {
    const data = encodeErrorResult({
      abi: [offchainLookupAbiItem],
      errorName: "OffchainLookup",
      args: [
        target,
        ["https://gateway.example.com/{sender}/{data}"],
        "0x1234",
        "0x12345678",
        "0x",
      ],
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({
        jsonrpc: "2.0",
        id: 0,
        error: { code: 3, message: "execution reverted", data },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createSimulationClient(rpcUrl).call({ to: target }),
    ).rejects.toBeInstanceOf(CallExecutionError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(new URL(rpcUrl).href);
  });
});
