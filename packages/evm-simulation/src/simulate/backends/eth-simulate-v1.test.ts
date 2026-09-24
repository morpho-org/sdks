import { type Address, getAddress, numberToHex, zeroAddress } from "viem";
import { vi } from "vitest";
import type { ExecutionPlan } from "../../domain/stages.js";
import {
  ExternalServiceError,
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
  SimulationRevertedError,
} from "../../errors.js";
import { encodeUint256, makeTransferLog } from "../../test-helpers/index.js";
import { NATIVE_BALANCE_PROBE_ADDRESS } from "../plan/native-balance-probe.js";
import { planExecution } from "../plan/plan-execution.js";
import { parseRequest } from "../request/index.js";
import { executePlan } from "./eth-simulate-v1.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const VAULT: Address = getAddress("0x3333333333333333333333333333333333333333");
const USDC: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const STATE_BLOCK = 20_000_000n;

const fetchMock = vi.fn<typeof fetch>();

function makePlan(transactions = 1): ExecutionPlan {
  return planExecution(
    parseRequest({
      chainId: 1,
      transactions: Array.from({ length: transactions }, () => ({
        from: OWNER,
        to: VAULT,
        data: "0x12",
      })),
    }),
  );
}

const rpc = (result: unknown) =>
  Response.json({ jsonrpc: "2.0", id: 1, result });

function blockResult(overrides: object = {}) {
  return {
    number: numberToHex(STATE_BLOCK),
    hash: `0x${"ab".repeat(32)}`,
    timestamp: numberToHex(1_700_000_000n),
    ...overrides,
  };
}

interface CallResult {
  status?: string;
  gasUsed?: string;
  returnData?: string;
  logs?: readonly unknown[];
  error?: { code?: number; message?: string };
}

function simulateResult(calls: CallResult[], overrides: object = {}): unknown {
  return [
    {
      number: numberToHex(STATE_BLOCK + 1n),
      timestamp: numberToHex(1_700_000_012n),
      hash: `0x${"cd".repeat(32)}`,
      ...overrides,
      calls,
    },
  ];
}

/** Queue chainId → block → simulate responses for a happy-path call. */
function respondHappy(calls: CallResult[]) {
  fetchMock
    .mockResolvedValueOnce(rpc("0x1"))
    .mockResolvedValueOnce(rpc(blockResult()))
    .mockResolvedValueOnce(rpc(simulateResult(calls)));
}

/** One successful call per planned call: probe ok + user txs ok + probes ok. */
const okCalls = (count: number): CallResult[] =>
  Array.from({ length: count }, (_, i) => ({
    status: "0x1",
    gasUsed: "0x5208",
    returnData: i % 2 === 0 ? encodeUint256(0n) : "0x",
    logs: [],
  }));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const params = {
  rpcUrl: "https://rpc.example",
  plan: makePlan(),
  blockNumber: STATE_BLOCK,
};

