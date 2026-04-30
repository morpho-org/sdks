import {
  type Address,
  type Hex,
  type SimulateCallsParameters,
  maxUint256,
} from "viem";
import { vi } from "vitest";

import type { SimulationTransaction } from "../../types.js";

import {
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
} from "../../errors.js";
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
  it("returns logs collected from all result entries on success", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [
        {
          status: "success",
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
          logs: [
            { address: USDC, topics: ["0xbbbb" as Hex], data: "0xabcd" as Hex },
          ],
        },
      ],
    });

    const result = await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    expect(result.logs).toHaveLength(2);
    expect(result.logs[0]!.address).toBe(USDC);
    expect(result.tenderlyUrl).toBeUndefined();
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
      results: [{ status: "success", logs: [] }],
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
        { status: "success", logs: [] },
        {
          status: "failure",
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

  it("sets sender ETH balance to maxUint256 via stateOverride", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [{ status: "success", logs: [] }],
    });

    await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    const callArgs = mockSimulateCalls.mock.calls[0]![0];
    expect(callArgs.stateOverrides).toEqual([
      { address: USER, balance: maxUint256 },
    ]);
  });

  it("passes blockNumber as bigint when provided", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [{ status: "success", logs: [] }],
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
      results: [{ status: "success", logs: [] }],
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

  it("omits both block params when blockNumber is undefined", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [{ status: "success", logs: [] }],
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
          logs: [{ address: USDC, topics: ["0xaaaa" as Hex] /* no data */ }],
        },
      ],
    });

    const result = await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    expect(result.logs[0]!.data).toBe("0x");
  });

  it("does not crash when a result has no logs array", async () => {
    mockSimulateCalls.mockResolvedValueOnce({
      results: [{ status: "success" /* no logs */ }],
    });

    const result = await simulateV1({
      rpcUrl: "http://rpc.local",
      chainId: 1,
      transactions: [BASIC_TX],
    });

    expect(result.logs).toEqual([]);
  });
});
