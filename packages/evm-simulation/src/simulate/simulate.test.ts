import { type Address, BaseError, getAddress, type Hex } from "viem";
import { vi } from "vitest";
import type { SimulationAuthorization } from "../authorizations.js";
import {
  RpcTransportError,
  SimulationRevertedError,
  SimulationValidationError,
  UnexpectedSimulationError,
  UnsupportedChainError,
} from "../errors.js";
import type { SimulateParams } from "../params.js";
import type { VerifiedSimulationResult } from "../result.js";
import type { SimulationConfig } from "../types.js";
import type { runSimulation } from "./run-simulation.js";
import { simulate } from "./simulate.js";

const mockRunSimulation = vi.fn<typeof runSimulation>();

vi.mock("./run-simulation.js", () => ({
  runSimulation: (
    ...args: Parameters<typeof runSimulation>
  ): ReturnType<typeof runSimulation> => mockRunSimulation(...args),
}));

const USDC: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const USER: Address = getAddress("0x1111111111111111111111111111111111111111");
const VAULT: Address = getAddress("0x2222222222222222222222222222222222222222");
const SPENDER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);

function makeConfig(
  overrides: Partial<SimulationConfig> = {},
): SimulationConfig {
  return {
    chains: new Map([[1, { simulateV1Url: "http://localhost:8545" }]]),
    timeoutMs: 5000,
    ...overrides,
  };
}

function makeParams(overrides: object = {}): SimulateParams {
  return {
    chainId: 1,
    transactions: [{ from: USER, to: VAULT, data: "0x12345678" as Hex }],
    blockNumber: 20000000n,
    limits: "none",
    ...overrides,
  } as SimulateParams;
}

function makeResult(): VerifiedSimulationResult {
  return {
    simulationTxs: [],
    calls: [],
    transfers: [],
    assetChanges: [],
    verification: {
      chainId: 1,
      blockNumber: 2n,
      blockTimestamp: 1n,
      mode: "final",
      authorizations: [],
      limits: {
        operations: [],
      },
      operations: [],
    },
  } as unknown as VerifiedSimulationResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRunSimulation.mockResolvedValue(makeResult());
});

describe.sequential("simulate — pipeline delegation", () => {
  it("delegates to runSimulation with the parsed request and config", async () => {
    const result = await simulate(makeConfig(), makeParams());
    expect(result).toEqual(makeResult());
    expect(mockRunSimulation).toHaveBeenCalledTimes(1);
    const arg = mockRunSimulation.mock.calls[0]![0];
    expect(arg.config).toEqual(makeConfig());
    expect(arg.request.chainId).toBe(1);
  });

  it("defaults to final mode", async () => {
    await simulate(makeConfig(), makeParams());
    expect(mockRunSimulation.mock.calls[0]![0].request.mode ?? "final").toBe(
      "final",
    );
  });

  it.each(["preview", "final"] as const)(
    "passes caller state overrides through in %s mode without freezing inputs",
    async (mode) => {
      const stateOverrides = {
        [USER]: { code: `0xef0100${SPENDER.slice(2)}` },
        [SPENDER]: { code: "0x60005460005260206000f3" },
      };
      await simulate(makeConfig(), makeParams({ mode, stateOverrides }));
      const request = mockRunSimulation.mock.calls[0]![0].request;
      expect(request).toMatchObject({ stateOverrides });
      expect(Object.isFrozen(stateOverrides)).toBe(false);
      expect(Object.isFrozen(stateOverrides[USER])).toBe(false);
    },
  );

  it("preview without authorizations executes", async () => {
    const result = await simulate(
      makeConfig(),
      makeParams({ mode: "preview" }),
    );
    expect(result).toEqual(makeResult());
  });

  it("preview with authorizations executes through the pipeline", async () => {
    const authorizations: SimulationAuthorization[] = [
      {
        type: "erc20Approval",
        token: USDC,
        owner: USER,
        spender: SPENDER,
        amount: 100n,
      },
    ];
    const result = await simulate(
      makeConfig(),
      makeParams({ mode: "preview", authorizations }),
    );
    expect(result).toEqual(makeResult());
    expect(mockRunSimulation).toHaveBeenCalledTimes(1);
  });

  it("limits execute through the pipeline", async () => {
    const result = await simulate(
      makeConfig(),
      makeParams({
        limits: {
          operations: [
            {
              type: "vaultV2Deposit",
              vault: VAULT,
              quote: { sharesMinted: 1n, assetsPaid: 1n },
            },
          ],
        },
      }),
    );
    expect(result).toEqual(makeResult());
    expect(mockRunSimulation).toHaveBeenCalledTimes(1);
  });

  it("missing limits throws SimulationValidationError", async () => {
    await expect(
      simulate(makeConfig(), makeParams({ limits: undefined } as never)),
    ).rejects.toThrow(SimulationValidationError);
    expect(mockRunSimulation).not.toHaveBeenCalled();
  });

  it("legacy signature authorization variant throws SimulationValidationError", async () => {
    await expect(
      simulate(
        makeConfig(),
        makeParams({
          mode: "preview",
          authorizations: [
            { type: "signature", token: USDC, spender: SPENDER },
          ],
        }),
      ),
    ).rejects.toThrow(SimulationValidationError);
    expect(mockRunSimulation).not.toHaveBeenCalled();
  });

  it("final mode accepts authorization descriptors", async () => {
    await expect(
      simulate(makeConfig(), makeParams({ authorizations: [] } as never)),
    ).resolves.toBeDefined();
    expect(mockRunSimulation).toHaveBeenCalled();
  });
});

