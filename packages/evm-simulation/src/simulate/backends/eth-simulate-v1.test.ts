import { type Address, getAddress, numberToHex, zeroAddress } from "viem";
import { vi } from "vitest";
import {
  ExternalServiceError,
  InvalidChainIdError,
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
  SimulationRevertedError,
} from "../../errors.js";
import { encodeUint256, makeTransferLog } from "../../test-helpers/index.js";
import { makeBalanceRead } from "../../test-helpers/make-balance-read.js";
import type { ExecutionPlan } from "../plan/plan-execution.js";
import { planExecution } from "../plan/plan-execution.js";
import { parseRequest } from "../request/index.js";
import { decodeStateRead } from "../state/read-state.js";
import { createSimulationClient } from "./client.js";
import { executePlan } from "./eth-simulate-v1.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const VAULT: Address = getAddress("0x3333333333333333333333333333333333333333");
const USDC: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const STATE_BLOCK = 20_000_000n;
const RPC_URL = "https://rpc.example";

const fetchMock = vi.fn<typeof fetch>();
let params!: Parameters<typeof executePlan>[0];

function makePlan(transactions = 1): ExecutionPlan {
  const request = parseRequest({
    chainId: 1,
    transactions: Array.from({ length: transactions }, () => ({
      from: OWNER,
      to: VAULT,
      data: "0x12",
    })),
  });
  return planExecution({
    request,
    owner: OWNER,
    preparations: [],
    reads: [makeBalanceRead(USDC, OWNER)],
  });
}

const rpc = (result: unknown) =>
  Response.json({ jsonrpc: "2.0", id: 1, result });

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
      parentHash: `0x${"ab".repeat(32)}`,
      ...overrides,
      calls,
    },
  ];
}

/** Queue the simulate response for a happy-path call. */
function respondHappy(calls: CallResult[]) {
  fetchMock.mockResolvedValueOnce(rpc(simulateResult(calls)));
}

/** One successful call per planned call: read ok + user txs ok + read ok. */
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
  params = {
    client: createSimulationClient(RPC_URL),
    plan: makePlan(),
    stateBlock: {
      number: STATE_BLOCK,
      hash: `0x${"ab".repeat(32)}`,
      timestamp: 1_700_000_000n,
    },
    validation: false,
    parentHashCheck: true,
  };
});
afterEach(() => vi.unstubAllGlobals());

