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
import type { simulateTenderlyRpc } from "../backends/tenderly-rpc.js";
import { executeSimulation } from "./execute-simulation.js";

const mockTenderlyRpc = vi.fn<typeof simulateTenderlyRpc>();
const mockSimulateV1 = vi.fn<typeof simulateV1>();

vi.mock("../backends/tenderly-rpc", () => ({
  simulateTenderlyRpc: (
    ...args: Parameters<typeof simulateTenderlyRpc>
  ): Promise<RawSimulationResult> => mockTenderlyRpc(...args),
}));

vi.mock("../backends/eth-simulate-v1", () => ({
  simulateV1: (
    ...args: Parameters<typeof simulateV1>
  ): Promise<RawSimulationResult> => mockSimulateV1(...args),
}));

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";

const txs: SimulationTransaction[] = [
  { from: USER, to: VAULT, data: "0x12" as Hex },
];

function bothBackends(timeoutMs = 5000): SimulationConfig {
  return {
    chains: new Map([
      [
        1,
        {
          tenderlyRpc: { rpcUrl: "https://mainnet.gateway.tenderly.co/key" },
          simulateV1Url: "http://rpc.local",
        },
      ],
    ]),
    timeoutMs,
  };
}

beforeEach(() => vi.clearAllMocks());

describe.sequential("executeSimulation — Tenderly + simulateV1 configured", () => {
  it("calls Tenderly first and returns its result on success", async () => {
    mockTenderlyRpc.mockResolvedValueOnce({ calls: [], assetChanges: [] });

    await executeSimulation({
      config: bothBackends(),
      chainId: 1,
      transactions: txs,
    });

    expect(mockTenderlyRpc).toHaveBeenCalledTimes(1);
    expect(mockSimulateV1).not.toHaveBeenCalled();
  });

  it("passes the chain's tenderlyRpc config to the backend", async () => {
    mockTenderlyRpc.mockResolvedValueOnce({ calls: [], assetChanges: [] });

    await executeSimulation({
      config: bothBackends(),
      chainId: 1,
      transactions: txs,
    });

    expect(mockTenderlyRpc.mock.calls[0]![0].config.rpcUrl).toBe(
      "https://mainnet.gateway.tenderly.co/key",
    );
  });

  it("forwards ecrecoverOverride to Tenderly and to the simulateV1 fallback", async () => {
    mockTenderlyRpc.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly 502"),
    );
    mockSimulateV1.mockResolvedValueOnce({ calls: [], assetChanges: [] });

    await executeSimulation({
      config: bothBackends(),
      chainId: 1,
      transactions: txs,
      ecrecoverOverride: USER,
    });

    expect(mockTenderlyRpc.mock.calls[0]![0].ecrecoverOverride).toBe(USER);
    expect(mockSimulateV1.mock.calls[0]![0].ecrecoverOverride).toBe(USER);
  });

  it("allocates 60% of timeoutMs to Tenderly (budget-ratio pin)", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    try {
      mockTenderlyRpc.mockResolvedValueOnce({ calls: [], assetChanges: [] });

      await executeSimulation({
        config: bothBackends(10_000),
        chainId: 1,
        transactions: txs,
      });

      expect(timeoutSpy).toHaveBeenCalledWith(6000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("falls back to simulateV1 when Tenderly throws ExternalServiceError", async () => {
    mockTenderlyRpc.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly 502"),
    );
    mockSimulateV1.mockResolvedValueOnce({ calls: [], assetChanges: [] });

    await executeSimulation({
      config: bothBackends(),
      chainId: 1,
      transactions: txs,
    });

    expect(mockSimulateV1).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back when Tenderly throws SimulationRevertedError", async () => {
    mockTenderlyRpc.mockRejectedValueOnce(
      new SimulationRevertedError("reverted"),
    );

    await expect(
      executeSimulation({
        config: bothBackends(),
        chainId: 1,
        transactions: txs,
      }),
    ).rejects.toThrow(SimulationRevertedError);

    expect(mockSimulateV1).not.toHaveBeenCalled();
  });

  it("throws when both backends are unavailable", async () => {
    mockTenderlyRpc.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly down"),
    );
    mockSimulateV1.mockRejectedValueOnce(new ExternalServiceError("RPC down"));

    await expect(
      executeSimulation({
        config: bothBackends(),
        chainId: 1,
        transactions: txs,
      }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("still attempts fallback with a minimum budget when Tenderly ate the whole timeout", async () => {
    mockTenderlyRpc.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly timeout"),
    );
    mockSimulateV1.mockResolvedValueOnce({ calls: [], assetChanges: [] });

    const result = await executeSimulation({
      config: bothBackends(1),
      chainId: 1,
      transactions: txs,
    });

    expect(result).toBeDefined();
    expect(mockSimulateV1).toHaveBeenCalledTimes(1);
  });
});

describe.sequential("executeSimulation — Tenderly only", () => {
  const tenderlyOnly: SimulationConfig = {
    chains: new Map([
      [1, { tenderlyRpc: { rpcUrl: "https://gateway.tenderly.co/key" } }],
    ]),
  };

  it("returns Tenderly result on success", async () => {
    mockTenderlyRpc.mockResolvedValueOnce({ calls: [], assetChanges: [] });

    await executeSimulation({
      config: tenderlyOnly,
      chainId: 1,
      transactions: txs,
    });

    expect(mockSimulateV1).not.toHaveBeenCalled();
  });

  it("does NOT fall back when Tenderly fails and no fallback configured", async () => {
    mockTenderlyRpc.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly down"),
    );

    await expect(
      executeSimulation({
        config: tenderlyOnly,
        chainId: 1,
        transactions: txs,
      }),
    ).rejects.toThrow(ExternalServiceError);

    expect(mockSimulateV1).not.toHaveBeenCalled();
  });
});

describe.sequential("executeSimulation — simulateV1 only", () => {
  const simV1Only: SimulationConfig = {
    chains: new Map([[1, { simulateV1Url: "http://rpc.local" }]]),
  };

  it("uses simulateV1 directly without touching Tenderly", async () => {
    mockSimulateV1.mockResolvedValueOnce({ calls: [], assetChanges: [] });

    await executeSimulation({
      config: simV1Only,
      chainId: 1,
      transactions: txs,
    });

    expect(mockTenderlyRpc).not.toHaveBeenCalled();
    expect(mockSimulateV1).toHaveBeenCalledTimes(1);
  });

  it("uses the default timeout when timeoutMs is omitted", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    try {
      mockSimulateV1.mockResolvedValueOnce({ calls: [], assetChanges: [] });

      await executeSimulation({
        config: simV1Only,
        chainId: 1,
        transactions: txs,
      });

      expect(timeoutSpy).toHaveBeenCalledWith(5000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});

describe.sequential("executeSimulation — no backend available", () => {
  it("throws UnsupportedChainError", async () => {
    await expect(
      executeSimulation({
        config: { chains: new Map() },
        chainId: 1,
        transactions: txs,
      }),
    ).rejects.toThrow(UnsupportedChainError);
  });
});
