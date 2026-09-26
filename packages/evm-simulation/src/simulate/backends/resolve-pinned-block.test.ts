import { numberToHex } from "viem";
import { vi } from "vitest";
import {
  ExternalServiceError,
  InvalidSimulationResponseError,
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

  test("error: ExternalServiceError when the RPC fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("refused"));
    await expect(
      resolvePinnedBlock({ client: client() }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });

  test("error: ExternalServiceError on abort", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      resolvePinnedBlock({ client: client(), signal: controller.signal }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });
});
