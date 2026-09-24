import { type Address, ethAddress, maxUint256, parseEther, toHex } from "viem";
import { vi } from "vitest";
import {
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
} from "../../errors.js";
import {
  encodeUint256,
  makeTransferLog,
  padAddress,
} from "../../test-helpers/index.js";
import type { RawLog, SimulationTransaction } from "../../types.js";
import { WITHDRAWAL_TOPIC } from "../parsing/transfers.js";
import { simulateV1 } from "./eth-simulate-v1.js";

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x3333333333333333333333333333333333333333";
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const BASIC_TX: SimulationTransaction = { from: USER, to: VAULT, data: "0x12" };
const params = {
  rpcUrl: "https://rpc.example",
  chainId: 1,
  transactions: [BASIC_TX],
};
const fetchMock = vi.fn<typeof fetch>();

// Exercise real viem serialization/parsing; only the HTTP boundary is replaced.
function respond(
  calls: {
    status?: string;
    gasUsed?: string;
    returnData?: string;
    logs?: readonly RawLog[];
  }[],
) {
  fetchMock.mockResolvedValueOnce(
    Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: [
        {
          calls: [
            ...calls.map((call) => ({
              status: "0x1",
              gasUsed: "0x5208",
              returnData: "0x",
              logs: [],
              ...call,
            })),
            // viem simulateCalls appends a sentinel call and removes it from results.
            { status: "0x1", gasUsed: "0x0", returnData: "0x", logs: [] },
          ],
        },
      ],
    }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe.sequential("simulateV1", () => {
  test("default", async () => {
    const logs = [
      makeTransferLog({
        token: USDC,
        from: USER,
        to: VAULT,
        amount: 1_000_000n,
      }),
    ];
    respond([{ logs, returnData: "0xfeed" }, { gasUsed: "0xa410" }]);
    const result = await simulateV1({
      ...params,
      transactions: [BASIC_TX, BASIC_TX],
    });
    expect(result.calls).toEqual([
      { logs, status: true, returnData: "0xfeed", gasUsed: 21_000n },
      { logs: [], status: true, returnData: "0x", gasUsed: 42_000n },
    ]);
    expect(result.assetChanges).toEqual([
      { account: USER, changes: [{ token: USDC, diff: -1_000_000n }] },
      { account: VAULT, changes: [{ token: USDC, diff: 1_000_000n }] },
    ]);
  });

  test.each([undefined, "latest", 20_000_000n] as const)(
    "behavior: serializes block %s and native tracing",
    async (blockNumber) => {
      respond([{}]);
      await simulateV1({ ...params, blockNumber });
      const request: unknown = JSON.parse(
        String(fetchMock.mock.calls[0]?.[1]?.body),
      );
      expect(request).toMatchObject({
        method: "eth_simulateV1",
        params: [
          {
            traceTransfers: true,
            blockStateCalls: [
              {
                calls: [
                  { from: USER, to: VAULT, data: "0x12" },
                  { to: "0x0000000000000000000000000000000000000000" },
                ],
                stateOverrides: { [USER]: { balance: toHex(maxUint256 / 2n) } },
              },
            ],
          },
          typeof blockNumber === "bigint" ? toHex(blockNumber) : "latest",
        ],
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  test("behavior: passes the caller's abort signal to HTTP", async () => {
    respond([{}]);
    const signal = new AbortController().signal;
    await simulateV1({ ...params, signal });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(signal);
  });

  test("behavior: accepts checksum and lowercase versions of one sender", async () => {
    respond([{}, {}]);
    await expect(
      simulateV1({
        ...params,
        transactions: [
          { ...BASIC_TX, from: USDC },
          { ...BASIC_TX, from: USDC.toLowerCase() as Address },
        ],
      }),
    ).resolves.toBeDefined();
  });

  test.for([[], [BASIC_TX, { ...BASIC_TX, from: VAULT }]])(
    "error: SimulationValidationError before RPC for invalid calls",
    async (transactions) => {
      await expect(
        simulateV1({ ...params, transactions }),
      ).rejects.toBeInstanceOf(SimulationValidationError);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test("error: SimulationRevertedError for a failed call", async () => {
    respond([{ status: "0x0" }]);
    await expect(simulateV1(params)).rejects.toBeInstanceOf(
      SimulationRevertedError,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("error: SimulationRevertedError preserves node rejection as its cause", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: 3, message: "execution reverted" },
      }),
    );
    const error = await simulateV1(params).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SimulationRevertedError);
    if (error instanceof SimulationRevertedError) {
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.details).toBe(error.cause);
    }
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test.each([new Error("network refused"), "transport down"])(
    "error: ExternalServiceError for transport failure",
    async (cause) => {
      fetchMock.mockRejectedValueOnce(cause);
      await expect(simulateV1(params)).rejects.toBeInstanceOf(
        ExternalServiceError,
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  test("error: ExternalServiceError for HTTP failure without retries", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("unavailable", { status: 503 }),
    );
    await expect(simulateV1(params)).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("behavior: redacts the RPC endpoint from transport error messages", async () => {
    const rpcUrl = "https://rpc.example/v1/secret-access-key";
    fetchMock.mockResolvedValueOnce(
      new Response("unavailable", { status: 503 }),
    );
    const error = await simulateV1({ ...params, rpcUrl }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ExternalServiceError);
    if (error instanceof ExternalServiceError) {
      expect(error.message).not.toContain("secret-access-key");
      expect(error.message).toContain("status 503");
      expect(error.cause).toBeInstanceOf(Error);
    }
  });

  test("behavior: defaults missing logs, log data and returnData", async () => {
    // Not a transfer-like event: only the raw call shape is under test.
    const topics = [`0x${"ab".repeat(32)}`, padAddress(USER)] as const;
    fetchMock.mockResolvedValueOnce(
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: [
          {
            calls: [
              { status: "0x1", gasUsed: "0x5208" },
              {
                status: "0x1",
                gasUsed: "0x5208",
                returnData: "0x",
                logs: [{ address: USDC, topics }],
              },
              { status: "0x1", gasUsed: "0x0", returnData: "0x", logs: [] },
            ],
          },
        ],
      }),
    );
    const result = await simulateV1({
      ...params,
      transactions: [BASIC_TX, BASIC_TX],
    });
    expect(result.calls[0]).toMatchObject({ returnData: "0x", logs: [] });
    expect(result.calls[1]?.logs[0]).toMatchObject({
      address: USDC,
      topics,
      data: "0x",
    });
  });

  test.each([null, {}, [{ calls: null }]])(
    "error: ExternalServiceError for malformed RPC result %j",
    async (result) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({ jsonrpc: "2.0", id: 1, result }),
      );
      await expect(simulateV1(params)).rejects.toBeInstanceOf(
        ExternalServiceError,
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  test("behavior: nets transfers and omits zero changes", async () => {
    respond([
      {
        logs: [
          makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 5n }),
          makeTransferLog({ token: USDC, from: VAULT, to: USER, amount: 5n }),
        ],
      },
    ]);
    expect((await simulateV1(params)).assetChanges).toEqual([]);
  });

  test("behavior: ignores wrapped-native lookalike events on tokenless chains", async () => {
    respond([
      {
        logs: [
          {
            address: USDC,
            topics: [WITHDRAWAL_TOPIC, padAddress(USER)],
            data: encodeUint256(1000n),
          },
        ],
      },
    ]);
    expect(
      (await simulateV1({ ...params, wNative: null })).assetChanges,
    ).toEqual([]);
  });

  test("behavior: accounts internal native transfers and top-level value exactly once", async () => {
    respond([
      {
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
        logs: [
          makeTransferLog({
            token: ethAddress,
            from: VAULT,
            to: USER,
            amount: parseEther("0.5"),
          }),
        ],
      },
    ]);
    const result = await simulateV1({
      ...params,
      transactions: [{ ...BASIC_TX, value: parseEther("1") }, BASIC_TX],
    });
    expect(result.assetChanges).toEqual([
      {
        account: USER,
        changes: [{ token: ethAddress, diff: -parseEther("0.5") }],
      },
      {
        account: VAULT,
        changes: [{ token: ethAddress, diff: parseEther("0.5") }],
      },
    ]);
  });

  test("behavior: combines ERC-20 and native deltas in token order", async () => {
    respond([
      {
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
    ]);
    expect((await simulateV1(params)).assetChanges).toEqual([
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
