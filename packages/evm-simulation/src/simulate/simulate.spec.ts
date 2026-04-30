import { getChainAddresses } from "@morpho-org/blue-sdk";
import { type Address, type Hex, zeroAddress } from "viem";
import { vi } from "vitest";

import type {
  RawLog,
  RawSimulationResult,
  SimulateParams,
  SimulationAuthorization,
  SimulationConfig,
} from "../types.js";
import type { simulateV1 } from "./backends/eth-simulate-v1.js";
import type { simulateTenderlyRest } from "./backends/tenderly-rest.js";

import {
  BlacklistViolationError,
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
  UnsupportedChainError,
} from "../errors.js";
import { makeTransferLog } from "../test-helpers/index.js";
import { simulate } from "./simulate.js";

const mockTenderlyRest = vi.fn<typeof simulateTenderlyRest>();
const mockSimulateV1 = vi.fn<typeof simulateV1>();

vi.mock("./backends/tenderly-rest", () => ({
  simulateTenderlyRest: (
    ...args: Parameters<typeof simulateTenderlyRest>
  ): Promise<RawSimulationResult> => mockTenderlyRest(...args),
}));

vi.mock("./backends/eth-simulate-v1", () => ({
  simulateV1: (
    ...args: Parameters<typeof simulateV1>
  ): Promise<RawSimulationResult> => mockSimulateV1(...args),
}));

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const SPENDER: Address = "0x3333333333333333333333333333333333333333";

function makeSuccessResult(
  logs: RawLog[] = [],
  tenderlyUrl?: string,
): RawSimulationResult {
  return { logs, tenderlyUrl };
}

function makeConfig(
  overrides: Partial<SimulationConfig> = {},
): SimulationConfig {
  return {
    chains: new Map([[1, { simulateV1Url: "http://localhost:8545" }]]),
    tenderlyRest: {
      apiBaseUrl: "https://api.tenderly.co",
      accessToken: "test-token",
      accountSlug: "test-account",
      projectSlug: "test-project",
      supportedChainIds: new Set([1]),
    },
    timeoutMs: 5000,
    ...overrides,
  };
}

function makeParams(overrides: Partial<SimulateParams> = {}): SimulateParams {
  return {
    chainId: 1,
    transactions: [{ from: USER, to: VAULT, data: "0x12345678" as Hex }],
    blockNumber: 20000000n,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe.sequential("simulate — success", () => {
  it("returns transfers, simulationTxs, and tenderlyUrl when shareable=true", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    mockTenderlyRest.mockResolvedValueOnce(
      makeSuccessResult(
        logs,
        "https://dashboard.tenderly.co/shared/simulation/abc123",
      ),
    );

    const params = makeParams();
    const result = await simulate(makeConfig(), params, { shareable: true });

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0]!.amount).toBe(1000000n);
    expect(result.tenderlyUrl).toBe(
      "https://dashboard.tenderly.co/shared/simulation/abc123",
    );
    expect(result.simulationTxs).toEqual(params.transactions);
  });

  it("defaults shareable to false", async () => {
    mockTenderlyRest.mockResolvedValueOnce(makeSuccessResult([]));

    await simulate(makeConfig(), makeParams());

    const callArgs = mockTenderlyRest.mock.calls[0]![0];
    expect(callArgs.shareable).toBe(false);
  });

  it("passes shareable: true through to the Tenderly backend", async () => {
    mockTenderlyRest.mockResolvedValueOnce(makeSuccessResult([]));

    await simulate(makeConfig(), makeParams(), { shareable: true });

    const callArgs = mockTenderlyRest.mock.calls[0]![0];
    expect(callArgs.shareable).toBe(true);
  });

  it("throws BlacklistViolationError end-to-end when backend logs show bundler retention", async () => {
    // Pin the pipeline wiring: simulate() must invoke assertNoBundlerRetention
    // on the parsed transfers and surface BlacklistViolationError. Without
    // this end-to-end test, a regression that bypasses the retention stage
    // wouldn't be caught — unit tests of assertNoBundlerRetention alone can't
    // verify the orchestrator calls it.
    const BUNDLER = getChainAddresses(1).bundler3.bundler3;
    const logs = [
      makeTransferLog({
        token: USDC,
        from: USER,
        to: BUNDLER,
        amount: 1_000_000n,
      }),
    ];
    mockTenderlyRest.mockResolvedValueOnce(makeSuccessResult(logs));

    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      BlacklistViolationError,
    );
  });
});

