import {
  type Address,
  ethAddress,
  type Hex,
  maxUint256,
  parseEther,
  type SimulateCallsParameters,
} from "viem";
import { vi } from "vitest";
import {
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
} from "../../errors.js";
import { makeTransferLog } from "../../test-helpers/index.js";
import type { SimulationTransaction } from "../../types.js";
import { simulateV1 } from "./eth-simulate-v1.js";

type MockSimulateCalls = (args: SimulateCallsParameters) => Promise<unknown>;

const mockSimulateCalls = vi.fn<MockSimulateCalls>();

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: () => ({
      simulateCalls: (args: SimulateCallsParameters) => mockSimulateCalls(args),
    }),
    http: () => () => undefined, // transport factory — return value unused because client is mocked
  };
});

const USER: Address = "0x1111111111111111111111111111111111111111";
const OTHER: Address = "0x2222222222222222222222222222222222222222";
const VAULT: Address = "0x3333333333333333333333333333333333333333";
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const BASIC_TX: SimulationTransaction = {
  from: USER,
  to: VAULT,
  data: "0x12" as Hex,
};

beforeEach(() => vi.clearAllMocks());

describe.sequential("simulateV1", () => {
  it("returns one calls entry per tx with logs, status, returnData, gasUsed", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        {
          status: "success",
          gasUsed: 21_000n,
          data: "0xfeed" as Hex,
          logs: [
            {
              address: USDC,
              topics: ["0xaaaa" as Hex],
              data: "0xdeadbeef" as Hex,
            },
          ],
        },
        {
          status: "success",
          gasUsed: 42_000n,
          data: "0x" as Hex,
          logs: [
            { address: USDC, topics: ["0xbbbb" as Hex], data: "0xabcd" as Hex },
          ],
        },
      ],
    });

    const result = await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX, BASIC_TX],
    });

    expect(result.calls).toHaveLength(2);
    expect(result.calls[0]!.status).toBe(true);
    expect(result.calls[0]!.returnData).toBe("0xfeed");
    expect(result.calls[0]!.gasUsed).toBe(21_000n);
    expect(result.calls[0]!.logs).toHaveLength(1);
    expect(result.calls[0]!.logs[0]!.address).toBe(USDC);
    expect(result.calls[1]!.gasUsed).toBe(42_000n);
    expect(result.calls[1]!.logs[0]!.topics[0]).toBe("0xbbbb");
  });

  it("requires at least one transaction", async () => {
    await expect(
      simulateV1({ rpcUrl: "http://rpc.local", chainId: 1, transactions: [] }),
    ).rejects.toThrow(SimulationValidationError);
  });

  it("rejects bundles where transactions have different senders", async () => {
    await expect(
      simulateV1({
        rpcUrl: "http://rpc.local",
        chainId: 1,
        transactions: [
          BASIC_TX,
          { from: OTHER, to: VAULT, data: "0x12" as Hex },
        ],
      }),
    ).rejects.toThrow(SimulationValidationError);
  });

  it("normalizes senders case-insensitively before comparing", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        { status: "success", gasUsed: 0n, data: "0x" as Hex, logs: [] },
        { status: "success", gasUsed: 0n, data: "0x" as Hex, logs: [] },
      ],
    });

    // Real mixed-case address — not palindromic — so checksum and lowercase
    // forms differ byte-for-byte. This actually exercises the getAddress()
    // normalization inside simulateV1.
    const checksum: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const lower = checksum.toLowerCase() as Address;
    expect(checksum).not.toBe(lower);

    await expect(
      simulateV1({
        rpcUrl: "http://rpc.local",
        chainId: 1,
        transactions: [
          { from: checksum, to: VAULT, data: "0x11" as Hex },
          { from: lower, to: VAULT, data: "0x22" as Hex },
        ],
      }),
    ).resolves.toBeDefined();
  });

  it("throws SimulationRevertedError when a result has status != success", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        { status: "success", gasUsed: 0n, data: "0x" as Hex, logs: [] },
        {
          status: "failure",
          gasUsed: 0n,
          data: "0x" as Hex,
          error: { message: "ERC20: insufficient balance" },
          logs: [],
        },
      ],
    });

    await expect(
      simulateV1({
        rpcUrl: "http://rpc.local",
        chainId: 1,
        transactions: [BASIC_TX],
      }),
    ).rejects.toThrow(SimulationRevertedError);
  });

  it("inflates sender ETH balance to half of uint256 via stateOverride", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        { status: "success", gasUsed: 0n, data: "0x" as Hex, logs: [] },
      ],
    });

    await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    const callArgs = mockSimulateCalls.mock.calls[0]![0];
    // Half of uint256 (not the ceiling) leaves headroom for inbound native ETH
    // so a refund to the sender does not overflow and revert the transfer.
    expect(callArgs.stateOverrides).toEqual([
      { address: USER, balance: maxUint256 / 2n },
    ]);
  });

  it("passes blockNumber as bigint when provided", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        { status: "success", gasUsed: 0n, data: "0x" as Hex, logs: [] },
      ],
    });

    await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
      blockNumber: 20_000_000n,
    });

    const callArgs = mockSimulateCalls.mock.calls[0]![0];
    expect(callArgs.blockNumber).toBe(20_000_000n);
    expect(callArgs.blockTag).toBeUndefined();
  });

  it("passes blockTag when a tag string is provided", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        { status: "success", gasUsed: 0n, data: "0x" as Hex, logs: [] },
      ],
    });

    await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
      blockNumber: "latest",
    });

    const callArgs = mockSimulateCalls.mock.calls[0]![0];
    expect(callArgs.blockTag).toBe("latest");
    expect(callArgs.blockNumber).toBeUndefined();
  });

  it("passes AbortSignal through to the HTTP transport options", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        { status: "success", gasUsed: 0n, data: "0x" as Hex, logs: [] },
      ],
    });

    const signal = new AbortController().signal;
    await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
      signal,
    });

    expect(mockSimulateCalls).toHaveBeenCalledOnce();
  });

  it("uses a default revert message when eth_simulateV1 omits the error", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [{ status: "failure", gasUsed: 0n, data: "0x" as Hex }],
    });

    await expect(
      simulateV1({
        rpcUrl: "http://rpc.local",
        chainId: 1,
        transactions: [BASIC_TX],
      }),
    ).rejects.toThrow("Simulation failed");
  });

  it("omits both block params when blockNumber is undefined", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        { status: "success", gasUsed: 0n, data: "0x" as Hex, logs: [] },
      ],
    });

    await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    const callArgs = mockSimulateCalls.mock.calls[0]![0];
    expect(callArgs.blockNumber).toBeUndefined();
    expect(callArgs.blockTag).toBeUndefined();
  });

  it("wraps unknown viem errors in ExternalServiceError", async () => {
    mockSimulateCalls.mockRejectedValueOnce(new Error("network refused"));

    await expect(
      simulateV1({
        rpcUrl: "http://rpc.local",
        chainId: 1,
        transactions: [BASIC_TX],
      }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("wraps non-Error viem failures in ExternalServiceError", async () => {
    mockSimulateCalls.mockRejectedValueOnce("transport down");

    await expect(
      simulateV1({
        rpcUrl: "http://rpc.local",
        chainId: 1,
        transactions: [BASIC_TX],
      }),
    ).rejects.toThrow("transport down");
  });

  it("preserves SimulationRevertedError when viem throws one", async () => {
    mockSimulateCalls.mockRejectedValueOnce(
      new SimulationRevertedError("revert"),
    );

    await expect(
      simulateV1({
        rpcUrl: "http://rpc.local",
        chainId: 1,
        transactions: [BASIC_TX],
      }),
    ).rejects.toThrow(SimulationRevertedError);
  });

  it("throws ExternalServiceError when results is not an array", async () => {
    mockSimulateCalls.mockResolvedValueOnce({ results: null });

    await expect(
      simulateV1({
        rpcUrl: "http://rpc.local",
        chainId: 1,
        transactions: [BASIC_TX],
      }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("defaults log data to 0x when missing from a log entry", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        {
          status: "success",
          gasUsed: 0n,
          data: "0x" as Hex,
          logs: [{ address: USDC, topics: ["0xaaaa" as Hex] /* no data */ }],
        },
      ],
    });

    const result = await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    expect(result.calls[0]!.logs[0]!.data).toBe("0x");
  });

  it("does not crash when a result has no logs array", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [{ status: "success", gasUsed: 0n /* no data or logs */ }],
    });

    const result = await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    expect(result.calls[0]!.logs).toEqual([]);
    expect(result.calls[0]!.returnData).toBe("0x");
  });

  it("groups assetChanges by account from transfer logs (both endpoints)", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        {
          status: "success",
          gasUsed: 0n,
          data: "0x" as Hex,
          logs: [
            makeTransferLog({
              token: USDC,
              from: USER,
              to: VAULT,
              amount: 1_000_000n,
            }),
          ],
        },
      ],
    });

    const result = await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    expect(result.assetChanges).toEqual([
      { account: USER, changes: [{ token: USDC, diff: -1_000_000n }] },
      { account: VAULT, changes: [{ token: USDC, diff: 1_000_000n }] },
    ]);
  });

  it("nets inbound and outbound transfers of the same token to zero and drops it", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        {
          status: "success",
          gasUsed: 0n,
          data: "0x" as Hex,
          logs: [
            makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 5n }),
            makeTransferLog({ token: USDC, from: VAULT, to: USER, amount: 5n }),
          ],
        },
      ],
    });

    const result = await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    expect(result.assetChanges).toEqual([]);
  });

  it("returns empty assetChanges when no transfer logs are emitted", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        { status: "success", gasUsed: 0n, data: "0x" as Hex, logs: [] },
      ],
    });

    const result = await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    expect(result.assetChanges).toEqual([]);
  });

  it("enables traceTransfers so the node synthesizes native-ETH logs", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        { status: "success", gasUsed: 0n, data: "0x" as Hex, logs: [] },
      ],
    });

    await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    expect(mockSimulateCalls.mock.calls[0]![0].traceTransfers).toBe(true);
  });

  it("accounts native ETH from traceTransfers synthetic logs (payer debited, recipient credited)", async () => {
    // With traceTransfers, the node logs native moves as Transfer events from
    // the eth sentinel — including ETH moved through internal calls.
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        {
          status: "success",
          gasUsed: 0n,
          data: "0x" as Hex,
          logs: [
            makeTransferLog({
              token: ethAddress,
              from: USER,
              to: VAULT,
              amount: parseEther("1"),
            }),
          ],
        },
        {
          status: "success",
          gasUsed: 0n,
          data: "0x" as Hex,
          logs: [
            makeTransferLog({
              token: ethAddress,
              from: USER,
              to: VAULT,
              amount: parseEther("2"),
            }),
          ],
        },
      ],
    });

    const result = await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX, BASIC_TX],
    });

    expect(result.assetChanges).toEqual([
      {
        account: USER,
        changes: [{ token: ethAddress, diff: -parseEther("3") }],
      },
      {
        account: VAULT,
        changes: [{ token: ethAddress, diff: parseEther("3") }],
      },
    ]);
  });

  it("does not double-count: top-level value is ignored, only logs are accounted", async () => {
    // The synthetic log already carries the top-level value, so adding `value`
    // on top would double-count. A tx with `value` but no native log nets zero.
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        { status: "success", gasUsed: 0n, data: "0x" as Hex, logs: [] },
      ],
    });

    const result = await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [{ ...BASIC_TX, value: parseEther("1") }],
    });

    expect(result.assetChanges).toEqual([]);
  });

  it("merges native ETH and ERC20 deltas, sorted by token address", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        {
          status: "success",
          gasUsed: 0n,
          data: "0x" as Hex,
          logs: [
            makeTransferLog({
              token: USDC,
              from: USER,
              to: VAULT,
              amount: 1_000_000n,
            }),
            makeTransferLog({
              token: ethAddress,
              from: USER,
              to: VAULT,
              amount: parseEther("1"),
            }),
          ],
        },
      ],
    });

    const result = await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    // USDC (0xa0b8…) sorts before the ethAddress sentinel (0xeeee…).
    expect(result.assetChanges).toEqual([
      {
        account: USER,
        changes: [
          { token: USDC, diff: -1_000_000n },
          { token: ethAddress, diff: -parseEther("1") },
        ],
      },
      {
        account: VAULT,
        changes: [
          { token: USDC, diff: 1_000_000n },
          { token: ethAddress, diff: parseEther("1") },
        ],
      },
    ]);
  });
});