describe.sequential("executePlan", () => {
  test("default", async () => {
    respondHappy(okCalls(3));
    const evidence = await executePlan(params);
    expect(evidence.calls).toHaveLength(3);
    expect(evidence.context.stateBlockNumber).toBe(STATE_BLOCK);
    expect(evidence.context.blockNumber).toBe(STATE_BLOCK + 1n);
    expect(evidence.context.chainId).toBe(1);
    expect(evidence.snapshots).toHaveLength(2);
    expect(evidence.snapshots[0]?.identity).toEqual({
      type: "probe",
      probeId: "native-balance:before",
      phase: "before",
    });
    expect(Object.isFrozen(evidence)).toBe(true);
  });

  test("behavior: request body carries overrides, flags and pinned block", async () => {
    respondHappy(okCalls(3));
    await executePlan(params);
    const request: unknown = JSON.parse(
      String(fetchMock.mock.calls[2]?.[1]?.body),
    );
    expect(request).toMatchObject({
      method: "eth_simulateV1",
      params: [
        {
          traceTransfers: true,
          validation: false,
          blockStateCalls: [
            {
              stateOverrides: {
                [NATIVE_BALANCE_PROBE_ADDRESS]: {
                  code: "0x6004353160005260206000f3",
                },
              },
              calls: [
                {
                  from: zeroAddress,
                  to: NATIVE_BALANCE_PROBE_ADDRESS,
                  value: "0x0",
                },
                { from: OWNER, to: VAULT, data: "0x12", value: "0x0" },
                {
                  from: zeroAddress,
                  to: NATIVE_BALANCE_PROBE_ADDRESS,
                  value: "0x0",
                },
              ],
            },
          ],
        },
        numberToHex(STATE_BLOCK),
      ],
    });
    // No balance inflation override.
    const overrides = (
      request as {
        params: [
          {
            blockStateCalls: [
              { stateOverrides: Record<string, Record<string, string>> },
            ];
          },
        ];
      }
    ).params[0].blockStateCalls[0].stateOverrides;
    expect(
      Object.values(overrides).every((entry) => !("balance" in entry)),
    ).toBe(true);
    // Three sequential RPC requests: chainId, block, simulate.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({ method: "eth_chainId" });
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({ method: "eth_getBlockByNumber" });
  });

  test("behavior: resolves latest exactly once", async () => {
    respondHappy(okCalls(3));
    await executePlan({ ...params, blockNumber: undefined });
    const blockRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(blockRequest.params[0]).toBe("latest");
    const simRequest = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(simRequest.params[1]).toBe(numberToHex(STATE_BLOCK));
  });

  test("error: ExternalServiceError on chain mismatch", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x89"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(okCalls(3))));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test.each([null, {}, [{ calls: null }], []])(
    "error: InvalidSimulationResponseError for malformed result %j",
    async (result) => {
      fetchMock
        .mockResolvedValueOnce(rpc("0x1"))
        .mockResolvedValueOnce(rpc(blockResult()))
        .mockResolvedValueOnce(rpc(result));
      await expect(executePlan(params)).rejects.toBeInstanceOf(
        InvalidSimulationResponseError,
      );
    },
  );

  test("error: InvalidSimulationResponseError on call count mismatch", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(okCalls(2))));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  // Anvil reports the pinned block itself; advancement is not required.
  test("behavior: accepts a simulated block equal to the state block", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        rpc(
          simulateResult(okCalls(3), {
            number: numberToHex(STATE_BLOCK),
            timestamp: numberToHex(1_700_000_000n),
          }),
        ),
      );
    const evidence = await executePlan(params);
    expect(evidence.context.blockNumber).toBe(STATE_BLOCK);
  });

  test("error: InvalidSimulationResponseError for a block behind the state block", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        rpc(
          simulateResult(okCalls(3), {
            number: numberToHex(STATE_BLOCK - 1n),
          }),
        ),
      );
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test("error: InvalidSimulationResponseError for a timestamp behind the state block", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        rpc(
          simulateResult(okCalls(3), {
            timestamp: numberToHex(1_699_999_999n),
          }),
        ),
      );
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test("error: MissingVerificationEvidenceError when a probe fails", async () => {
    const calls = okCalls(3);
    calls[0] = { status: "0x0", gasUsed: "0x0", returnData: "0x" };
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(calls)));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      MissingVerificationEvidenceError,
    );
  });

  test("error: MissingVerificationEvidenceError on undecodable probe data", async () => {
    const calls = okCalls(3);
    calls[0] = { status: "0x1", gasUsed: "0x0", returnData: "0x1234" };
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(calls)));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      MissingVerificationEvidenceError,
    );
  });

  test("error: SimulationRevertedError on user call failure, details carry user calls only", async () => {
    const calls = okCalls(3);
    calls[1] = {
      status: "0x0",
      gasUsed: "0x0",
      returnData: "0x",
      error: { code: 3, message: "insufficient funds" },
    };
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(calls)));
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SimulationRevertedError);
    if (error instanceof SimulationRevertedError) {
      expect(error.reason).toBe("insufficient funds");
      const details = error.details as { identity: { type: string } }[];
      expect(details.every((d) => d.identity.type === "transaction")).toBe(
        true,
      );
    }
  });

  test("error: SimulationRevertedError for a node-level revert", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: "2.0",
          id: 1,
          error: { code: 3, message: "execution reverted" },
        }),
      );
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      SimulationRevertedError,
    );
  });

  test("error: SimulationRevertedError for a node-level insufficient-funds revert", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: "2.0",
          id: 1,
          error: {
            code: -32003,
            message: "Insufficient funds for gas * price + value",
          },
        }),
      );
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      SimulationRevertedError,
    );
  });

  test("error: ExternalServiceError for an aborted/timeout fetch", async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });

  test("error: ExternalServiceError for a non-Error thrown value", async () => {
    fetchMock.mockRejectedValueOnce("transport down");
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });

  test("behavior: probe snapshots carry decoded native balances", async () => {
    const calls = okCalls(3);
    calls[0] = { ...calls[0], returnData: encodeUint256(100n) };
    calls[2] = { ...calls[2], returnData: encodeUint256(90n) };
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(calls)));
    const evidence = await executePlan(params);
    expect(evidence.snapshots.map((s) => s.snapshot.wallet[0]?.assets)).toEqual(
      [100n, 90n],
    );
  });

  test("behavior: user call logs are normalized into SimulationCall", async () => {
    const calls = okCalls(3);
    calls[1] = {
      status: "0x1",
      gasUsed: "0xa410",
      returnData: "0xfeed",
      logs: [
        makeTransferLog({
          token: USDC,
          from: OWNER,
          to: VAULT,
          amount: 5n,
        }),
      ],
    };
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(calls)));
    const evidence = await executePlan(params);
    const userCall = evidence.calls[1]!;
    expect(userCall.identity).toEqual({
      type: "transaction",
      transactionIndex: 0,
    });
    expect(userCall.result.status).toBe(true);
    expect(userCall.result.gasUsed).toBe(42_000n);
    expect(userCall.result.returnData).toBe("0xfeed");
    expect(userCall.result.logs).toHaveLength(1);
  });
});