describe.sequential("simulate — authorizations", () => {
  it("resolves signature authorizations into prepended approve() calls", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    mockTenderlyRest.mockResolvedValueOnce(makeSuccessResult(logs));

    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: SPENDER },
    ];
    const result = await simulate(
      makeConfig(),
      makeParams({ authorizations: auths }),
    );

    // Tenderly sees 2 txs: approve + main
    const callArgs = mockTenderlyRest.mock.calls[0]![0];
    expect(callArgs.transactions.length).toBe(2);
    // simulationTxs in the return reflects the same
    expect(result.simulationTxs.length).toBe(2);
  });

  it("simulates directly (1 tx to Tenderly) without authorizations", async () => {
    mockTenderlyRest.mockResolvedValueOnce(makeSuccessResult([]));

    const result = await simulate(makeConfig(), makeParams());
    expect(result.transfers).toEqual([]);

    const callArgs = mockTenderlyRest.mock.calls[0]![0];
    expect(callArgs.transactions.length).toBe(1);
  });

  it("passes approval-type authorization txs through as-is (USDT-style reset)", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    mockTenderlyRest.mockResolvedValueOnce(makeSuccessResult(logs));

    const resetApproveTx = {
      from: USER,
      to: USDC,
      data: ("0x095ea7b30000000000000000000000003333333333333333333333333333333333333333" +
        "0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`,
    };
    const approveTx = {
      from: USER,
      to: USDC,
      data: ("0x095ea7b30000000000000000000000003333333333333333333333333333333333333333" +
        "00000000000000000000000000000000000000000000000000000000000f4240") as `0x${string}`,
    };

    const auths: SimulationAuthorization[] = [
      { type: "approval", transaction: resetApproveTx },
      { type: "approval", transaction: approveTx },
    ];

    const result = await simulate(
      makeConfig(),
      makeParams({ authorizations: auths }),
    );

    expect(result.transfers).toHaveLength(1);
    // 2 approval txs + 1 main tx = 3 transactions
    const callArgs = mockTenderlyRest.mock.calls[0]![0];
    expect(callArgs.transactions.length).toBe(3);
  });
});

describe.sequential("simulate — error handling", () => {
  it("throws SimulationRevertedError on revert", async () => {
    mockTenderlyRest.mockRejectedValueOnce(
      new SimulationRevertedError("ERC20: transfer amount exceeds balance"),
    );

    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      SimulationRevertedError,
    );
  });

  it("throws ExternalServiceError when all services are down", async () => {
    mockTenderlyRest.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly down"),
    );
    mockSimulateV1.mockRejectedValueOnce(new ExternalServiceError("RPC down"));

    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      ExternalServiceError,
    );
  });

  it("throws SimulationRevertedError even when signature authorizations are present", async () => {
    mockTenderlyRest.mockRejectedValueOnce(
      new SimulationRevertedError("USDT revert"),
    );

    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: SPENDER },
    ];

    await expect(
      simulate(makeConfig(), makeParams({ authorizations: auths })),
    ).rejects.toThrow(SimulationRevertedError);

    expect(mockTenderlyRest).toHaveBeenCalledTimes(1);
  });
});

describe.sequential("simulate — backend fallback", () => {
  it("falls back to eth_simulateV1 when Tenderly fails", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    mockTenderlyRest.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly 502"),
    );
    mockSimulateV1.mockResolvedValueOnce(makeSuccessResult(logs));

    const result = await simulate(makeConfig(), makeParams());

    expect(result.transfers).toHaveLength(1);
    expect(result.tenderlyUrl).toBeUndefined();
    expect(mockSimulateV1).toHaveBeenCalled();
  });

  it("falls back successfully when Tenderly times out within budget", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 500000n }),
    ];
    mockTenderlyRest.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly timeout"),
    );
    mockSimulateV1.mockResolvedValueOnce(makeSuccessResult(logs));

    const result = await simulate(
      makeConfig({ timeoutMs: 10000 }),
      makeParams(),
    );

    expect(result.transfers).toHaveLength(1);
    expect(mockSimulateV1).toHaveBeenCalled();
  });

  it("still attempts fallback even when Tenderly ate the whole time budget", async () => {
    // FALLBACK_MIN_BUDGET_MS in execute-simulation.ts guarantees the fallback
    // gets a viable window even when Tenderly consumed timeoutMs. Without
    // that floor, a slow-Tenderly failure becomes a total outage.
    mockTenderlyRest.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly timeout"),
    );
    mockSimulateV1.mockResolvedValueOnce(makeSuccessResult([]));

    const result = await simulate(makeConfig({ timeoutMs: 1 }), makeParams());

    expect(result).toBeDefined();
    expect(mockSimulateV1).toHaveBeenCalledTimes(1);
  });

  it("uses Tenderly only when no simulateV1Url for chain", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    mockTenderlyRest.mockResolvedValueOnce(
      makeSuccessResult(logs, "https://tenderly.co/sim/123"),
    );

    const config = makeConfig({
      chains: new Map([[1, {}]]), // no simulateV1Url
    });
    const result = await simulate(config, makeParams(), { shareable: true });

    expect(result.transfers).toHaveLength(1);
    expect(mockSimulateV1).not.toHaveBeenCalled();
  });

  it("uses simulateV1 directly when chain not in Tenderly", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    mockSimulateV1.mockResolvedValueOnce(makeSuccessResult(logs));

    const config = makeConfig({
      tenderlyRest: {
        ...makeConfig().tenderlyRest!,
        supportedChainIds: new Set(), // no chains
      },
    });
    const result = await simulate(config, makeParams());

    expect(result.transfers).toHaveLength(1);
    expect(result.tenderlyUrl).toBeUndefined();
    expect(mockTenderlyRest).not.toHaveBeenCalled();
    expect(mockSimulateV1).toHaveBeenCalled();
  });
});

