import {
  type Address,
  BaseError,
  encodeErrorResult,
  getAddress,
  InsufficientFundsError,
  numberToHex,
  parseAbi,
  UnknownRpcError,
  zeroAddress,
} from "viem";
import { vi } from "vitest";
import {
  InvalidChainIdError,
  InvalidSimulationResponseError,
  RpcTransportError,
  SimulationRevertedError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import { encodeUint256, makeTransferLog } from "../../test-helpers/index.js";
import { makeBalanceRead } from "../../test-helpers/make-balance-read.js";
import type { ExecutionPlan } from "../plan/plan-execution.js";
import { planExecution } from "../plan/plan-execution.js";
import { parseRequest } from "../request/index.js";
import { decodeStateRead } from "../state/read-state.js";
import { createSimulationClient } from "./client.js";
import { rpc as callRpc, executePlan } from "./eth-simulate-v1.js";

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
  error?: { code?: number; message?: string; data?: string };
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

const FUNDING_MESSAGE =
  "Sender native balance cannot fund transaction value. Fund the sender or reduce value.";

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

  test("behavior: a per-call gas limit is sent on every call", async () => {
    respondHappy(okCalls(3));
    await executePlan({ ...params, callGasLimit: 30_000_000n });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      params: [{ blockStateCalls: [{ calls: Record<string, unknown>[] }] }];
    };
    expect(
      request.params[0].blockStateCalls[0]?.calls.map((call) => call.gas),
    ).toEqual(["0x1c9c380", "0x1c9c380", "0x1c9c380"]);
  });

  test("behavior: block and per-call gas limits are both sent", async () => {
    respondHappy(okCalls(3));
    await executePlan({
      ...params,
      blockGasLimit: 16_777_216n,
      callGasLimit: 30_000_000n,
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      params: [
        {
          blockStateCalls: [
            {
              blockOverrides: Record<string, unknown>;
              calls: Record<string, unknown>[];
            },
          ];
        },
      ];
    };
    const blockStateCall = request.params[0].blockStateCalls[0];
    expect(blockStateCall?.blockOverrides).toEqual({ gasLimit: "0x1000000" });
    expect(blockStateCall?.calls.map((call) => call.gas)).toEqual([
      "0x1c9c380",
      "0x1c9c380",
      "0x1c9c380",
    ]);
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
    [
      "short log topic",
      { logs: [{ address: USDC, topics: ["0x01"], data: "0x" }] },
    ],
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

  test("error: SlippageCheckUnavailableError when a state read fails", async () => {
    const calls = okCalls(3);
    calls[0] = { status: "0x0", gasUsed: "0x0", returnData: "0x" };
    fetchMock.mockResolvedValueOnce(rpc(simulateResult(calls)));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      SlippageCheckUnavailableError,
    );
  });

  test.each([
    {
      name: "custom error with all parameters",
      data: encodeErrorResult({
        abi: parseAbi([
          "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
        ]),
        errorName: "ERC20InsufficientBalance",
        args: [OWNER, 1283n, 2000n],
      }),
      message: `Transaction 0 reverted: ERC20InsufficientBalance(sender="${OWNER}", balance=1283, needed=2000)`,
    },
    {
      name: "Error(string)",
      data: encodeErrorResult({
        abi: parseAbi(["error Error(string)"]),
        errorName: "Error",
        args: ["insufficient collateral"],
      }),
      message:
        'Transaction 0 reverted: Error(message="insufficient collateral")',
    },
    {
      name: "Panic",
      data: encodeErrorResult({
        abi: parseAbi(["error Panic(uint256)"]),
        errorName: "Panic",
        args: [17n],
      }),
      message: "Transaction 0 reverted: Panic(reason=17)",
    },
    ...["0xdeadbeef", "0x", "0x1234"].map((data) => ({
      name: data,
      data,
      message: "Transaction 0 reverted: Revert reason unavailable",
    })),
  ])(
    "error: preserves user revert bytes and message ($name)",
    async ({ data, message }) => {
      const calls = okCalls(3);
      calls[1] = {
        status: "0x0",
        gasUsed: "0x0",
        returnData: "0x",
        error: { code: 3, message: "execution reverted", data },
      };
      fetchMock.mockResolvedValueOnce(rpc(simulateResult(calls)));
      const error = await executePlan(params).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(SimulationRevertedError);
      expect(error).toMatchObject({ message, revertData: data });
      for (const field of ["reason", "reasonCode", "details", "context"])
        expect(error).not.toHaveProperty(field);
    },
  );

  test.each([
    { code: -38014, message: FUNDING_MESSAGE },
    { code: -32000, message: "Revert reason unavailable" },
  ])(
    "error: node insufficient funds preserves cause ($code)",
    async ({ code, message }) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({
          jsonrpc: "2.0",
          id: 1,
          error: {
            code,
            message: "insufficient funds for gas * price + value",
          },
        }),
      );
      const error = await executePlan(params).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(SimulationRevertedError);
      expect(error).toMatchObject({
        message,
        revertData: undefined,
        cause: expect.any(Error),
      });
    },
  );

  test("error: code -38014 alone gives the SDK funding message", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -38014, message: "unrelated node text" },
      }),
    );
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect((error as Error).message).toBe(FUNDING_MESSAGE);
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  test.each([
    encodeErrorResult({
      abi: parseAbi(["error Error(string)"]),
      errorName: "Error",
      args: ["node revert"],
    }),
    "0xDEADBEEF",
    "0x",
    "0x1234",
  ])("error: node revert preserves exact bytes %s", async (data) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: 3, message: "execution reverted", data },
      }),
    );
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({ revertData: data, cause: expect.any(Error) });
    if (data.length > 10)
      expect((error as Error).message).toBe('Error(message="node revert")');
  });

  test.each([undefined, "0x", "0xdeadbeef", "0x1234"] as const)(
    "error: node revert fallback omits provider diagnostics (%s)",
    async (data) => {
      const cause = Object.assign(
        new Error("execution reverted https://rpc.example/private-token"),
        { code: 3, data },
      );
      const error = await callRpc("eth_simulateV1", async () => {
        throw cause;
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SimulationRevertedError);
      const reverted = error as SimulationRevertedError;
      expect(reverted.message).toBe("Revert reason unavailable");
      expect(reverted.cause).toBe(cause);
      expect(reverted.revertData).toBe(data);
      expect(reverted.transactionIndex).toBeUndefined();
    },
  );

  test.each(["0x", "0xdeadbeef"] as const)(
    "error: preserves nested node data %s and original cause",
    async (data) => {
      const cause = new BaseError("outer", {
        cause: Object.assign(new InsufficientFundsError(), { data }),
      });
      const error = await callRpc("eth_simulateV1", async () => {
        throw cause;
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SimulationRevertedError);
      expect(error).toMatchObject({
        message: FUNDING_MESSAGE,
        revertData: data,
      });
      expect((error as Error).cause).toBe(cause);
    },
  );

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
      const error = await executePlan(params).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(SimulationRevertedError);
      expect((error as Error).message).toBe("Revert reason unavailable");
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
      const error = await executePlan(params).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(InvalidChainIdError);
      expect((error as InvalidChainIdError).message).toBe(
        "eth_simulateV1 endpoint rejected the request chainId. Point SimulationConfig.chains at an RPC URL for this chain.",
      );
    },
  );

  test("error: preserves the original abort from fetch", async () => {
    const cause = Object.assign(new Error("aborted"), { name: "AbortError" });
    fetchMock.mockRejectedValueOnce(cause);
    const error = await executePlan(params).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(RpcTransportError);
    expect((error as RpcTransportError).cause).toBe(cause);
  });

  test("error: RpcTransportError for a non-Error thrown value", async () => {
    fetchMock.mockRejectedValueOnce("transport down");
    await expect(executePlan(params)).rejects.toBeInstanceOf(RpcTransportError);
  });

  test("behavior: state reads carry decoded before/after values", async () => {
    const calls = okCalls(3);
    calls[0] = { ...calls[0], returnData: encodeUint256(100n) };
    calls[2] = { ...calls[2], returnData: encodeUint256(90n) };
    fetchMock.mockResolvedValueOnce(rpc(simulateResult(calls)));
    const evidence = await executePlan(params);
    expect(
      evidence.stateReads.map((s) => decodeStateRead(s.read, s.returnData)),
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

describe.sequential("chaos: S4 node-level revert classification", () => {
  test.each([
    { node: "geth (code 3)", code: 3, message: "execution reverted: Paused" },
    { node: "geth (-32000)", code: -32000, message: "execution reverted" },
    {
      node: "Erigon",
      code: -32000,
      message: "execution reverted: ERC20: transfer amount exceeds balance",
    },
    { node: "Nethermind", code: -32015, message: "VM execution error." },
  ])(
    "error: SimulationRevertedError, never RpcTransportError ($node)",
    async ({ code, message }) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({ jsonrpc: "2.0", id: 1, error: { code, message } }),
      );
      const error = await executePlan(params).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SimulationRevertedError);
      expect(error).not.toBeInstanceOf(RpcTransportError);
      expect((error as SimulationRevertedError).message).toBe(
        "Revert reason unavailable",
      );
    },
  );

  test.each([
    {
      name: "DeadlinePassed()",
      data: "0x70f65caa",
      message: "DeadlinePassed()",
    },
    {
      name: "InvalidNonce()",
      data: "0x756688fe",
      message: "InvalidNonce()",
    },
    {
      name: "an unknown selector",
      data: "0xdeadbeef",
      message: "Revert reason unavailable",
    },
  ])(
    "error: a node-level revert with $name data reports $message",
    async ({ data, message }) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({
          jsonrpc: "2.0",
          id: 1,
          error: { code: 3, message: "execution reverted", data },
        }),
      );
      const error = await executePlan(params).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SimulationRevertedError);
      expect(error).toMatchObject({ message, revertData: data });
    },
  );

  test.each([
    { name: "limit exceeded", code: -32005, message: "limit exceeded" },
    { name: "internal error", code: -32603, message: "internal error" },
  ])(
    "error: RpcTransportError, never SimulationRevertedError ($name)",
    async ({ code, message }) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({ jsonrpc: "2.0", id: 1, error: { code, message } }),
      );
      const error = await executePlan(params).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RpcTransportError);
      expect(error).not.toBeInstanceOf(SimulationRevertedError);
    },
  );
});

