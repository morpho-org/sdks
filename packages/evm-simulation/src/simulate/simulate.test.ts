import { getChainAddresses } from "@morpho-org/blue-sdk";
import { type Address, getAddress, type Hex, zeroAddress } from "viem";
import { vi } from "vitest";
import {
  BlacklistViolationError,
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
  UnsupportedChainError,
} from "../errors.js";
import type { SimulateParams } from "../params.js";
import {
  encodeUint256,
  makeTransferLog,
  padAddress,
} from "../test-helpers/index.js";
import type { RawLog, SimulationConfig } from "../types.js";
import type { SimulationExecution } from "./backends/parse-response.js";
import { WITHDRAWAL_TOPIC } from "./parsing/transfers.js";
import type { executeSimulation } from "./pipeline/execute-simulation.js";
import type { ExecutionPlan } from "./plan/plan-execution.js";
import { simulate } from "./simulate.js";

const mockExecuteSimulation = vi.fn<typeof executeSimulation>();

vi.mock("./pipeline/execute-simulation.js", () => ({
  executeSimulation: (
    ...args: Parameters<typeof executeSimulation>
  ): Promise<SimulationExecution> => mockExecuteSimulation(...args),
}));

const USDC: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const USER: Address = getAddress("0x1111111111111111111111111111111111111111");
const VAULT: Address = getAddress("0x2222222222222222222222222222222222222222");
const SPENDER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);

/**
 * Build an execution for a plan: one executed transaction per user call.
 */
function makeExecution(
  plan: ExecutionPlan,
  userLogs: RawLog[][] = [],
): SimulationExecution {
  const transactions = plan.calls.map((planned) => ({
    transactionIndex: planned.transactionIndex,
    result: {
      logs: userLogs[planned.transactionIndex] ?? [],
      status: true,
      returnData: "0x" as Hex,
      gasUsed: 0n,
    },
  }));
  return {
    plan,
    block: {
      chainId: plan.request.chainId,
      stateBlockNumber: 1n,
      stateBlockHash: `0x${"ab".repeat(32)}` as Hex,
      stateBlockTimestamp: 1_700_000_000n,
      blockNumber: 2n,
      blockTimestamp: 1_700_000_012n,
    },
    transactions,
  };
}

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

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteSimulation.mockImplementation(({ config, plan }) => {
    if (!config.chains.has(plan.request.chainId)) {
      return Promise.reject(new UnsupportedChainError(plan.request.chainId));
    }
    return Promise.resolve(makeExecution(plan));
  });
});

describe.sequential("simulate — success", () => {
  it("returns transfers and normalized simulationTxs", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    mockExecuteSimulation.mockImplementationOnce(({ plan }) =>
      Promise.resolve(makeExecution(plan, [logs])),
    );

    const result = await simulate(makeConfig(), makeParams());

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0]!.amount).toBe(1000000n);
    expect(result.transfers[0]!.txIdx).toBe(0);
    expect(result.simulationTxs).toEqual([
      { from: USER, to: VAULT, data: "0x12345678", value: 0n },
    ]);
    expect(result.calls).toHaveLength(1);
  });

  it("derives assetChanges from user-call transfers", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    mockExecuteSimulation.mockImplementationOnce(({ plan }) =>
      Promise.resolve(makeExecution(plan, [logs])),
    );

    const result = await simulate(makeConfig(), makeParams());

    expect(result.assetChanges).toEqual([
      { account: USER, changes: [{ token: USDC, diff: -1000000n }] },
      { account: VAULT, changes: [{ token: USDC, diff: 1000000n }] },
    ]);
  });

  it("attributes Transfer.txIdx to the emitting tx in a multi-tx bundle", async () => {
    const APPROVE_AMOUNT = 1_000_000n;
    const TRANSFER_AMOUNT = 500_000n;
    mockExecuteSimulation.mockImplementationOnce(({ plan }) =>
      Promise.resolve(
        makeExecution(plan, [
          [
            makeTransferLog({
              token: USDC,
              from: USER,
              to: SPENDER,
              amount: APPROVE_AMOUNT,
            }),
          ],
          [
            makeTransferLog({
              token: USDC,
              from: USER,
              to: VAULT,
              amount: TRANSFER_AMOUNT,
            }),
          ],
        ]),
      ),
    );

    const result = await simulate(
      makeConfig(),
      makeParams({
        transactions: [
          { from: USER, to: USDC, data: "0x095ea7b3" as Hex },
          { from: USER, to: VAULT, data: "0xa9059cbb" as Hex },
        ],
      }),
    );

    expect(result.calls).toHaveLength(2);
    const approveTransfer = result.transfers.find(
      (t) => t.amount === APPROVE_AMOUNT,
    );
    const mainTransfer = result.transfers.find(
      (t) => t.amount === TRANSFER_AMOUNT,
    );
    expect(approveTransfer?.txIdx).toBe(0);
    expect(mainTransfer?.txIdx).toBe(1);
  });

  it("propagates per-call gasUsed in bundle order", async () => {
    mockExecuteSimulation.mockImplementationOnce(({ plan }) => {
      const execution = makeExecution(plan);
      let i = 0;
      const transactions = execution.transactions.map((transaction) => ({
        ...transaction,
        result: { ...transaction.result, gasUsed: [21_000n, 42_000n][i++]! },
      }));
      return Promise.resolve({ ...execution, transactions });
    });

    const result = await simulate(
      makeConfig(),
      makeParams({
        transactions: [
          { from: USER, to: USDC, data: "0x095ea7b3" as Hex },
          { from: USER, to: VAULT, data: "0xa9059cbb" as Hex },
        ],
      }),
    );

    expect(result.calls[0]!.gasUsed).toBe(21_000n);
    expect(result.calls[1]!.gasUsed).toBe(42_000n);
  });

  it("returns a deep-frozen result", async () => {
    const result = await simulate(makeConfig(), makeParams());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.calls)).toBe(true);
    expect(Object.isFrozen(result.simulationTxs)).toBe(true);
    expect(() => {
      (result as { calls: unknown }).calls = [];
    }).toThrow();
  });

  it("throws BlacklistViolationError end-to-end on bundles retention", async () => {
    const bundles = getChainAddresses(1).bundles!.vaultExitBundlesV1;
    const logs = [
      makeTransferLog({
        token: USDC,
        from: USER,
        to: bundles,
        amount: 1_000_000n,
      }),
    ];
    mockExecuteSimulation.mockImplementationOnce(({ plan }) =>
      Promise.resolve(makeExecution(plan, [logs])),
    );

    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      BlacklistViolationError,
    );
  });
});

