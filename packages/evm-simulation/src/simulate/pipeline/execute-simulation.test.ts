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
const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const txs: SimulationTransaction[] = [
  { from: USER, to: VAULT, data: "0x12" as Hex },
];

const tenderlyResult: RawSimulationResult = { calls: [], assetChanges: [] };
const fallbackResult: RawSimulationResult = { calls: [], assetChanges: [] };

function makeLogger() {
  return {
    info: vi.fn<(message: string, data?: Record<string, unknown>) => void>(),
    warn: vi.fn<(message: string, data?: Record<string, unknown>) => void>(),
    error: vi.fn<(message: string, data?: Record<string, unknown>) => void>(),
  };
}

function bothBackends(
  timeoutMs = 5000,
  logger = makeLogger(),
): SimulationConfig {
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
    logger,
    timeoutMs,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.sequential("executeSimulation — Tenderly + simulateV1 configured", () => {
  it("returns Tenderly success before the hedge without selecting a backend", async () => {
    vi.useFakeTimers();
    const logger = makeLogger();
    mockTenderlyRpc.mockResolvedValueOnce(tenderlyResult);

    await expect(
      executeSimulation({
        config: bothBackends(10_000, logger),
        chainId: 1,
        transactions: txs,
      }),
    ).resolves.toBe(tenderlyResult);

    expect(mockTenderlyRpc).toHaveBeenCalledTimes(1);
    expect(mockSimulateV1).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith(
      "Simulation backend selected",
      expect.anything(),
    );
  });

  it("passes the chain's Tenderly RPC config to the backend", async () => {
    mockTenderlyRpc.mockResolvedValueOnce(tenderlyResult);

    await executeSimulation({
      config: bothBackends(),
      chainId: 1,
      transactions: txs,
    });

    expect(mockTenderlyRpc.mock.calls[0]![0].config.rpcUrl).toBe(
      "https://mainnet.gateway.tenderly.co/key",
    );
  });

  it("starts simulateV1 at 40%, returns it if first, and aborts Tenderly", async () => {
    vi.useFakeTimers();
    const logger = makeLogger();
    const tenderly = deferred<RawSimulationResult>();
    const fallback = deferred<RawSimulationResult>();
    mockTenderlyRpc.mockReturnValueOnce(tenderly.promise);
    mockSimulateV1.mockImplementationOnce(({ signal }) => {
      signal?.addEventListener(
        "abort",
        () =>
          tenderly.reject(new ExternalServiceError("Tenderly loser aborted")),
        { once: true },
      );
      return fallback.promise;
    });

    const execution = executeSimulation({
      config: bothBackends(10_000, logger),
      chainId: 1,
      transactions: txs,
    });
    const tenderlySignal = mockTenderlyRpc.mock.calls[0]![0].signal!;

    await vi.advanceTimersByTimeAsync(3999);
    expect(mockSimulateV1).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mockSimulateV1).toHaveBeenCalledTimes(1);
    expect(tenderlySignal.aborted).toBe(false);
    fallback.resolve(fallbackResult);

    await expect(execution).resolves.toBe(fallbackResult);
    expect(tenderlySignal.aborted).toBe(true);
    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      "Tenderly simulation slow, starting eth_simulateV1 in parallel",
      { chainId: 1, hedgeDelayMs: 4000 },
    );
    expect(logger.info).toHaveBeenNthCalledWith(
      2,
      "Simulation backend selected",
      {
        chainId: 1,
        backend: "eth_simulateV1",
        fallbackReason: "tenderly_slow",
        outcome: "success",
        elapsedMs: 4000,
      },
    );
  });

  it("returns Tenderly when it resolves after the hedge and aborts the fallback", async () => {
    vi.useFakeTimers();
    const logger = makeLogger();
    const tenderly = deferred<RawSimulationResult>();
    const fallback = deferred<RawSimulationResult>();
    mockTenderlyRpc.mockReturnValueOnce(tenderly.promise);
    mockSimulateV1.mockImplementationOnce(({ signal }) => {
      signal?.addEventListener(
        "abort",
        () =>
          fallback.reject(new ExternalServiceError("Fallback loser aborted")),
        { once: true },
      );
      return fallback.promise;
    });

    const execution = executeSimulation({
      config: bothBackends(10_000, logger),
      chainId: 1,
      transactions: txs,
    });
    await vi.advanceTimersByTimeAsync(4000);
    const fallbackSignal = mockSimulateV1.mock.calls[0]![0].signal!;
    tenderly.resolve(tenderlyResult);

    await expect(execution).resolves.toBe(tenderlyResult);
    expect(fallbackSignal.aborted).toBe(true);
    expect(logger.info).toHaveBeenCalledWith("Simulation backend selected", {
      chainId: 1,
      backend: "tenderly",
      fallbackReason: "tenderly_slow",
      outcome: "success",
      elapsedMs: 4000,
    });
  });

  it("starts the fallback immediately on Tenderly ExternalServiceError", async () => {
    vi.useFakeTimers();
    const logger = makeLogger();
    mockTenderlyRpc.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly 502"),
    );
    mockSimulateV1.mockResolvedValueOnce(fallbackResult);

    const execution = executeSimulation({
      config: bothBackends(10_000, logger),
      chainId: 1,
      transactions: txs,
      wNative: WETH,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(mockSimulateV1).toHaveBeenCalledWith(
      expect.objectContaining({ wNative: WETH }),
    );
    await expect(execution).resolves.toBe(fallbackResult);

    const tenderlyWarning = logger.warn.mock.calls.find(
      ([message]) =>
        message === "Tenderly simulation failed, attempting fallback",
    );
    expect(tenderlyWarning?.[1]).toMatchObject({
      chainId: 1,
      error: "Tenderly 502",
      fallbackReason: "tenderly_error",
      elapsedMs: 0,
    });
    expect(tenderlyWarning?.[1]).not.toHaveProperty("cause");
    expect(logger.info).toHaveBeenCalledWith("Simulation backend selected", {
      chainId: 1,
      backend: "eth_simulateV1",
      fallbackReason: "tenderly_error",
      outcome: "success",
      elapsedMs: 0,
    });
  });

  it("does not fall back when Tenderly throws SimulationRevertedError", async () => {
    const revert = new SimulationRevertedError("reverted");
    mockTenderlyRpc.mockRejectedValueOnce(revert);

    await expect(
      executeSimulation({
        config: bothBackends(),
        chainId: 1,
        transactions: txs,
      }),
    ).rejects.toBe(revert);

    expect(mockSimulateV1).not.toHaveBeenCalled();
  });

  it("propagates a Tenderly revert after the hedge and aborts the fallback", async () => {
    vi.useFakeTimers();
    const logger = makeLogger();
    const tenderly = deferred<RawSimulationResult>();
    const fallback = deferred<RawSimulationResult>();
    const revert = new SimulationRevertedError("reverted");
    mockTenderlyRpc.mockReturnValueOnce(tenderly.promise);
    mockSimulateV1.mockImplementationOnce(({ signal }) => {
      signal?.addEventListener(
        "abort",
        () =>
          fallback.reject(new ExternalServiceError("Fallback loser aborted")),
        { once: true },
      );
      return fallback.promise;
    });

    const execution = executeSimulation({
      config: bothBackends(10_000, logger),
      chainId: 1,
      transactions: txs,
    });
    await vi.advanceTimersByTimeAsync(4000);
    const fallbackSignal = mockSimulateV1.mock.calls[0]![0].signal!;
    tenderly.reject(revert);

    await expect(execution).rejects.toBe(revert);
    expect(fallbackSignal.aborted).toBe(true);
    expect(logger.info).toHaveBeenCalledWith("Simulation backend selected", {
      chainId: 1,
      backend: "tenderly",
      fallbackReason: "tenderly_slow",
      outcome: "error",
      elapsedMs: 4000,
    });
  });

  it("waits for Tenderly when the fallback fails with ExternalServiceError", async () => {
    vi.useFakeTimers();
    const tenderly = deferred<RawSimulationResult>();
    const fallbackError = new ExternalServiceError("RPC down");
    mockTenderlyRpc.mockReturnValueOnce(tenderly.promise);
    mockSimulateV1.mockRejectedValueOnce(fallbackError);

    let settled = false;
    const execution = executeSimulation({
      config: bothBackends(10_000),
      chainId: 1,
      transactions: txs,
    }).then(
      (result) => {
        settled = true;
        return result;
      },
      (error: unknown) => {
        settled = true;
        throw error;
      },
    );

    await vi.advanceTimersByTimeAsync(4000);
    expect(settled).toBe(false);
    tenderly.resolve(tenderlyResult);

    await expect(execution).resolves.toBe(tenderlyResult);
  });

  it("throws the fallback error when both backends fail with ExternalServiceError", async () => {
    const logger = makeLogger();
    const fallbackError = new ExternalServiceError("RPC down");
    mockTenderlyRpc.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly down"),
    );
    mockSimulateV1.mockRejectedValueOnce(fallbackError);

    await expect(
      executeSimulation({
        config: bothBackends(10_000, logger),
        chainId: 1,
        transactions: txs,
      }),
    ).rejects.toBe(fallbackError);

    expect(logger.warn).toHaveBeenCalledWith("Simulation fallback failed", {
      chainId: 1,
      fallbackReason: "tenderly_error",
      error: "RPC down",
      elapsedMs: 0,
    });
  });

  it("gives the fallback at least 1500ms when Tenderly fails at the deadline", async () => {
    vi.useFakeTimers();
    const timeoutMs = 10_000;
    const start = Date.now();
    const tenderlyError = new ExternalServiceError("Tenderly timeout");
    const fallbackError = new ExternalServiceError("Fallback timeout");
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(start)
      .mockReturnValueOnce(start + timeoutMs);
    mockTenderlyRpc.mockImplementationOnce(
      ({ signal }) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(tenderlyError), {
            once: true,
          });
        }),
    );
    mockSimulateV1.mockImplementationOnce(
      ({ signal }) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(fallbackError), {
            once: true,
          });
        }),
    );

    const execution = executeSimulation({
      config: bothBackends(timeoutMs),
      chainId: 1,
      transactions: txs,
    });
    const rejection = expect(execution).rejects.toBe(fallbackError);
    await vi.advanceTimersByTimeAsync(4000);
    expect(timeoutSpy).toHaveBeenCalledWith(1500);
    await vi.advanceTimersByTimeAsync(6000);
    await rejection;
  });
});