describe.sequential("chaos: S3 malformed JSON-RPC body", () => {
  test("error: InvalidSimulationResponseError for a non-JSON 200 body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>ok</html>"));
    const error = await executePlan(params).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect(error).not.toBeInstanceOf(RpcTransportError);
  });

  test.each([null, 42])(
    "error: InvalidSimulationResponseError for an HTTP 200 JSON body that is not a JSON-RPC object (%j)",
    async (body) => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        }),
      );
      const error = await executePlan(params).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InvalidSimulationResponseError);
      expect(error).not.toBeInstanceOf(RpcTransportError);
    },
  );

  test("error: InvalidSimulationResponseError for an UnknownRpcError with any TypeError cause", async () => {
    const error = await callRpc("eth_simulateV1", () =>
      Promise.reject(
        new UnknownRpcError(
          new TypeError("Right side of assignment cannot be destructured"),
        ),
      ),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect(error).not.toBeInstanceOf(RpcTransportError);
  });

  test("error: RpcTransportError for a non-JSON 503 body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>unavailable</html>", { status: 503 }),
    );
    const error = await executePlan(params).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RpcTransportError);
    expect(error).not.toBeInstanceOf(InvalidSimulationResponseError);
  });

  test.each([
    { status: 402, body: "insufficient funds: upgrade your plan" },
    { status: 503, body: "execution reverted by upstream gateway" },
  ])(
    "error: RpcTransportError for a plain-text $status body that reads like a revert",
    async ({ status, body }) => {
      fetchMock.mockResolvedValueOnce(new Response(body, { status }));
      const error = await executePlan(params).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RpcTransportError);
      expect(error).not.toBeInstanceOf(SimulationRevertedError);
    },
  );

  test.each([
    "execution reverted",
    "insufficient funds for gas * price + value",
  ])(
    "error: InvalidSimulationResponseError for a plain-text 200 body %j",
    async (body) => {
      fetchMock.mockResolvedValueOnce(new Response(body));
      const error = await executePlan(params).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InvalidSimulationResponseError);
      expect(error).not.toBeInstanceOf(SimulationRevertedError);
      expect(error).not.toBeInstanceOf(InvalidChainIdError);
    },
  );

  test.each([200, 400])(
    "error: InvalidChainIdError for a plain-text %i body that reads like a chain-ID rejection",
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        new Response("invalid chain id", { status }),
      );
      const error = await executePlan(params).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InvalidChainIdError);
      expect(error).not.toBeInstanceOf(RpcTransportError);
    },
  );

  test("error: InvalidChainIdError for a JSON-RPC chain-ID rejection with status 400", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32003, message: "invalid chain id for signer" },
        },
        { status: 400 },
      ),
    );
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidChainIdError,
    );
  });

  test("error: RpcTransportError for a JSON-typed 503 with an empty body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("", {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const error = await executePlan(params).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RpcTransportError);
    expect(error).not.toBeInstanceOf(InvalidSimulationResponseError);
    expect((error as RpcTransportError).cause).toMatchObject({
      status: 503,
    });
  });
});

