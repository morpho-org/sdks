import type { Address, Hex } from "viem";
import { vi } from "vitest";

import type {
  RawSimulationResult,
  SimulationConfig,
  SimulationTransaction,
} from "../../types.js";
import type { simulateV1 } from "../backends/eth-simulate-v1.js";
import type { simulateTenderlyRest } from "../backends/tenderly-rest.js";

import {
  ExternalServiceError,
  SimulationRevertedError,
  UnsupportedChainError,
} from "../../errors.js";
import { executeSimulation } from "./execute-simulation.js";

const mockTenderlyRest = vi.fn<typeof simulateTenderlyRest>();
const mockSimulateV1 = vi.fn<typeof simulateV1>();

vi.mock("../backends/tenderly-rest", () => ({
  simulateTenderlyRest: (
    ...args: Parameters<typeof simulateTenderlyRest>
  ): Promise<RawSimulationResult> => mockTenderlyRest(...args),
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
    chains: new Map([[1, { simulateV1Url: "http://rpc.local" }]]),
    tenderlyRest: {
      apiBaseUrl: "https://api.tenderly.co",
      accessToken: "t",
      accountSlug: "a",
      projectSlug: "p",
      supportedChainIds: new Set([1]),
    },
    timeoutMs,
  };
}

beforeEach(() => vi.clearAllMocks());

describe.sequential(
  "executeSimulation — Tenderly + simulateV1 configured",
  () => {
    it("calls Tenderly first and returns its result on success", async () => {
      mockTenderlyRest.mockResolvedValueOnce({
        logs: [],
        tenderlyUrl: "https://dashboard.tenderly.co/shared/simulation/abc",
      });

      const result = await executeSimulation({
        config: bothBackends(),
        chainId: 1,
        transactions: txs,
        shareable: true,
      });

      expect(result.tenderlyUrl).toContain("dashboard.tenderly.co");
      expect(mockTenderlyRest).toHaveBeenCalledTimes(1);
      expect(mockSimulateV1).not.toHaveBeenCalled();
    });

    it("passes shareable through to Tenderly", async () => {
      mockTenderlyRest.mockResolvedValueOnce({ logs: [] });

      await executeSimulation({
        config: bothBackends(),
        chainId: 1,
        transactions: txs,
        shareable: true,
      });

      expect(mockTenderlyRest.mock.calls[0]![0].shareable).toBe(true);
    });

    it("allocates 60% of timeoutMs to Tenderly (budget-ratio pin)", async () => {
      // Spy on AbortSignal.timeout to assert the exact ms passed — pins the
      // ratio numerically so changing TENDERLY_BUDGET_RATIO produces a failing
      // test instead of silently shifting the split.
      const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
      try {
        mockTenderlyRest.mockResolvedValueOnce({ logs: [] });

        await executeSimulation({
          config: bothBackends(10_000),
          chainId: 1,
          transactions: txs,
          shareable: false,
        });

        // Tenderly's AbortSignal.timeout was called with floor(10000 * 0.6) = 6000.
        expect(timeoutSpy).toHaveBeenCalledWith(6000);
      } finally {
        timeoutSpy.mockRestore();
      }
    });

    it("falls back to simulateV1 when Tenderly throws ExternalServiceError", async () => {
      mockTenderlyRest.mockRejectedValueOnce(
        new ExternalServiceError("Tenderly 502"),
      );
      mockSimulateV1.mockResolvedValueOnce({ logs: [] });

      const result = await executeSimulation({
        config: bothBackends(),
        chainId: 1,
        transactions: txs,
        shareable: false,
      });

      expect(result.tenderlyUrl).toBeUndefined();
      expect(mockSimulateV1).toHaveBeenCalledTimes(1);
    });

    it("does NOT fall back when Tenderly throws SimulationRevertedError", async () => {
      mockTenderlyRest.mockRejectedValueOnce(
        new SimulationRevertedError("reverted"),
      );

      await expect(
        executeSimulation({
          config: bothBackends(),
          chainId: 1,
          transactions: txs,
          shareable: false,
        }),
      ).rejects.toThrow(SimulationRevertedError);

      expect(mockSimulateV1).not.toHaveBeenCalled();
    });

    it("throws when both backends are unavailable", async () => {
      mockTenderlyRest.mockRejectedValueOnce(
        new ExternalServiceError("Tenderly down"),
      );
      mockSimulateV1.mockRejectedValueOnce(
        new ExternalServiceError("RPC down"),
      );

      await expect(
        executeSimulation({
          config: bothBackends(),
          chainId: 1,
          transactions: txs,
          shareable: false,
        }),
      ).rejects.toThrow(ExternalServiceError);
    });

    it("still attempts fallback with a minimum budget when Tenderly ate the whole timeout", async () => {
      // Even with a 1 ms total budget, the fallback must still be tried —
      // otherwise a slow-Tenderly failure mode becomes a total outage. This
      // test pins the MIN_BUDGET_MS behavior in execute-simulation.ts.
      mockTenderlyRest.mockRejectedValueOnce(
        new ExternalServiceError("Tenderly timeout"),
      );
      mockSimulateV1.mockResolvedValueOnce({ logs: [] });

      const result = await executeSimulation({
        config: bothBackends(1),
        chainId: 1,
        transactions: txs,
        shareable: false,
      });

      expect(result).toBeDefined();
      expect(mockSimulateV1).toHaveBeenCalledTimes(1);
    });
  },
);

describe.sequential(
  "executeSimulation — Tenderly only (no simulateV1Url for chain)",
  () => {
    const tenderlyOnly: SimulationConfig = {
      ...bothBackends(),
      chains: new Map([[1, {}]]), // no simulateV1Url
    };

    it("returns Tenderly result on success", async () => {
      mockTenderlyRest.mockResolvedValueOnce({ logs: [] });
      const result = await executeSimulation({
        config: tenderlyOnly,
        chainId: 1,
        transactions: txs,
        shareable: false,
      });
      expect(result).toBeDefined();
      expect(mockSimulateV1).not.toHaveBeenCalled();
    });

    it("does NOT fall back when Tenderly fails and no simulateV1Url", async () => {
      mockTenderlyRest.mockRejectedValueOnce(
        new ExternalServiceError("Tenderly down"),
      );
      await expect(
        executeSimulation({
          config: tenderlyOnly,
          chainId: 1,
          transactions: txs,
          shareable: false,
        }),
      ).rejects.toThrow(ExternalServiceError);
      expect(mockSimulateV1).not.toHaveBeenCalled();
    });
  },
);

describe.sequential(
  "executeSimulation — simulateV1 only (chain not in Tenderly)",
  () => {
    const simV1Only: SimulationConfig = {
      ...bothBackends(),
      tenderlyRest: {
        ...bothBackends().tenderlyRest!,
        supportedChainIds: new Set(),
      },
    };

    it("uses simulateV1 directly without touching Tenderly", async () => {
      mockSimulateV1.mockResolvedValueOnce({ logs: [] });
      await executeSimulation({
        config: simV1Only,
        chainId: 1,
        transactions: txs,
        shareable: false,
      });
      expect(mockTenderlyRest).not.toHaveBeenCalled();
      expect(mockSimulateV1).toHaveBeenCalledTimes(1);
    });
  },
);

describe.sequential("executeSimulation — no backend available", () => {
  it("throws UnsupportedChainError", async () => {
    await expect(
      executeSimulation({
        config: { chains: new Map() }, // no tenderlyRest, no chain entry
        chainId: 1,
        transactions: txs,
        shareable: false,
      }),
    ).rejects.toThrow(UnsupportedChainError);
  });
});