describe.sequential("simulate — validation", () => {
  it("throws UnsupportedChainError for unknown chain", async () => {
    await expect(
      simulate(makeConfig(), makeParams({ chainId: 999999 })),
    ).rejects.toThrow(UnsupportedChainError);
  });

  it("throws SimulationValidationError for zero-address token in signature auth", async () => {
    const auths: SimulationAuthorization[] = [
      { type: "signature", token: zeroAddress, spender: SPENDER },
    ];
    await expect(
      simulate(makeConfig(), makeParams({ authorizations: auths })),
    ).rejects.toThrow(SimulationValidationError);
  });

  it("throws SimulationValidationError for zero-address spender in signature auth", async () => {
    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: zeroAddress },
    ];
    await expect(
      simulate(makeConfig(), makeParams({ authorizations: auths })),
    ).rejects.toThrow(SimulationValidationError);
  });

  it("throws SimulationValidationError for empty transactions", async () => {
    await expect(
      simulate(makeConfig(), makeParams({ transactions: [] })),
    ).rejects.toThrow(SimulationValidationError);
  });

  it("throws SimulationValidationError for transactions with different senders", async () => {
    await expect(
      simulate(
        makeConfig(),
        makeParams({
          transactions: [
            { from: USER, to: VAULT, data: "0x12345678" as Hex },
            { from: SPENDER, to: VAULT, data: "0xabcdef00" as Hex },
          ],
        }),
      ),
    ).rejects.toThrow(SimulationValidationError);
  });

  it("accepts mixed-case from addresses that checksum to the same address", async () => {
    mockTenderlyRest.mockResolvedValueOnce(makeSuccessResult([]));

    // Real mixed-case address — checksum form vs lowercase differ byte-for-byte,
    // so the case-normalization path is actually exercised.
    const checksum: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const lower = checksum.toLowerCase() as Address;
    expect(checksum).not.toBe(lower); // sanity

    await expect(
      simulate(
        makeConfig(),
        makeParams({
          transactions: [
            { from: checksum, to: VAULT, data: "0x12345678" as Hex },
            { from: lower, to: VAULT, data: "0xabcdef00" as Hex },
          ],
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("throws SimulationValidationError (not a raw viem error) for malformed from", async () => {
    await expect(
      simulate(
        makeConfig(),
        makeParams({
          transactions: [
            {
              from: "0xnotanaddress" as Address,
              to: VAULT,
              data: "0x12345678" as Hex,
            },
          ],
        }),
      ),
    ).rejects.toThrow(SimulationValidationError);
  });

  it("throws SimulationValidationError for transaction with zero-address to", async () => {
    await expect(
      simulate(
        makeConfig(),
        makeParams({
          transactions: [
            { from: USER, to: zeroAddress, data: "0x12345678" as Hex },
          ],
        }),
      ),
    ).rejects.toThrow(SimulationValidationError);
  });
});

describe.sequential("simulate — timeout", () => {
  it("throws ExternalServiceError when simulation exceeds timeoutMs", async () => {
    mockTenderlyRest.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      throw new ExternalServiceError("timeout");
    });
    mockSimulateV1.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      throw new ExternalServiceError("timeout");
    });

    await expect(
      simulate(makeConfig({ timeoutMs: 1 }), makeParams()),
    ).rejects.toThrow(ExternalServiceError);
  });
});