describe.sequential("simulate — error propagation", () => {
  it("wraps non-cloneable override failures at the public boundary", async () => {
    const error = await simulate(
      makeConfig(),
      makeParams({
        stateOverrides: { [USDC]: { code: () => "0x6000" } } as never,
      }),
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(UnexpectedSimulationError);
    expect((error as UnexpectedSimulationError).cause).toBeInstanceOf(
      DOMException,
    );
    expect(mockRunSimulation).not.toHaveBeenCalled();
  });

  it("propagates SimulationRevertedError from the pipeline", async () => {
    mockRunSimulation.mockRejectedValueOnce(
      new SimulationRevertedError("ERC20: transfer amount exceeds balance"),
    );
    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      SimulationRevertedError,
    );
  });

  it.each([
    new RpcTransportError("RPC failed"),
    new SimulationRevertedError("reverted", "0xdeadbeef"),
    new UnsupportedChainError(999999),
  ])(
    "preserves $name and never returns a transaction on failure",
    async (error) => {
      mockRunSimulation.mockRejectedValueOnce(error);
      const returnTransaction = vi.fn();
      await expect(
        simulate(makeConfig(), makeParams()).then(returnTransaction),
      ).rejects.toBe(error);
      expect(returnTransaction).not.toHaveBeenCalled();
      expect(mockRunSimulation).toHaveBeenCalledTimes(1);
    },
  );

  it("wraps local viem errors with UnexpectedSimulationError, not RpcTransportError", async () => {
    const cause = new BaseError("Address is invalid.");
    mockRunSimulation.mockRejectedValueOnce(cause);
    const error = await simulate(makeConfig(), makeParams()).catch(
      (value: unknown) => value,
    );
    expect(error).toBeInstanceOf(UnexpectedSimulationError);
    expect((error as UnexpectedSimulationError).cause).toBe(cause);
  });

  it.each([
    new Error("private diagnostic"),
    "private diagnostic",
    null,
    undefined,
  ])(
    "wraps unexpected failures and preserves the original cause",
    async (cause) => {
      mockRunSimulation.mockRejectedValueOnce(cause);
      const error = await simulate(makeConfig(), makeParams()).catch(
        (value: unknown) => value,
      );
      expect(error).toBeInstanceOf(UnexpectedSimulationError);
      expect((error as UnexpectedSimulationError).cause).toBe(cause);
      expect((error as UnexpectedSimulationError).message).toBe(
        "Simulation failed unexpectedly.",
      );
      expect(mockRunSimulation).toHaveBeenCalledTimes(1);
    },
  );

  it("propagates UnsupportedChainError", async () => {
    mockRunSimulation.mockRejectedValueOnce(new UnsupportedChainError(999999));
    await expect(
      simulate(makeConfig(), makeParams({ chainId: 999999 })),
    ).rejects.toThrow(UnsupportedChainError);
  });
});
