import { type Address, ethAddress, type Hex, zeroAddress } from "viem";
import { vi } from "vitest";
import {
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
} from "../../errors.js";
import type { SimulationTransaction, TenderlyRpcConfig } from "../../types.js";
import { simulateTenderlyRpc } from "./tenderly-rpc.js";

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const CONFIG: TenderlyRpcConfig = {
  rpcUrl: "https://mainnet.gateway.tenderly.co/test-access-key",
};

const TX1: SimulationTransaction = { from: USER, to: VAULT, data: "0x12" };
const TX2: SimulationTransaction = { from: USER, to: USDC, data: "0x34" };

type MockFetch = (
  url: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<unknown>;

function installFetchMock(fetchMock: MockFetch) {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

function requestInit(call: Parameters<MockFetch>) {
  const init = call[1];
  if (init === undefined) throw new Error("expected fetch init");
  return init;
}

function requestBody(call: Parameters<MockFetch>) {
  const body = requestInit(call).body;
  if (typeof body !== "string") throw new Error("expected string body");
  return JSON.parse(body) as {
    jsonrpc: string;
    id: number;
    method: string;
    params: unknown[];
  };
}

function successResult(
  options: {
    logs?: unknown[];
    gasUsed?: Hex;
    output?: Hex;
    assetChanges?: unknown[];
  } = {},
) {
  return {
    status: true,
    gasUsed: options.gasUsed ?? ("0x5208" as Hex),
    logs: options.logs ?? [
      {
        raw: {
          address: USDC,
          topics: ["0xaaaa" as Hex],
          data: "0xdeadbeef" as Hex,
        },
      },
    ],
    trace: [{ output: options.output ?? ("0xfeed" as Hex) }],
    assetChanges: options.assetChanges ?? [],
  };
}

function assetChange(opts: {
  token?: Address;
  from?: Address;
  to?: Address;
  rawAmount: Hex;
  symbol?: string;
  decimals?: number;
}) {
  return {
    assetInfo: {
      ...(opts.token ? { contractAddress: opts.token } : {}),
      symbol: opts.symbol ?? "USDC",
      decimals: opts.decimals ?? 6,
    },
    type: "Transfer",
    from: opts.from,
    to: opts.to,
    rawAmount: opts.rawAmount,
  };
}

function revertResult() {
  return {
    status: false,
    gasUsed: "0x5208" as Hex,
    errorMessage: "ERC20: revert",
    logs: [],
    trace: [{ output: "0x" as Hex }],
  };
}

function envelope(result: unknown) {
  return { jsonrpc: "2.0", id: 1, result };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
beforeEach(() => vi.clearAllMocks());

describe.sequential("simulateTenderlyRpc — single tx", () => {
  it("POSTs tenderly_simulateTransaction to the RPC URL with the expected body", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope(successResult()),
    });
    installFetchMock(fetchMock);

    await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1],
    });

    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe(CONFIG.rpcUrl);

    const init = requestInit(call);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );

    const body = requestBody(call);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.method).toBe("tenderly_simulateTransaction");
    const [tx, block] = body.params as [
      { from: Address; to: Address; input: Hex; data: Hex; value: Hex },
      string,
    ];
    expect(tx.from).toBe(USER);
    expect(tx.to).toBe(VAULT);
    expect(tx.input).toBe("0x12");
    expect(tx.data).toBe("0x12");
    expect(tx.value).toBe("0x0");
    expect(block).toBe("latest");
  });

  it("returns parsed logs, gasUsed and returnData", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope(successResult()),
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1],
    });

    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]!.logs).toHaveLength(1);
    expect(result.calls[0]!.logs[0]!.address).toBe(USDC);
    expect(result.calls[0]!.returnData).toBe("0xfeed");
    expect(result.calls[0]!.gasUsed).toBe(0x5208n);
  });

  it("groups assetChanges by account (both transfer endpoints)", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope(
          successResult({
            assetChanges: [
              assetChange({
                token: USDC,
                from: VAULT,
                to: USER,
                rawAmount: "0xf4240",
              }),
            ],
          }),
        ),
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1],
    });

    expect(result.assetChanges).toEqual([
      {
        account: USER,
        changes: [
          { token: USDC, symbol: "USDC", decimals: 6, diff: 1_000_000n },
        ],
      },
      {
        account: VAULT,
        changes: [
          { token: USDC, symbol: "USDC", decimals: 6, diff: -1_000_000n },
        ],
      },
    ]);
  });

  it("keeps the zero address for mints (from 0x0)", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope(
          successResult({
            assetChanges: [
              assetChange({
                token: USDC,
                from: zeroAddress,
                to: USER,
                rawAmount: "0x5",
              }),
            ],
          }),
        ),
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1],
    });

    expect(result.assetChanges).toEqual([
      {
        account: zeroAddress,
        changes: [{ token: USDC, symbol: "USDC", decimals: 6, diff: -5n }],
      },
      {
        account: USER,
        changes: [{ token: USDC, symbol: "USDC", decimals: 6, diff: 5n }],
      },
    ]);
  });

  it("maps native ETH (no contractAddress) to the eth sentinel", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope(
          successResult({
            assetChanges: [
              assetChange({
                from: USER,
                rawAmount: "0xde0b6b3a7640000",
                symbol: "ETH",
                decimals: 18,
              }),
            ],
          }),
        ),
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1],
    });

    expect(result.assetChanges).toEqual([
      {
        account: USER,
        changes: [
          {
            token: ethAddress,
            symbol: "ETH",
            decimals: 18,
            diff: -1_000_000_000_000_000_000n,
          },
        ],
      },
    ]);
  });

  it("encodes bigint blockNumber as hex", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope(successResult()),
    });
    installFetchMock(fetchMock);

    await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1],
      blockNumber: 20_000_000n,
    });

    const body = requestBody(fetchMock.mock.calls[0]!);
    const [, block] = body.params as [unknown, string];
    expect(block).toBe("0x1312d00");
  });

  it("passes block tag through unchanged", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope(successResult()),
    });
    installFetchMock(fetchMock);

    await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1],
      blockNumber: "pending",
    });

    const body = requestBody(fetchMock.mock.calls[0]!);
    const [, block] = body.params as [unknown, string];
    expect(block).toBe("pending");
  });

  it("inflates the sender ETH balance via state overrides to dodge insufficient-funds false reverts", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope(successResult()),
    });
    installFetchMock(fetchMock);

    await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1],
    });

    const body = requestBody(fetchMock.mock.calls[0]!);
    const [, , overrides] = body.params as [
      unknown,
      unknown,
      Record<Address, { balance: Hex }>,
    ];
    // Half of uint256 (not the ceiling) leaves headroom for inbound native ETH
    // so a refund to the sender does not overflow and revert the transfer.
    expect(overrides[USER]!.balance).toBe(
      "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    );
  });

  it("encodes tx.value as hex", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope(successResult()),
    });
    installFetchMock(fetchMock);

    await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [{ ...TX1, value: 1234n }],
    });

    const body = requestBody(fetchMock.mock.calls[0]!);
    const [tx] = body.params as [{ value: Hex }];
    expect(tx.value).toBe("0x4d2");
  });

  it("defaults omitted log fields to empty topics and 0x data", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope(
          successResult({
            logs: [{ raw: { address: USDC } }, {}],
          }),
        ),
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1],
    });

    expect(result.calls[0]!.logs).toEqual([
      { address: USDC, topics: [], data: "0x" },
    ]);
  });

  it("defaults omitted logs array to empty", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope({
          status: true,
          gasUsed: "0x5208",
          trace: [{ output: "0x" }],
        }),
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1],
    });

    expect(result.calls[0]!.logs).toEqual([]);
  });

  it("defaults missing trace output to 0x", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope({
          status: true,
          gasUsed: "0x5208",
          logs: [],
        }),
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1],
    });

    expect(result.calls[0]!.returnData).toBe("0x");
  });
});

