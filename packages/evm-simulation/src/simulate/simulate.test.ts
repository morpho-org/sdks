import { type Address, getAddress, type Hex } from "viem";
import { vi } from "vitest";
import type { SimulationAuthorization } from "../authorizations.js";
import {
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
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
    const result = await simulate(makeConfig(), makeParams({ limits: {} }));
    expect(result).toEqual(makeResult());
    expect(mockRunSimulation).toHaveBeenCalledTimes(1);
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

  it("final mode with authorizations throws SimulationValidationError", async () => {
    await expect(
      simulate(makeConfig(), makeParams({ authorizations: [] } as never)),
    ).rejects.toThrow(SimulationValidationError);
    expect(mockRunSimulation).not.toHaveBeenCalled();
  });
});

describe.sequential("simulate — error propagation", () => {
  it("propagates SimulationRevertedError from the pipeline", async () => {
    mockRunSimulation.mockRejectedValueOnce(
      new SimulationRevertedError("ERC20: transfer amount exceeds balance"),
    );
    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      SimulationRevertedError,
    );
  });

  it("propagates ExternalServiceError", async () => {
    mockRunSimulation.mockRejectedValueOnce(
      new ExternalServiceError("RPC down"),
    );
    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      ExternalServiceError,
    );
  });

  it("propagates UnsupportedChainError", async () => {
    mockRunSimulation.mockRejectedValueOnce(new UnsupportedChainError(999999));
    await expect(
      simulate(makeConfig(), makeParams({ chainId: 999999 })),
    ).rejects.toThrow(UnsupportedChainError);
  });
});