describe.sequential("simulate — modes and unsupported features", () => {
  it("forwards blockNumber to executeSimulation", async () => {
    await simulate(makeConfig(), makeParams({ blockNumber: 20000000n }));
    expect(mockExecuteSimulation).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          request: expect.objectContaining({ blockNumber: 20000000n }),
        }),
      }),
    );
  });

  it("forwards a block tag to executeSimulation", async () => {
    await simulate(makeConfig(), makeParams({ blockNumber: "finalized" }));
    expect(mockExecuteSimulation).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          request: expect.objectContaining({ blockNumber: "finalized" }),
        }),
      }),
    );
  });

  it("defaults to final mode", async () => {
    await simulate(makeConfig(), makeParams());
    const plan = mockExecuteSimulation.mock.calls[0]![0].plan;
    expect(plan.request.mode).toBe("final");
    expect(plan.request.authorizations).toEqual([]);
  });

  it("preview without authorizations executes", async () => {
    const result = await simulate(
      makeConfig(),
      makeParams({ mode: "preview" }),
    );
    expect(result.calls).toHaveLength(1);
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
    expect(mockExecuteSimulation).not.toHaveBeenCalled();
  });

  it("final mode with authorizations throws SimulationValidationError", async () => {
    await expect(
      simulate(makeConfig(), makeParams({ authorizations: [] } as never)),
    ).rejects.toThrow(SimulationValidationError);
    expect(mockExecuteSimulation).not.toHaveBeenCalled();
  });
});

describe.sequential("simulate — error handling", () => {
  it("throws SimulationRevertedError on revert", async () => {
    mockExecuteSimulation.mockRejectedValueOnce(
      new SimulationRevertedError("ERC20: transfer amount exceeds balance"),
    );

    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      SimulationRevertedError,
    );
  });

  it("throws ExternalServiceError when the RPC is down", async () => {
    mockExecuteSimulation.mockRejectedValueOnce(
      new ExternalServiceError("RPC down"),
    );

    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      ExternalServiceError,
    );
  });

  test("behavior: keeps configured custom chains without registered addresses", async () => {
    const chainId = 999_999;
    const amount = 1_000n;
    mockExecuteSimulation.mockImplementationOnce(({ plan }) =>
      Promise.resolve(
        makeExecution(plan, [
          [
            {
              address: USDC,
              topics: [WITHDRAWAL_TOPIC, padAddress(USER)],
              data: encodeUint256(amount),
            },
          ],
        ]),
      ),
    );

    const result = await simulate(
      { chains: new Map([[chainId, { simulateV1Url: "http://rpc.local" }]]) },
      makeParams({ chainId }),
    );

    expect(result.transfers).toEqual([
      { token: USDC, from: USER, to: zeroAddress, amount, txIdx: 0 },
    ]);
  });
});

describe.sequential("simulate — validation", () => {
  it("throws UnsupportedChainError for unknown chain", async () => {
    await expect(
      simulate(makeConfig(), makeParams({ chainId: 999999 })),
    ).rejects.toThrow(UnsupportedChainError);
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
    const checksum: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const lower = checksum.toLowerCase() as Address;
    expect(checksum).not.toBe(lower);

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
});

describe.sequential("simulate — timeout", () => {
  it("throws ExternalServiceError when simulation exceeds timeoutMs", async () => {
    mockExecuteSimulation.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      throw new ExternalServiceError("timeout");
    });

    await expect(
      simulate(makeConfig({ timeoutMs: 1 }), makeParams()),
    ).rejects.toThrow(ExternalServiceError);
  });
});