describe.sequential("simulateTenderlyRpc — bundle", () => {
  it("dispatches tenderly_simulateBundle for >1 tx", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope([successResult(), successResult()]),
    });
    installFetchMock(fetchMock);

    await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1, TX2],
    });

    const body = requestBody(fetchMock.mock.calls[0]!);
    expect(body.method).toBe("tenderly_simulateBundle");
    const [txs] = body.params as [
      Array<{ to: Address; data: Hex; input: Hex }>,
      string,
    ];
    expect(txs).toHaveLength(2);
    expect(txs[0]!.to).toBe(VAULT);
    expect(txs[1]!.to).toBe(USDC);
    expect(txs[0]!.data).toBe("0x12");
    expect(txs[0]!.input).toBe("0x12");
    expect(txs[1]!.data).toBe("0x34");
    expect(txs[1]!.input).toBe("0x34");
  });

  it("emits one call per bundle step with its own gas/output/logs", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope([
          successResult({
            logs: [
              { raw: { address: USDC, topics: ["0x1111" as Hex], data: "0x" } },
            ],
            gasUsed: "0x2af8",
            output: "0x1111",
          }),
          successResult({
            logs: [
              { raw: { address: USDC, topics: ["0x2222" as Hex], data: "0x" } },
            ],
            gasUsed: "0x55f0",
            output: "0x2222",
          }),
        ]),
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1, TX2],
    });

    expect(result.calls).toHaveLength(2);
    expect(result.calls[0]!.logs[0]!.topics[0]).toBe("0x1111");
    expect(result.calls[0]!.gasUsed).toBe(0x2af8n);
    expect(result.calls[0]!.returnData).toBe("0x1111");

    expect(result.calls[1]!.logs[0]!.topics[0]).toBe("0x2222");
    expect(result.calls[1]!.gasUsed).toBe(0x55f0n);
    expect(result.calls[1]!.returnData).toBe("0x2222");
  });

  it("nets assetChanges per account across all bundle steps", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope([
          successResult({
            assetChanges: [
              assetChange({ token: USDC, to: USER, rawAmount: "0x3" }),
            ],
          }),
          successResult({
            assetChanges: [
              assetChange({ token: USDC, from: USER, rawAmount: "0x1" }),
              assetChange({ token: USDC, to: VAULT, rawAmount: "0x9" }),
            ],
          }),
        ]),
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1, TX2],
    });

    expect(result.assetChanges).toEqual([
      {
        account: USER,
        changes: [{ token: USDC, symbol: "USDC", decimals: 6, diff: 2n }],
      },
      {
        account: VAULT,
        changes: [{ token: USDC, symbol: "USDC", decimals: 6, diff: 9n }],
      },
    ]);
  });

  it("throws SimulationRevertedError when a bundle step has status=false", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope([successResult(), revertResult(), successResult()]),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({
        config: CONFIG,
        transactions: [TX1, TX2, TX1],
      }),
    ).rejects.toThrow(SimulationRevertedError);
  });

  it("throws ExternalServiceError on non-200 bundle response", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({
        config: CONFIG,
        transactions: [TX1, TX2],
      }),
    ).rejects.toThrow(ExternalServiceError);
  });
});

