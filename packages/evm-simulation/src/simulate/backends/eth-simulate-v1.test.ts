import { type Address, getAddress, numberToHex, zeroAddress } from "viem";
import { vi } from "vitest";
import {
  ExternalServiceError,
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
  SimulationRevertedError,
  UnsupportedVerificationFeatureError,
} from "../../errors.js";
import { encodeUint256, makeTransferLog } from "../../test-helpers/index.js";
import { NATIVE_BALANCE_PROBE_ADDRESS } from "../plan/native-balance-probe.js";
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

/** Queue block → chainId → simulate responses for a happy-path call. */
function respondHappy(calls: CallResult[]) {
  fetchMock
    .mockResolvedValueOnce(rpc(blockResult()))
    .mockResolvedValueOnce(rpc("0x1"))
    .mockResolvedValueOnce(rpc(simulateResult(calls)))
    // Post-simulation reorg check re-fetches the pinned state block.
    .mockResolvedValueOnce(rpc(blockResult()));
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
    const execution = await executePlan(params);
    expect(execution.calls).toHaveLength(3);
    expect(execution.block.stateBlockNumber).toBe(STATE_BLOCK);
    expect(execution.block.blockNumber).toBe(STATE_BLOCK + 1n);
    expect(execution.block.chainId).toBe(1);
    expect(execution.nativeBalances).toHaveLength(2);
    expect(execution.nativeBalances[0]).toMatchObject({
      probeId: "native-balance:before",
      phase: "before",
      account: OWNER,
    });
    expect(Object.isFrozen(execution)).toBe(true);
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
    // Four sequential RPC requests: block, chainId, simulate, reorg-check block.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({ method: "eth_getBlockByNumber" });
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({ method: "eth_chainId" });
  });

  test("behavior: resolves latest exactly once", async () => {
    respondHappy(okCalls(3));
    await executePlan({ ...params, blockNumber: undefined });
    const blockRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(blockRequest.params[0]).toBe("latest");
    const simRequest = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(simRequest.params[1]).toBe(numberToHex(STATE_BLOCK));
  });

  test("error: UnsupportedVerificationFeatureError for preview authorizations once the block is pinned", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"));
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
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"));
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
      fetchMock.mockResolvedValueOnce(rpc(blockResult(overrides)));
      await expect(executePlan(params)).rejects.toBeInstanceOf(
        ExternalServiceError,
      );
      // The failure precedes the feature gate: no eth_simulateV1 issued.
      expect(
        fetchMock.mock.calls.every(
          (call) => !String(call[1]?.body).includes("eth_simulateV1"),
        ),
      ).toBe(true);
    },
  );

  test("error: InvalidSimulationResponseError on chain mismatch", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x89"));
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    // The message names the configured chain, not the credential-bearing URL.
    expect((error as Error).message).toBe(
      "The RPC configured for chain 1 reports chain 137. Fix SimulationConfig.chains.",
    );
    expect((error as InvalidSimulationResponseError).context?.stage).toBe(
      "transport",
    );
    // No eth_simulateV1 request was issued.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(
        (call) => !String(call[1]?.body).includes("eth_simulateV1"),
      ),
    ).toBe(true);
  });

  test("error: ExternalServiceError when eth_chainId fails, even with an insufficient-funds message", async () => {
    fetchMock.mockResolvedValueOnce(rpc(blockResult())).mockResolvedValueOnce(
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
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      );
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect((error as Error).message).not.toContain("rpc.example");
    expect((error as Error).cause).toBeDefined();
  });

  test.each([null, {}, [{ calls: null }], []])(
    "error: InvalidSimulationResponseError for malformed result %j",
    async (result) => {
      fetchMock
        .mockResolvedValueOnce(rpc(blockResult()))
        .mockResolvedValueOnce(rpc("0x1"))
        .mockResolvedValueOnce(rpc(result))
        .mockResolvedValueOnce(rpc(blockResult()));
      await expect(executePlan(params)).rejects.toBeInstanceOf(
        InvalidSimulationResponseError,
      );
    },
  );

  test("error: InvalidSimulationResponseError on call count mismatch", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(simulateResult(okCalls(2))))
      .mockResolvedValueOnce(rpc(blockResult()));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  // Anvil reports the pinned block itself; advancement is not required.
  test("behavior: accepts a simulated block equal to the state block", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(
        rpc(
          simulateResult(okCalls(3), {
            number: numberToHex(STATE_BLOCK),
            timestamp: numberToHex(1_700_000_000n),
          }),
        ),
      )
      .mockResolvedValueOnce(rpc(blockResult()));
    const execution = await executePlan(params);
    expect(execution.block.blockNumber).toBe(STATE_BLOCK);
  });

  test("error: InvalidSimulationResponseError for a block behind the state block", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(
        rpc(
          simulateResult(okCalls(3), {
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
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(
        rpc(
          simulateResult(okCalls(3), {
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
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(
        rpc(
          simulateResult(okCalls(3), {
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
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(simulateResult(okCalls(3))))
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
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(simulateResult(okCalls(3))))
      .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));
    const error = await executePlan(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect((error as Error).message).not.toContain("rpc.example");
    expect((error as Error).cause).toBeDefined();
  });

  test.each([
    [
      "empty gasUsed quantity",
      okCalls(3).map((c) => ({ ...c, gasUsed: "0x" })),
    ],
    ["garbage status", okCalls(3).map((c) => ({ ...c, status: "0xdead" }))],
  ])(
    "error: InvalidSimulationResponseError for %s at the schema boundary",
    async (_name, calls) => {
      fetchMock
        .mockResolvedValueOnce(rpc(blockResult()))
        .mockResolvedValueOnce(rpc("0x1"))
        .mockResolvedValueOnce(rpc(simulateResult(calls)))
        .mockResolvedValueOnce(rpc(blockResult()));
      await expect(executePlan(params)).rejects.toBeInstanceOf(
        InvalidSimulationResponseError,
      );
    },
  );

  test("error: InvalidSimulationResponseError for a bad log address", async () => {
    const calls = okCalls(3);
    calls[1] = {
      ...calls[1],
      logs: [
        {
          address: "0xnotanaddress",
          topics: [`0x${"ab".repeat(32)}`],
          data: "0x",
        },
      ],
    };
    fetchMock
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(simulateResult(calls)))
      .mockResolvedValueOnce(rpc(blockResult()));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      InvalidSimulationResponseError,
    );
  });

  test("error: MissingVerificationEvidenceError when a probe fails", async () => {
    const calls = okCalls(3);
    calls[0] = { status: "0x0", gasUsed: "0x0", returnData: "0x" };
    fetchMock
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(simulateResult(calls)))
      .mockResolvedValueOnce(rpc(blockResult()));
    await expect(executePlan(params)).rejects.toBeInstanceOf(
      MissingVerificationEvidenceError,
    );
  });

  test("error: MissingVerificationEvidenceError on undecodable probe data", async () => {
    const calls = okCalls(3);
    calls[0] = { status: "0x1", gasUsed: "0x0", returnData: "0x1234" };
    fetchMock
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(simulateResult(calls)))
      .mockResolvedValueOnce(rpc(blockResult()));
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
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
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

  test("error: SimulationRevertedError for a node-level revert", async () => {
    fetchMock
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
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
        .mockResolvedValueOnce(rpc(blockResult()))
        .mockResolvedValueOnce(rpc("0x1"))
        .mockResolvedValueOnce(
          Response.json({ jsonrpc: "2.0", id: 1, error: { code, message } }),
        );
      await expect(executePlan(params)).rejects.toBeInstanceOf(
        SimulationRevertedError,
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

  test("behavior: probe readings carry decoded native balances", async () => {
    const calls = okCalls(3);
    calls[0] = { ...calls[0], returnData: encodeUint256(100n) };
    calls[2] = { ...calls[2], returnData: encodeUint256(90n) };
    fetchMock
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(simulateResult(calls)))
      .mockResolvedValueOnce(rpc(blockResult()));
    const execution = await executePlan(params);
    expect(execution.nativeBalances.map((r) => r.assets)).toEqual([100n, 90n]);
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
      .mockResolvedValueOnce(rpc(blockResult()))
      .mockResolvedValueOnce(rpc("0x1"))
      .mockResolvedValueOnce(rpc(simulateResult(calls)))
      .mockResolvedValueOnce(rpc(blockResult()));
    const execution = await executePlan(params);
    const userCall = execution.calls[1]!;
    expect(userCall.planned).toMatchObject({
      type: "transaction",
      transactionIndex: 0,
    });
    expect(userCall.result.status).toBe(true);
    expect(userCall.result.gasUsed).toBe(42_000n);
    expect(userCall.result.returnData).toBe("0xfeed");
    expect(userCall.result.logs).toHaveLength(1);
  });
});
