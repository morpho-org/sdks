import { type Address, getAddress, numberToHex } from "viem";
import { vi } from "vitest";
import {
  ExternalServiceError,
  SimulationRevertedError,
  UnsupportedChainError,
} from "../../errors.js";
import { encodeUint256 } from "../../test-helpers/index.js";
import type { SimulationConfig } from "../../types.js";
import { planExecution } from "../plan/plan-execution.js";
import { parseRequest } from "../request/index.js";
import { executeSimulation } from "./execute-simulation.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const VAULT: Address = getAddress("0x2222222222222222222222222222222222222222");
const config: SimulationConfig = {
  chains: new Map([[1, { simulateV1Url: "https://rpc.example" }]]),
};
const fetchMock = vi.fn<typeof fetch>();

const rpc = (result: unknown) =>
  Response.json({ jsonrpc: "2.0", id: 1, result });

function respondHappy(callCount = 3) {
  fetchMock
    .mockResolvedValueOnce(rpc("0x1"))
    .mockResolvedValueOnce(
      rpc({
        number: numberToHex(20_000_000n),
        hash: `0x${"ab".repeat(32)}`,
        timestamp: numberToHex(1_700_000_000n),
      }),
    )
    .mockResolvedValueOnce(
      rpc([
        {
          number: numberToHex(20_000_001n),
          timestamp: numberToHex(1_700_000_012n),
          hash: `0x${"cd".repeat(32)}`,
          calls: Array.from({ length: callCount }, (_, i) => ({
            status: "0x1",
            gasUsed: "0x0",
            returnData: i % 2 === 0 ? encodeUint256(0n) : "0x",
            logs: [],
          })),
        },
      ]),
    )
    // Post-simulation reorg check re-fetches the pinned state block.
    .mockResolvedValueOnce(
      rpc({
        number: numberToHex(20_000_000n),
        hash: `0x${"ab".repeat(32)}`,
        timestamp: numberToHex(1_700_000_000n),
      }),
    );
}

const makePlan = () =>
  planExecution(
    parseRequest({
      chainId: 1,
      transactions: [{ from: OWNER, to: VAULT, data: "0x12" }],
    }),
  );

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
    "behavior: uses the full timeout budget %s across all four RPC steps",
    async (timeoutMs) => {
      const timeout = vi.spyOn(AbortSignal, "timeout");
      respondHappy();
      await executeSimulation({
        config: { ...config, timeoutMs },
        plan: makePlan(),
      });
      expect(timeout).toHaveBeenCalledWith(timeoutMs ?? 5000);
      // One shared signal across chainId, getBlock, eth_simulateV1 and the
      // reorg-check getBlock.
      const signals = fetchMock.mock.calls.map((call) => call[1]?.signal);
      expect(signals).toHaveLength(4);
      expect(new Set(signals).size).toBe(1);
    },
  );

  test("default: returns evidence from the boundary", async () => {
    respondHappy();
    const evidence = await executeSimulation({
      config,
      plan: makePlan(),
      blockNumber: 20_000_000n,
    });
    expect(evidence.calls).toHaveLength(3);
    expect(evidence.snapshots).toHaveLength(2);
  });

  test("error: UnsupportedChainError without an endpoint", async () => {
    await expect(
      executeSimulation({ config: { chains: new Map() }, plan: makePlan() }),
    ).rejects.toBeInstanceOf(UnsupportedChainError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("error: propagates SimulationRevertedError from the boundary", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(
        rpc({
          number: numberToHex(20_000_000n),
          hash: `0x${"ab".repeat(32)}`,
          timestamp: numberToHex(1_700_000_000n),
        }),
      )
      .mockResolvedValueOnce(
        rpc([
          {
            number: numberToHex(20_000_001n),
            timestamp: numberToHex(1_700_000_012n),
            hash: `0x${"cd".repeat(32)}`,
            calls: [
              {
                status: "0x1",
                gasUsed: "0x0",
                returnData: encodeUint256(0n),
                logs: [],
              },
              {
                status: "0x0",
                gasUsed: "0x0",
                returnData: "0x",
                logs: [],
                error: { code: 3, message: "reverted" },
              },
              {
                status: "0x1",
                gasUsed: "0x0",
                returnData: encodeUint256(0n),
                logs: [],
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(
        rpc({
          number: numberToHex(20_000_000n),
          hash: `0x${"ab".repeat(32)}`,
          timestamp: numberToHex(1_700_000_000n),
        }),
      );
    await expect(
      executeSimulation({ config, plan: makePlan() }),
    ).rejects.toBeInstanceOf(SimulationRevertedError);
  });

  test("error: ExternalServiceError when the transport fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network refused"));
    await expect(
      executeSimulation({ config, plan: makePlan() }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });
});
