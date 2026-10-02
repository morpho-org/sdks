import { type Address, getAddress, numberToHex } from "viem";
import { vi } from "vitest";
import {
  ExternalServiceError,
  InvalidSimulationResponseError,
  SimulationRevertedError,
  UnsupportedVerificationFeatureError,
} from "../../errors.js";
import { encodeUint256, makeTransferLog } from "../../test-helpers/index.js";
import type { ExecutionPlan } from "../plan/plan-execution.js";
import { planExecution } from "../plan/plan-execution.js";
import { parseRequest } from "../request/index.js";
import { executePlan } from "./eth-simulate-v1.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const VAULT: Address = getAddress("0x3333333333333333333333333333333333333333");
const USDC: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const STATE_BLOCK = 20_000_000n;

const fetchMock = vi.fn<typeof fetch>();

function makePlan(overrides: object = {}): ExecutionPlan {
  return planExecution(
    parseRequest({
      chainId: 1,
      transactions: [{ from: OWNER, to: VAULT, data: "0x12" }],
      ...overrides,
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
  error?: unknown;
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

/** Queue chainId → block → simulate responses for a happy-path call. */
function respondHappy(calls: CallResult[]) {
  fetchMock
    .mockResolvedValueOnce(rpc("0x1"))
    .mockResolvedValueOnce(rpc(blockResult()))
    .mockResolvedValueOnce(rpc(simulateResult(calls)))
    // Post-simulation reorg check re-fetches the pinned state block.
    .mockResolvedValueOnce(rpc(blockResult()));
}

/** One successful call per planned user transaction. */
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
  plan: makePlan({ blockNumber: STATE_BLOCK }),
};

describe.sequential("executePlan", () => {
  test("default", async () => {
    respondHappy(okCalls(1));
    const execution = await executePlan(params);
    expect(execution.transactions).toHaveLength(1);
    expect(execution.block.stateBlockNumber).toBe(STATE_BLOCK);
    expect(execution.block.blockNumber).toBe(STATE_BLOCK + 1n);
    expect(execution.block.chainId).toBe(1);
    expect(Object.isFrozen(execution)).toBe(true);
  });

  test("behavior: request body carries flags and pinned block", async () => {
    respondHappy(okCalls(1));
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
              calls: [{ from: OWNER, to: VAULT, data: "0x12", value: "0x0" }],
            },
          ],
        },
        numberToHex(STATE_BLOCK),
      ],
    });
    // No stateOverrides: ETH movements come from traceTransfers logs.
    const overrides = (
      request as {
        params: [{ blockStateCalls: [{ stateOverrides?: object }] }];
      }
    ).params[0].blockStateCalls[0].stateOverrides;
    expect(overrides).toBeUndefined();
    // Four sequential RPC requests: chainId, block, simulate, reorg-check block.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({ method: "eth_chainId" });
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({ method: "eth_getBlockByNumber" });
  });

  test("behavior: resolves latest exactly once", async () => {
    respondHappy(okCalls(1));
    await executePlan({ ...params, plan: makePlan() });
    const blockRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(blockRequest.params[0]).toBe("latest");
    const simRequest = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(simRequest.params[1]).toBe(numberToHex(STATE_BLOCK));
  });

  test("error: UnsupportedVerificationFeatureError for preview authorizations once the block is pinned", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()));
    const plan = makePlan({
      mode: "preview",
      authorizations: [
        {
          type: "erc20Approval",
          token: USDC,
          owner: OWNER,
          spender: VAULT,
          amount: 100n,
        },
      ],
    });
    const error = await executePlan({ ...params, plan }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(UnsupportedVerificationFeatureError);
    expect((error as UnsupportedVerificationFeatureError).context).toEqual({
      stage: "preparation",
      mode: "preview",
      chainId: 1,
      blockNumber: STATE_BLOCK,
      authorizationIndex: 0,
    });
    // The gate fires before eth_simulateV1: only block + chainId were fetched.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(
        (call) => !String(call[1]?.body).includes("eth_simulateV1"),
      ),
    ).toBe(true);
  });

  test("error: UnsupportedVerificationFeatureError for consumer limits once the block is pinned", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()));
    const plan = makePlan({ limits: { maxSlippageWad: 1n } });
    const error = await executePlan({ ...params, plan }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(UnsupportedVerificationFeatureError);
    expect((error as UnsupportedVerificationFeatureError).context).toEqual({
      stage: "validation",
      mode: "final",
      chainId: 1,
      blockNumber: STATE_BLOCK,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(
        (call) => !String(call[1]?.body).includes("eth_simulateV1"),
      ),
    ).toBe(true);
  });

  test.each([
    { name: "null number", overrides: { number: null } },
    { name: "null hash", overrides: { hash: null } },
  ])(
    "error: ExternalServiceError for a state block with $name",
    async ({ overrides }) => {
      fetchMock
        .mockResolvedValueOnce(rpc("0x1"))
        .mockResolvedValueOnce(rpc(blockResult(overrides)));
      const error = await executePlan(params).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(ExternalServiceError);
      expect((error as Error).message).toContain(
        "a block without number or hash",
      );
      // The chain id was checked, then the block failed: exactly two fetches
      // and no eth_simulateV1 issued.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        fetchMock.mock.calls.every(
          (call) => !String(call[1]?.body).includes("eth_simulateV1"),
        ),
      ).toBe(true);
    },
  );

  test("error: InvalidSimulationResponseError on chain mismatch", async () => {
    fetchMock.mockResolvedValueOnce(rpc("0x89"));
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    // The message names the configured chain, not the credential-bearing URL.
    expect((error as Error).message).toBe(
      "The RPC configured for chain 1 reports chain 137. Fix SimulationConfig.chains.",
    );
    // A bigint pin yields a full transport context.
    expect((error as InvalidSimulationResponseError).context).toEqual({
      stage: "transport",
      chainId: 1,
      mode: "final",
      blockNumber: STATE_BLOCK,
    });
    // The chain check runs first: no block lookup or simulation was issued.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.every(
        (call) => !String(call[1]?.body).includes("eth_simulateV1"),
      ),
    ).toBe(true);
  });

  test("error: InvalidSimulationResponseError beats a failing eth_getBlock on chain mismatch", async () => {
    // Wrong chain AND a rejecting block endpoint: the non-bypassable error wins.
    fetchMock
      .mockResolvedValueOnce(rpc("0x89"))
      .mockRejectedValueOnce(new Error("block not found"));
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect(error).not.toBeInstanceOf(ExternalServiceError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("behavior: chain mismatch on a tag pin carries no context", async () => {
    fetchMock.mockResolvedValueOnce(rpc("0x89"));
    const error = await executePlan({ ...params, plan: makePlan() }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect((error as InvalidSimulationResponseError).context).toBeUndefined();
  });

  test("error: ExternalServiceError when eth_chainId fails, even with an insufficient-funds message", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: 3, message: "insufficient funds" },
      }),
    );
    const error = await executePlan(params).catch((caught: unknown) => caught);
    // Revert classification applies to eth_simulateV1 only.
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect(error).not.toBeInstanceOf(SimulationRevertedError);
  });

  test("error: ExternalServiceError for an eth_simulateV1 HTTP failure without the RPC URL", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      );
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect((error as Error).message).not.toContain("rpc.example");
    expect((error as Error).cause).toBeDefined();
  });

  test.each([
    null,
    {},
    [],
    [{ number: "0x1", timestamp: "0x1", hash: `0x${"cd".repeat(32)}` }],
    simulateResult(okCalls(1), { hash: 5 }),
    simulateResult(okCalls(1), { number: "0x" }),
    simulateResult(okCalls(1), { timestamp: "0x" }),
    [{ calls: null }],
    simulateResult([{ ...okCalls(1)[0]!, gasUsed: "nope" }]),
    simulateResult([
      {
        ...okCalls(1)[0]!,
        logs: [{ address: "0xabc", topics: undefined, data: "0x" }],
      },
    ]),
    simulateResult([
      { ...okCalls(1)[0]!, logs: [{ address: 5, topics: [], data: "0x" }] },
    ]),
    simulateResult([
      { ...okCalls(1)[0]!, logs: [{ address: "0xabc", topics: [], data: 5 }] },
    ]),
  ])(
    "error: InvalidSimulationResponseError for malformed result %j",
    async (result) => {
      fetchMock
        .mockResolvedValueOnce(rpc("0x1"))
        .mockResolvedValueOnce(rpc(blockResult()))
        .mockResolvedValueOnce(rpc(result))
        .mockResolvedValueOnce(rpc(blockResult()));
      await expect(executePlan(params)).rejects.toBeInstanceOf(
        InvalidSimulationResponseError,
      );
    },
  );

  test("error: InvalidSimulationResponseError on call count mismatch", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(okCalls(2))))
      .mockResolvedValueOnce(rpc(blockResult()));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test("error: response evidence beats a failing reorg-check eth_getBlock", async () => {
    // Call-count mismatch evidence is in hand before the reorg re-fetch:
    // a rejecting re-fetch must not downgrade it to ExternalServiceError.
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(okCalls(2))))
      .mockRejectedValueOnce(new Error("gateway down"));
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect(error).not.toBeInstanceOf(ExternalServiceError);
  });

  // Anvil reports the pinned block itself; advancement is not required.
  test("behavior: accepts a simulated block equal to the state block", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        rpc(
          simulateResult(okCalls(1), {
            number: numberToHex(STATE_BLOCK),
            timestamp: numberToHex(1_700_000_000n),
          }),
        ),
      )
      .mockResolvedValueOnce(rpc(blockResult()));
    const execution = await executePlan(params);
    expect(execution.block.blockNumber).toBe(STATE_BLOCK);
  });

  test("error: InvalidSimulationResponseError when the successor reports no parentHash", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        rpc(simulateResult(okCalls(1), { parentHash: undefined })),
      )
      .mockResolvedValueOnce(rpc(blockResult()));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test("error: InvalidSimulationResponseError when the successor parentHash is not the pinned hash", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        rpc(simulateResult(okCalls(1), { parentHash: `0x${"ef".repeat(32)}` })),
      )
      .mockResolvedValueOnce(rpc(blockResult()));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test("behavior: accepts a pinned block report with a different hash (Anvil re-hashes)", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        rpc(
          simulateResult(okCalls(1), {
            number: numberToHex(STATE_BLOCK),
            timestamp: numberToHex(1_700_000_000n),
            hash: `0x${"ef".repeat(32)}`,
          }),
        ),
      )
      .mockResolvedValueOnce(rpc(blockResult()));
    const execution = await executePlan(params);
    expect(execution.block.blockNumber).toBe(STATE_BLOCK);
  });

  test("error: InvalidSimulationResponseError for a two-block response", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        rpc([...(simulateResult(okCalls(1)) as unknown[]), {}]),
      )
      .mockResolvedValueOnce(rpc(blockResult()));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test("error: InvalidSimulationResponseError for a block behind the state block", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        rpc(
          simulateResult(okCalls(1), {
            number: numberToHex(STATE_BLOCK - 1n),
          }),
        ),
      )
      .mockResolvedValueOnce(rpc(blockResult()));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test("error: InvalidSimulationResponseError for a block beyond the state block successor", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        rpc(
          simulateResult(okCalls(1), {
            number: numberToHex(STATE_BLOCK + 2n),
            timestamp: numberToHex(1_700_000_012n),
          }),
        ),
      )
      .mockResolvedValueOnce(rpc(blockResult()));
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
          simulateResult(okCalls(1), {
            timestamp: numberToHex(1_699_999_999n),
          }),
        ),
      )
      .mockResolvedValueOnce(rpc(blockResult()));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test("error: InvalidSimulationResponseError when the state block hash changes mid-flight", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(okCalls(1))))
      // Reorg check re-fetches the pinned block — its hash moved.
      .mockResolvedValueOnce(
        rpc(blockResult({ hash: `0x${"ef".repeat(32)}` })),
      );
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test("error: ExternalServiceError when the reorg-check eth_getBlock fails", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(okCalls(1))))
      .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect((error as Error).message).not.toContain("rpc.example");
    expect((error as Error).cause).toBeDefined();
  });

  test("error: SimulationRevertedError on user call failure, details carry user calls only", async () => {
    const calls = okCalls(1);
    calls[0] = {
      status: "0x0",
      gasUsed: "0x0",
      returnData: "0x",
      error: { code: 3, message: "insufficient funds" },
    };
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(calls)))
      .mockResolvedValueOnce(rpc(blockResult()));
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SimulationRevertedError);
    if (error instanceof SimulationRevertedError) {
      expect(error.reason).toBe("insufficient funds");
      const details = error.details as { transactionIndex: number }[];
      expect(details.every((d) => typeof d.transactionIndex === "number")).toBe(
        true,
      );
    }
  });

  test("error: SimulationRevertedError reports the first user failure, details carry every user call in order", async () => {
    const calls = okCalls(3);
    calls[1] = {
      status: "0x0",
      gasUsed: "0x0",
      returnData: "0x",
      error: { code: 3, message: "first revert" },
    };
    calls[2] = {
      status: "0x0",
      gasUsed: "0x0",
      returnData: "0x",
      error: { code: 3, message: "second revert" },
    };
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(calls)))
      .mockResolvedValueOnce(rpc(blockResult()));
    const plan = planExecution(
      parseRequest({
        chainId: 1,
        transactions: [
          { from: OWNER, to: VAULT, data: "0x12" },
          { from: OWNER, to: VAULT, data: "0x34" },
          { from: OWNER, to: VAULT, data: "0x56" },
        ],
      }),
    );
    const error = await executePlan({ ...params, plan }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(SimulationRevertedError);
    if (error instanceof SimulationRevertedError) {
      // The first failed user call supplies the reason.
      expect(error.reason).toBe("first revert");
      const details = error.details as {
        transactionIndex: number;
        result: { status: boolean };
      }[];
      // All three user calls in plan order — including the successful one.
      expect(details.map((d) => d.transactionIndex)).toEqual([0, 1, 2]);
      expect(details.map((d) => d.result.status)).toEqual([true, false, false]);
    }
  });

  test("error: SimulationRevertedError defaults the reason when the node reports no error", async () => {
    const calls = okCalls(1);
    calls[0] = {
      status: "0x0",
      gasUsed: "0x0",
      returnData: "0x",
    };
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc(simulateResult(calls)))
      .mockResolvedValueOnce(rpc(blockResult()));
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SimulationRevertedError);
    if (error instanceof SimulationRevertedError) {
      expect(error.reason).toBe("Simulation failed");
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
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SimulationRevertedError);
    if (error instanceof SimulationRevertedError) {
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.details).toEqual({
        code: 3,
        shortMessage: expect.any(String),
      });
      expect(JSON.stringify(error.details)).not.toContain("rpc.example");
    }
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
      fetchMock
        .mockResolvedValueOnce(rpc("0x1"))
        .mockResolvedValueOnce(rpc(blockResult()))
        .mockResolvedValueOnce(
          Response.json({ jsonrpc: "2.0", id: 1, error: { code, message } }),
        );
      await expect(executePlan(params)).rejects.toBeInstanceOf(
        SimulationRevertedError,
      );
    },
  );

  test("error: ExternalServiceError for code -32003 without an insufficient-funds message", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32003, message: "transaction rejected" },
        }),
      );
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      ExternalServiceError,
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

  test("behavior: user call logs are normalized into SimulationCall", async () => {
    const calls = okCalls(1);
    calls[0] = {
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
      .mockResolvedValueOnce(rpc(simulateResult(calls)))
      .mockResolvedValueOnce(rpc(blockResult()));
    const execution = await executePlan(params);
    const userCall = execution.transactions[0]!;
    expect(userCall.transactionIndex).toBe(0);
    expect(userCall.result.status).toBe(true);
    expect(userCall.result.gasUsed).toBe(42_000n);
    expect(userCall.result.returnData).toBe("0xfeed");
    expect(userCall.result.logs).toHaveLength(1);
  });
});
