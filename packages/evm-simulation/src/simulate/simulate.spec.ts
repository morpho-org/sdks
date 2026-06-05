import { getChainAddresses } from "@morpho-org/blue-sdk";
import { type Address, type Hex, zeroAddress } from "viem";
import { vi } from "vitest";
import {
  BlacklistViolationError,
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
  UnsupportedChainError,
} from "../errors.js";
import { makeTransferLog } from "../test-helpers/index.js";
import type {
  AccountAssetChanges,
  RawLog,
  RawSimulationResult,
  SimulateParams,
  SimulationAuthorization,
  SimulationConfig,
} from "../types.js";
import type { simulateV1 } from "./backends/eth-simulate-v1.js";
import type { simulateTenderlyRpc } from "./backends/tenderly-rpc.js";
import { simulate } from "./simulate.js";

const mockTenderlyRpc = vi.fn<typeof simulateTenderlyRpc>();
const mockSimulateV1 = vi.fn<typeof simulateV1>();

vi.mock("./backends/tenderly-rpc", () => ({
  simulateTenderlyRpc: (
    ...args: Parameters<typeof simulateTenderlyRpc>
  ): Promise<RawSimulationResult> => mockTenderlyRpc(...args),
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
  assetChanges: AccountAssetChanges[] = [],
): RawSimulationResult {
  return {
    calls: [{ logs, status: true, returnData: "0x", gasUsed: 0n }],
    assetChanges,
  };
}

function makeConfig(
  overrides: Partial<SimulationConfig> = {},
): SimulationConfig {
  return {
    chains: new Map([
      [
        1,
        {
          tenderlyRpc: { rpcUrl: "https://mainnet.gateway.tenderly.co/key" },
          simulateV1Url: "http://localhost:8545",
        },
      ],
    ]),
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
  it("returns transfers and simulationTxs", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    mockTenderlyRpc.mockResolvedValueOnce(makeSuccessResult(logs));

    const params = makeParams();
    const result = await simulate(makeConfig(), params);

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0]!.amount).toBe(1000000n);
    expect(result.simulationTxs).toEqual(params.transactions);
  });

  it("surfaces non-empty assetChanges from the backend unchanged", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    const assetChanges: AccountAssetChanges[] = [
      {
        account: USER,
        changes: [
          { token: USDC, symbol: "USDC", decimals: 6, diff: -1000000n },
        ],
      },
      {
        account: VAULT,
        changes: [{ token: USDC, symbol: "USDC", decimals: 6, diff: 1000000n }],
      },
    ];
    mockTenderlyRpc.mockResolvedValueOnce(
      makeSuccessResult(logs, assetChanges),
    );

    const result = await simulate(makeConfig(), makeParams());

    expect(result.assetChanges).toEqual(assetChanges);
  });

  it("attributes Transfer.txIdx to the emitting tx in a multi-tx bundle", async () => {
    const APPROVE_AMOUNT = 1_000_000n;
    const TRANSFER_AMOUNT = 500_000n;

    mockTenderlyRpc.mockResolvedValueOnce({
      calls: [
        {
          logs: [
            makeTransferLog({
              token: USDC,
              from: USER,
              to: SPENDER,
              amount: APPROVE_AMOUNT,
            }),
          ],
          status: true,
          returnData: "0x",
          gasUsed: 0n,
        },
        {
          logs: [
            makeTransferLog({
              token: USDC,
              from: USER,
              to: VAULT,
              amount: TRANSFER_AMOUNT,
            }),
          ],
          status: true,
          returnData: "0x",
          gasUsed: 0n,
        },
      ],
      assetChanges: [],
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

    expect(result.calls).toHaveLength(2);
    expect(result.calls[0]!.logs).toHaveLength(1);
    expect(result.calls[0]!.logs[0]!.topics[0]).toBe(
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    );
    expect(result.calls[1]!.logs).toHaveLength(1);
    expect(result.calls[1]!.logs[0]!.topics[0]).toBe(
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    );

    const approveTransfer = result.transfers.find(
      (t) => t.amount === APPROVE_AMOUNT,
    );
    const mainTransfer = result.transfers.find(
      (t) => t.amount === TRANSFER_AMOUNT,
    );
    expect(approveTransfer?.txIdx).toBe(0);
    expect(mainTransfer?.txIdx).toBe(1);
  });

  it("throws BlacklistViolationError end-to-end when backend logs show bundler retention", async () => {
    const BUNDLER = getChainAddresses(1).bundler3.bundler3;
    const logs = [
      makeTransferLog({
        token: USDC,
        from: USER,
        to: BUNDLER,
        amount: 1_000_000n,
      }),
    ];
    mockTenderlyRpc.mockResolvedValueOnce(makeSuccessResult(logs));

    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      BlacklistViolationError,
    );
  });
});

