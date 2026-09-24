import type { Address } from "viem";
import { vi } from "vitest";
import {
  ExternalServiceError,
  SimulationRevertedError,
  UnsupportedChainError,
} from "../../errors.js";
import type { SimulationConfig, SimulationTransaction } from "../../types.js";
import { executeSimulation } from "./execute-simulation.js";

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const transactions: SimulationTransaction[] = [
  { from: USER, to: VAULT, data: "0x12" },
];
const config: SimulationConfig = {
  chains: new Map([[1, { simulateV1Url: "https://rpc.example" }]]),
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.sequential("executeSimulation", () => {
  test.each([undefined, 10_000, 1])(
    "behavior: uses the full timeout budget %s",
    async (timeoutMs) => {
      const timeout = vi.spyOn(AbortSignal, "timeout");
      fetchMock.mockResolvedValueOnce(
        Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: [
            {
              calls: [
                {
                  status: "0x1",
                  gasUsed: "0x5208",
                  returnData: "0x",
                  logs: [],
                },
                { status: "0x1", gasUsed: "0x0", returnData: "0x", logs: [] },
              ],
            },
          ],
        }),
      );
      const result = await executeSimulation({
        config: { ...config, timeoutMs },
        chainId: 1,
        transactions,
      });
      expect(result.calls).toHaveLength(1);
      expect(timeout).toHaveBeenCalledExactlyOnceWith(timeoutMs ?? 5000);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0]?.[0]).toBe("https://rpc.example/");
    },
  );

  test.each([
    { code: -32601, message: "Method not found" },
    { code: -32603, message: "Internal error" },
  ])(
    "error: ExternalServiceError without retry for $message",
    async (error) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({ jsonrpc: "2.0", id: 1, error }),
      );
      await expect(
        executeSimulation({ config, chainId: 1, transactions }),
      ).rejects.toBeInstanceOf(ExternalServiceError);
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  test("error: SimulationRevertedError without another request", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: 3, message: "execution reverted" },
      }),
    );
    await expect(
      executeSimulation({ config, chainId: 1, transactions }),
    ).rejects.toBeInstanceOf(SimulationRevertedError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("error: ExternalServiceError when the execution budget expires", async () => {
    fetchMock.mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) throw new Error("Expected an execution deadline");
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    await expect(
      executeSimulation({
        config: { ...config, timeoutMs: 10 },
        chainId: 1,
        transactions,
      }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  test("error: UnsupportedChainError before contacting a provider", async () => {
    await expect(
      executeSimulation({ config, chainId: 42, transactions }),
    ).rejects.toBeInstanceOf(UnsupportedChainError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