describe.sequential("executeSimulation — Tenderly only", () => {
  it("uses the full timeoutMs budget", async () => {
    const logger = makeLogger();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    mockTenderlyRpc.mockResolvedValueOnce(tenderlyResult);

    await executeSimulation({
      config: {
        chains: new Map([
          [1, { tenderlyRpc: { rpcUrl: "https://gateway.tenderly.co/key" } }],
        ]),
        logger,
        timeoutMs: 10_000,
      },
      chainId: 1,
      transactions: txs,
    });

    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    expect(mockSimulateV1).not.toHaveBeenCalled();
  });

  it("does not fall back when Tenderly fails and no fallback is configured", async () => {
    const logger = makeLogger();
    mockTenderlyRpc.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly down"),
    );

    await expect(
      executeSimulation({
        config: {
          chains: new Map([
            [1, { tenderlyRpc: { rpcUrl: "https://gateway.tenderly.co/key" } }],
          ]),
          logger,
        },
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
    logger: makeLogger(),
  };

  it("uses simulateV1 directly without touching Tenderly", async () => {
    mockSimulateV1.mockResolvedValueOnce(tenderlyResult);

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
    mockSimulateV1.mockResolvedValueOnce(tenderlyResult);

    await executeSimulation({
      config: simV1Only,
      chainId: 1,
      transactions: txs,
    });

    expect(timeoutSpy).toHaveBeenCalledWith(5000);
  });
});

describe.sequential("executeSimulation — no backend available", () => {
  it("throws UnsupportedChainError", async () => {
    await expect(
      executeSimulation({
        config: { chains: new Map(), logger: makeLogger() },
        chainId: 1,
        transactions: txs,
      }),
    ).rejects.toThrow(UnsupportedChainError);
  });
});