describe.sequential("simulate — authorizations", () => {
  it("resolves signature authorizations into prepended approve() calls", async () => {
    const transferLog = makeTransferLog({
      token: USDC,
      from: USER,
      to: VAULT,
      amount: 1000000n,
    });
    mockTenderlyRpc.mockResolvedValueOnce({
      calls: [
        { logs: [], status: true, returnData: "0x", gasUsed: 0n },
        { logs: [transferLog], status: true, returnData: "0x", gasUsed: 0n },
      ],
      assetChanges: [],
    });

    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: SPENDER },
    ];
    const result = await simulate(
      makeConfig(),
      makeParams({ authorizations: auths }),
    );

    const callArgs = mockTenderlyRpc.mock.calls[0]![0];
    expect(callArgs.transactions.length).toBe(2);
    expect(result.simulationTxs.length).toBe(2);
  });

  it("simulates directly (1 tx to Tenderly) without authorizations", async () => {
    mockTenderlyRpc.mockResolvedValueOnce(makeSuccessResult([]));

    const result = await simulate(makeConfig(), makeParams());
    expect(result.transfers).toEqual([]);

    const callArgs = mockTenderlyRpc.mock.calls[0]![0];
    expect(callArgs.transactions.length).toBe(1);
  });

  it("passes approval-type authorization txs through as-is (USDT-style reset)", async () => {
    const transferLog = makeTransferLog({
      token: USDC,
      from: USER,
      to: VAULT,
      amount: 1000000n,
    });
    mockTenderlyRpc.mockResolvedValueOnce({
      calls: [
        { logs: [], status: true, returnData: "0x", gasUsed: 0n },
        { logs: [], status: true, returnData: "0x", gasUsed: 0n },
        { logs: [transferLog], status: true, returnData: "0x", gasUsed: 0n },
      ],
      assetChanges: [],
    });

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
    const callArgs = mockTenderlyRpc.mock.calls[0]![0];
    expect(callArgs.transactions.length).toBe(3);
  });
});

describe.sequential("simulate — error handling", () => {
  it("throws SimulationRevertedError on revert", async () => {
    mockTenderlyRpc.mockRejectedValueOnce(
      new SimulationRevertedError("ERC20: transfer amount exceeds balance"),
    );

    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      SimulationRevertedError,
    );
  });

  it("throws ExternalServiceError when all services are down", async () => {
    mockTenderlyRpc.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly down"),
    );
    mockSimulateV1.mockRejectedValueOnce(new ExternalServiceError("RPC down"));

    await expect(simulate(makeConfig(), makeParams())).rejects.toThrow(
      ExternalServiceError,
    );
  });

  it("error: ExternalServiceError when backend returns fewer calls than transactions", async () => {
    mockTenderlyRpc.mockResolvedValueOnce({
      calls: [{ logs: [], status: true, returnData: "0x", gasUsed: 0n }],
      assetChanges: [],
    });

    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: SPENDER },
    ];

    await expect(
      simulate(makeConfig(), makeParams({ authorizations: auths })),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("throws SimulationRevertedError even when signature authorizations are present", async () => {
    mockTenderlyRpc.mockRejectedValueOnce(
      new SimulationRevertedError("USDT revert"),
    );

    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: SPENDER },
    ];

    await expect(
      simulate(makeConfig(), makeParams({ authorizations: auths })),
    ).rejects.toThrow(SimulationRevertedError);

    expect(mockTenderlyRpc).toHaveBeenCalledTimes(1);
  });
});

describe.sequential("simulate — backend fallback", () => {
  it("falls back to eth_simulateV1 when Tenderly fails", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    mockTenderlyRpc.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly 502"),
    );
    mockSimulateV1.mockResolvedValueOnce(makeSuccessResult(logs));

    const result = await simulate(makeConfig(), makeParams());

    expect(result.transfers).toHaveLength(1);
    expect(mockSimulateV1).toHaveBeenCalled();
  });

  it("falls back successfully when Tenderly times out within budget", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 500000n }),
    ];
    mockTenderlyRpc.mockRejectedValueOnce(
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
    mockTenderlyRpc.mockRejectedValueOnce(
      new ExternalServiceError("Tenderly timeout"),
    );
    mockSimulateV1.mockResolvedValueOnce(makeSuccessResult([]));

    const result = await simulate(makeConfig({ timeoutMs: 1 }), makeParams());

    expect(result).toBeDefined();
    expect(mockSimulateV1).toHaveBeenCalledTimes(1);
  });

  it("uses Tenderly only when chain has no fallback", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    mockTenderlyRpc.mockResolvedValueOnce(makeSuccessResult(logs));

    const config: SimulationConfig = {
      chains: new Map([
        [1, { tenderlyRpc: { rpcUrl: "https://gateway.tenderly.co/key" } }],
      ]),
    };
    const result = await simulate(config, makeParams());

    expect(result.transfers).toHaveLength(1);
    expect(mockSimulateV1).not.toHaveBeenCalled();
  });

  it("uses simulateV1 directly when chain has no Tenderly", async () => {
    const logs = [
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ];
    mockSimulateV1.mockResolvedValueOnce(makeSuccessResult(logs));

    const config: SimulationConfig = {
      chains: new Map([[1, { simulateV1Url: "http://rpc.local" }]]),
    };
    const result = await simulate(config, makeParams());

    expect(result.transfers).toHaveLength(1);
    expect(mockTenderlyRpc).not.toHaveBeenCalled();
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
    const checksum: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const lower = checksum.toLowerCase() as Address;
    expect(checksum).not.toBe(lower);

    mockTenderlyRpc.mockResolvedValueOnce({
      calls: [
        { logs: [], status: true, returnData: "0x", gasUsed: 0n },
        { logs: [], status: true, returnData: "0x", gasUsed: 0n },
      ],
      assetChanges: [],
    });

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
    mockTenderlyRpc.mockImplementationOnce(async () => {
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
