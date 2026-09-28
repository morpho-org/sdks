import type { Address, Hex } from "viem";
import { vi } from "vitest";
import {
  ExternalServiceError,
  SimulationRevertedError,
  UnsupportedChainError,
} from "../../errors.js";
import type {
  RawSimulationResult,
  SimulationConfig,
  SimulationTransaction,
} from "../../types.js";
import type { simulateV1 } from "../backends/eth-simulate-v1.js";
import { executeSimulation } from "./execute-simulation.js";

const mockSimulateV1 = vi.fn<typeof simulateV1>();

vi.mock("../backends/eth-simulate-v1", () => ({
  simulateV1: (
    ...args: Parameters<typeof simulateV1>
  ): Promise<RawSimulationResult> => mockSimulateV1(...args),
}));

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const txs: SimulationTransaction[] = [
  { from: USER, to: VAULT, data: "0x12" as Hex },
];

function makeConfig(timeoutMs?: number): SimulationConfig {
  return {
    chains: new Map([[1, { simulateV1Url: "http://rpc.local" }]]),
    timeoutMs,
  };
}

beforeEach(() => vi.clearAllMocks());

describe.sequential("executeSimulation", () => {
  it("runs the bundle through simulateV1 with the chain URL and forwarded args", async () => {
    mockSimulateV1.mockResolvedValueOnce({ calls: [], assetChanges: [] });

    await executeSimulation({
      config: makeConfig(),
      chainId: 1,
      transactions: txs,
      blockNumber: 123n,
      wNative: WETH,
    });

    expect(mockSimulateV1).toHaveBeenCalledTimes(1);
    const args = mockSimulateV1.mock.calls[0]![0];
    expect(args.rpcUrl).toBe("http://rpc.local");
    expect(args.chainId).toBe(1);
    expect(args.transactions).toBe(txs);
    expect(args.blockNumber).toBe(123n);
    expect(args.wNative).toBe(WETH);
  });

  it("gives simulateV1 the full configured timeout", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    try {
      mockSimulateV1.mockResolvedValueOnce({ calls: [], assetChanges: [] });

      await executeSimulation({
        config: makeConfig(3000),
        chainId: 1,
        transactions: txs,
      });

      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(timeoutSpy).toHaveBeenCalledWith(3000);
      expect(mockSimulateV1.mock.calls[0]![0].signal).toBe(
        timeoutSpy.mock.results[0]!.value,
      );
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("uses the default timeout when timeoutMs is omitted", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    try {
      mockSimulateV1.mockResolvedValueOnce({ calls: [], assetChanges: [] });

      await executeSimulation({
        config: makeConfig(),
        chainId: 1,
        transactions: txs,
      });

      expect(timeoutSpy).toHaveBeenCalledWith(5000);
      expect(mockSimulateV1.mock.calls[0]![0].signal).toBe(
        timeoutSpy.mock.results[0]!.value,
      );
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("propagates ExternalServiceError without retrying", async () => {
    mockSimulateV1.mockRejectedValueOnce(new ExternalServiceError("RPC down"));

    await expect(
      executeSimulation({
        config: makeConfig(),
        chainId: 1,
        transactions: txs,
      }),
    ).rejects.toThrow(ExternalServiceError);

    expect(mockSimulateV1).toHaveBeenCalledTimes(1);
  });

  it("propagates SimulationRevertedError", async () => {
    mockSimulateV1.mockRejectedValueOnce(
      new SimulationRevertedError("revert", 0),
    );

    await expect(
      executeSimulation({
        config: makeConfig(),
        chainId: 1,
        transactions: txs,
      }),
    ).rejects.toThrow(SimulationRevertedError);
  });

  it("throws UnsupportedChainError when the chain is not configured", async () => {
    await expect(
      executeSimulation({
        config: { chains: new Map() },
        chainId: 1,
        transactions: txs,
      }),
    ).rejects.toThrow(UnsupportedChainError);

    expect(mockSimulateV1).not.toHaveBeenCalled();
  });
});