describe.sequential("simulateTenderlyRpc — errors", () => {
  it("rejects an empty transactions array with SimulationValidationError", async () => {
    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [] }),
    ).rejects.toThrow(SimulationValidationError);
  });

  it("throws SimulationRevertedError when status is false", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope(revertResult()),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1] }),
    ).rejects.toThrow(SimulationRevertedError);
  });

  it("uses a generic revert message when Tenderly omits the error fields", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope({
          status: false,
          gasUsed: "0x5208",
          logs: [],
          trace: [{ output: "0x" }],
        }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1] }),
    ).rejects.toThrow("Transaction simulation reverted");
  });

  it("surfaces the revert reason from trace[].errorReason", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope({
          status: false,
          gasUsed: "0x5208",
          logs: [],
          trace: [
            {
              output: "0x",
              error: "execution reverted",
              errorReason: "ERC20: insufficient allowance",
            },
          ],
        }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1] }),
    ).rejects.toThrow("ERC20: insufficient allowance");
  });

  it("falls back to trace[].error when errorReason is absent", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope({
          status: false,
          gasUsed: "0x5208",
          logs: [],
          trace: [{ output: "0x", error: "execution reverted" }],
        }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1] }),
    ).rejects.toThrow("execution reverted");
  });

  it("throws ExternalServiceError on non-200 response", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1] }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("throws ExternalServiceError when the JSON-RPC envelope carries an error", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "method not allowed" },
      }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1] }),
    ).rejects.toThrow("method not allowed");
  });

  it("throws ExternalServiceError when result is missing", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1 }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1] }),
    ).rejects.toThrow("Tenderly RPC returned no result");
  });

  it("wraps unknown fetch errors in ExternalServiceError", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1] }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("wraps non-Error fetch failures in ExternalServiceError", async () => {
    const fetchMock = vi.fn<MockFetch>().mockRejectedValueOnce("fetch down");
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1] }),
    ).rejects.toThrow("fetch down");
  });

  it("passes AbortSignal to fetch", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope(successResult()),
    });
    installFetchMock(fetchMock);

    const controller = new AbortController();
    await simulateTenderlyRpc({
      config: CONFIG,
      transactions: [TX1],
      signal: controller.signal,
    });

    expect(requestInit(fetchMock.mock.calls[0]!).signal).toBe(
      controller.signal,
    );
  });

  it("throws ExternalServiceError when the response body does not match the schema", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope({ not: "a valid simulation result" }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1] }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("throws ExternalServiceError when a log has a non-hex address", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope({
          status: true,
          gasUsed: "0x5208",
          logs: [
            {
              raw: {
                address: "not-a-hex-address",
                topics: ["0xaaaa"],
                data: "0xdeadbeef",
              },
            },
          ],
          trace: [{ output: "0x" }],
        }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1] }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("throws ExternalServiceError when a successful response omits gasUsed", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        envelope({
          status: true,
          logs: [],
          trace: [{ output: "0x" }],
        }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1] }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("throws ExternalServiceError when a bundle returns an empty array", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope([]),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRpc({ config: CONFIG, transactions: [TX1, TX2] }),
    ).rejects.toThrow(ExternalServiceError);
  });
});