describe.sequential("executePlan", () => {
  test("default", async () => {
    respondHappy(okCalls(3));
    const evidence = await executePlan(params);
    expect(evidence.calls).toHaveLength(3);
    expect(evidence.block.stateBlockNumber).toBe(STATE_BLOCK);
    expect(evidence.block.blockNumber).toBe(STATE_BLOCK + 1n);
    expect(evidence.block.chainId).toBe(1);
    expect(evidence.stateReads).toHaveLength(2);
    expect(evidence.stateReads[0]?.read.kind).toBe("erc20.balance");
    expect(evidence.stateReads[0]?.phase).toBe("before");
    expect(Object.isFrozen(evidence)).toBe(true);
  });

  test("behavior: request body carries overrides, flags and pinned block", async () => {
    respondHappy(okCalls(3));
    await executePlan(params);
    const request: unknown = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    );
    expect(request).toMatchObject({
      method: "eth_simulateV1",
      params: [
        {
          traceTransfers: true,
          validation: false,
          blockStateCalls: [
            {
              calls: [
                { chainId: "0x1", from: zeroAddress, to: USDC, value: "0x0" },
                {
                  chainId: "0x1",
                  from: OWNER,
                  to: VAULT,
                  data: "0x12",
                  value: "0x0",
                },
                { chainId: "0x1", from: zeroAddress, to: USDC, value: "0x0" },
              ],
            },
          ],
        },
        numberToHex(STATE_BLOCK),
      ],
    });
    // No state overrides at all — no balance inflation.
    expect(
      "stateOverrides" in
        (
          request as {
            params: [{ blockStateCalls: [Record<string, unknown>] }];
          }
        ).params[0].blockStateCalls[0],
    ).toBe(false);
    // The state block is resolved by the caller; this boundary only simulates.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("behavior: no blockOverrides are sent without a block gas limit", async () => {
    respondHappy(okCalls(3));
    await executePlan(params);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      params: [{ blockStateCalls: [Record<string, unknown>] }];
    };
    expect("blockOverrides" in request.params[0].blockStateCalls[0]).toBe(
      false,
    );
  });

  test("behavior: a block gas limit is sent as blockOverrides.gasLimit", async () => {
    respondHappy(okCalls(3));
    await executePlan({ ...params, blockGasLimit: 16_777_216n });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      params: [{ blockStateCalls: [Record<string, unknown>] }];
    };
    const blockStateCall = request.params[0].blockStateCalls[0];
    expect(blockStateCall.blockOverrides).toEqual({ gasLimit: "0x1000000" });
    // The override sets the block limit only; calls carry no explicit gas.
    expect(
      (blockStateCall.calls as Record<string, unknown>[]).some(
        (call) => "gas" in call,
      ),
    ).toBe(false);
  });

  test("behavior: request body carries the validation flag", async () => {
    respondHappy(okCalls(3));
    await executePlan({ ...params, validation: true });
    const request: unknown = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    );
    expect(
      (request as { params: [{ validation: unknown }] }).params[0].validation,
    ).toBe(true);
  });

  test("error: InvalidSimulationResponseError when the result is not one block", async () => {
    fetchMock.mockResolvedValueOnce(rpc([]));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test("error: InvalidSimulationResponseError on call count mismatch", async () => {
    fetchMock.mockResolvedValueOnce(rpc(simulateResult(okCalls(2))));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test.each([
    ["non-quantity gas", { gasUsed: "invalid" }],
    ["non-array logs", { logs: {} }],
    ["malformed log", { logs: [{ address: USDC, topics: [123], data: "0x" }] }],
  ])("error: InvalidSimulationResponseError for %s", async (_, patch) => {
    const calls = okCalls(3);
    calls[1] = { ...calls[1], ...patch } as unknown as CallResult;
    fetchMock.mockResolvedValueOnce(rpc(simulateResult(calls)));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test.each(["absent", "null"])(
    "behavior: %s per-call logs are treated as no transfers",
    async (variant) => {
      const calls = okCalls(3);
      if (variant === "absent") delete calls[1]?.logs;
      else calls[1] = { ...calls[1], logs: null } as unknown as CallResult;
      respondHappy(calls);
      const execution = await executePlan(params);
      expect(execution.calls[1]?.result.logs).toEqual([]);
    },
  );

  // Anvil reports the pinned block itself; advancement is not required.
  test("behavior: accepts a simulated block equal to the state block", async () => {
    fetchMock.mockResolvedValueOnce(
      rpc(
        simulateResult(okCalls(3), {
          number: numberToHex(STATE_BLOCK),
          timestamp: numberToHex(1_700_000_000n),
        }),
      ),
    );
    const evidence = await executePlan(params);
    expect(evidence.block.blockNumber).toBe(STATE_BLOCK);
  });

  test("error: InvalidSimulationResponseError for a block behind the state block", async () => {
    fetchMock.mockResolvedValueOnce(
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
    fetchMock.mockResolvedValueOnce(
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

  test("behavior: parentHashCheck false accepts a successor with a foreign parentHash", async () => {
    fetchMock.mockResolvedValueOnce(
      rpc(simulateResult(okCalls(3), { parentHash: `0x${"99".repeat(32)}` })),
    );
    const evidence = await executePlan({ ...params, parentHashCheck: false });
    expect(evidence.block.blockNumber).toBe(STATE_BLOCK + 1n);
  });

  test("error: parentHashCheck true rejects a successor with a foreign parentHash", async () => {
    fetchMock.mockResolvedValueOnce(
      rpc(simulateResult(okCalls(3), { parentHash: `0x${"99".repeat(32)}` })),
    );
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test("error: MissingVerificationEvidenceError when a state read fails", async () => {
    const calls = okCalls(3);
    calls[0] = { status: "0x0", gasUsed: "0x0", returnData: "0x" };
    fetchMock.mockResolvedValueOnce(rpc(simulateResult(calls)));
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
    fetchMock.mockResolvedValueOnce(rpc(simulateResult(calls)));
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SimulationRevertedError);
    if (error instanceof SimulationRevertedError) {
      // viem formats the revert; a reason string rides on the typed error.
      expect(error.reason).not.toBe("");
      const details = error.details as {
        transactionIndex: number;
        result: unknown;
      }[];
      expect(details.every((d) => typeof d.transactionIndex === "number")).toBe(
        true,
      );
    }
  });

  test("error: SimulationRevertedError for a node-level revert", async () => {
    fetchMock.mockResolvedValueOnce(
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

  test.each([
    {
      name: "geth code -32003",
      code: -32003,
      message: "Insufficient funds for gas * price + value",
    },
    {
      name: "message-only code -32000",
      code: -32000,
      message: "insufficient funds for transfer",
    },
  ])(
    "error: SimulationRevertedError for a node-level insufficient-funds revert ($name)",
    async ({ code, message }) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({ jsonrpc: "2.0", id: 1, error: { code, message } }),
      );
      await expect(executePlan(params)).rejects.toBeInstanceOf(
        SimulationRevertedError,
      );
    },
  );

  test.each([
    {
      node: "geth",
      code: -32000,
      message: "chainId does not match node's (have=1, want=988)",
    },
    { node: "Anvil", code: -32003, message: "invalid chain id for signer" },
    {
      node: "Monad",
      code: -32003,
      message: "Invalid chain ID: expected 143, got 1",
    },
  ])(
    "error: InvalidChainIdError when the node rejects the chainId ($node)",
    async ({ code, message }) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({ jsonrpc: "2.0", id: 1, error: { code, message } }),
      );
      await expect(executePlan(params)).rejects.toBeInstanceOf(
        InvalidChainIdError,
      );
    },
  );

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

  test("behavior: state reads carry decoded before/after values", async () => {
    const calls = okCalls(3);
    calls[0] = { ...calls[0], returnData: encodeUint256(100n) };
    calls[2] = { ...calls[2], returnData: encodeUint256(90n) };
    fetchMock.mockResolvedValueOnce(rpc(simulateResult(calls)));
    const evidence = await executePlan(params);
    expect(
      evidence.stateReads.map((s) =>
        decodeStateRead(s.read, s.returnData, {
          chainId: 1,
          mode: "final",
          blockNumber: STATE_BLOCK,
        }),
      ),
    ).toEqual([100n, 90n]);
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
    fetchMock.mockResolvedValueOnce(rpc(simulateResult(calls)));
    const evidence = await executePlan(params);
    const userCall = evidence.calls[1]!;
    expect(userCall.planned.type).toBe("transaction");
    expect(
      userCall.planned.type === "transaction" &&
        userCall.planned.transactionIndex === 0,
    ).toBe(true);
    expect(userCall.result.status).toBe(true);
    expect(userCall.result.gasUsed).toBe(42_000n);
    expect(userCall.result.returnData).toBe("0xfeed");
    expect(userCall.result.logs).toHaveLength(1);
  });
});
