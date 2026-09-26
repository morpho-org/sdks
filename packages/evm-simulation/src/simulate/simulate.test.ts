import { type Address, getAddress, type Hex } from "viem";
import { vi } from "vitest";
import type { SimulationAuthorization } from "../domain/authorizations.js";
import type { SimulateParams } from "../domain/request.js";
import type { VerifiedSimulationResult } from "../domain/result.js";
import {
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
  UnsupportedChainError,
} from "../errors.js";
import type { SimulationConfig } from "../types.js";
import type { runPipeline } from "./pipeline/run-pipeline.js";
import { simulate } from "./simulate.js";

const mockRunPipeline = vi.fn<typeof runPipeline>();

vi.mock("./pipeline/run-pipeline.js", () => ({
  runPipeline: (
    ...args: Parameters<typeof runPipeline>
  ): ReturnType<typeof runPipeline> => mockRunPipeline(...args),
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
      stateBlockNumber: 1n,
      stateBlockHash: `0x${"ab".repeat(32)}` as Hex,
      stateBlockTimestamp: 1n,
      blockNumber: 2n,
      blockTimestamp: 1n,
      mode: "final",
      authorizations: [],
      limits: {
        maxSlippageWad: 0n,
        minLltvBufferWad: 0n,
        maxSignatureLifetimeSeconds: 0n,
        wallet: { maxDebit: [], minCredit: [] },
        operations: [],
      },
      operations: [],
      before: {
        wallet: [],
        permissions: [],
        positions: [],
        vaults: [],
        markets: [],
      },
      after: {
        wallet: [],
        permissions: [],
        positions: [],
        vaults: [],
        markets: [],
      },
      diff: {
        wallet: [],
        permissions: [],
        positions: [],
        vaults: [],
        markets: [],
      },
      actionDiff: {
        wallet: [],
        permissions: [],
        positions: [],
        vaults: [],
        markets: [],
      },
      assetChanges: [],
      conversions: [],
      fees: [],
      permissionEvidence: [],
    },
  } as VerifiedSimulationResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRunPipeline.mockResolvedValue(makeResult());
});

describe.sequential("simulate — pipeline delegation", () => {
  it("delegates to runPipeline with the parsed request and config", async () => {
    const result = await simulate(makeConfig(), makeParams());
    expect(result).toEqual(makeResult());
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    const arg = mockRunPipeline.mock.calls[0]![0];
    expect(arg.config).toEqual(makeConfig());
    expect(arg.request.chainId).toBe(1);
  });

  it("defaults to final mode", async () => {
    await simulate(makeConfig(), makeParams());
    expect(mockRunPipeline.mock.calls[0]![0].request.mode ?? "final").toBe(
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
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  it("limits execute through the pipeline", async () => {
    const result = await simulate(
      makeConfig(),
      makeParams({ limits: { maxSlippageWad: 1n } }),
    );
    expect(result).toEqual(makeResult());
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
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
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  it("final mode with authorizations throws SimulationValidationError", async () => {
    await expect(
      simulate(makeConfig(), makeParams({ authorizations: [] } as never)),
    ).rejects.toThrow(SimulationValidationError);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });
});

describe.sequential("simulate — error propagation", () => {
  it("propagates SimulationRevertedError from the pipeline", async () => {
    mockRunPipeline.mockRejectedValueOnce(
      new SimulationRevertedError("ERC20: transfer amount exceeds balance"),
    );
    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      SimulationRevertedError,
    );
  });

  it("propagates ExternalServiceError", async () => {
    mockRunPipeline.mockRejectedValueOnce(new ExternalServiceError("RPC down"));
    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      ExternalServiceError,
    );
  });

  it("propagates UnsupportedChainError", async () => {
    mockRunPipeline.mockRejectedValueOnce(new UnsupportedChainError(999999));
    await expect(
      simulate(makeConfig(), makeParams({ chainId: 999999 })),
    ).rejects.toThrow(UnsupportedChainError);
  });
});