describe.sequential("chaos: S3 JSON-RPC error body under an HTTP status", () => {
  // A well-formed JSON-RPC error is classified by its code and message,
  // whatever the HTTP status it arrives with.
  test.each([
    { status: 200, code: -32000, message: "execution reverted" },
    { status: 500, code: -32000, message: "execution reverted" },
    { status: 503, code: 3, message: "revert" },
  ])(
    "error: SimulationRevertedError for a code $code revert body with status $status",
    async ({ status, code, message }) => {
      fetchMock.mockResolvedValueOnce(
        Response.json(
          { jsonrpc: "2.0", id: 1, error: { code, message } },
          { status },
        ),
      );
      const error = await executePlan(params).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SimulationRevertedError);
      expect(error).not.toBeInstanceOf(RpcTransportError);
    },
  );

  test.each([
    { status: 200, code: -32005, message: "limit exceeded" },
    { status: 429, code: -32005, message: "limit exceeded" },
    { status: 500, code: -32603, message: "internal error" },
    { status: 503, code: -32603, message: "internal error" },
  ])(
    "error: RpcTransportError for a $code body with status $status",
    async ({ status, code, message }) => {
      fetchMock.mockResolvedValueOnce(
        Response.json(
          { jsonrpc: "2.0", id: 1, error: { code, message } },
          { status },
        ),
      );
      const error = await executePlan(params).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RpcTransportError);
      expect(error).not.toBeInstanceOf(SimulationRevertedError);
      expect(error).not.toBeInstanceOf(InvalidSimulationResponseError);
    },
  );
});

describe.sequential("chaos: S9 transport failure", () => {
  test("error: RpcTransportError keeps the cause, one attempt", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const error = await executePlan(params).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RpcTransportError);
    expect((error as RpcTransportError).cause).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
