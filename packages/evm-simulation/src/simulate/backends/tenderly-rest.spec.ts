import type { Address, Hex } from "viem";
import { vi } from "vitest";
import { ExternalServiceError, SimulationRevertedError } from "../../errors.js";
import type { SimulationTransaction, TenderlyRestConfig } from "../../types.js";
import { simulateTenderlyRest } from "./tenderly-rest.js";

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const CONFIG: TenderlyRestConfig = {
  apiUrl: "https://api.tenderly.co/api/v1/account/acct/project/proj",
  accessToken: "test-token",
  supportedChainIds: new Set([1]),
};

const TX1: SimulationTransaction = {
  from: USER,
  to: VAULT,
  data: "0x12" as Hex,
};
const TX2: SimulationTransaction = {
  from: USER,
  to: USDC,
  data: "0x34" as Hex,
};

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
  return JSON.parse(body) as Record<string, unknown>;
}

/** Successful Tenderly single-simulation response body. */
function successBody(
  options: {
    id?: string;
    logs?: unknown[];
    gasUsed?: number;
    output?: Hex;
    assetChanges?: unknown;
  } = {},
) {
  return {
    simulation: { id: options.id ?? "sim-abc", status: true },
    transaction: {
      gas_used: options.gasUsed ?? 21_000,
      transaction_info: {
        logs: options.logs ?? [
          {
            raw: {
              address: USDC,
              topics: ["0xaaaa" as Hex],
              data: "0xdeadbeef" as Hex,
            },
          },
        ],
        asset_changes: options.assetChanges ?? { foo: "bar" },
        call_trace: { output: options.output ?? ("0xfeed" as Hex) },
      },
    },
  };
}

/** Response with simulation.status=false (revert). */
function revertBody() {
  return {
    simulation: {
      id: "sim-abc",
      status: false,
      error_message: "ERC20: revert",
    },
    transaction: {
      error_message: "ERC20: revert",
      gas_used: 21_000,
      transaction_info: {
        logs: [],
        call_trace: { output: "0x" as Hex },
      },
    },
  };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
beforeEach(() => vi.clearAllMocks());

describe.sequential("simulateTenderlyRest — single tx", () => {
  it("calls POST /simulate with correct URL and body", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => successBody(),
    });
    installFetchMock(fetchMock);

    await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      shareable: false,
    });

    const call = fetchMock.mock.calls[0]!;
    const [url] = call;
    const init = requestInit(call);
    expect(url).toBe(
      "https://api.tenderly.co/api/v1/account/acct/project/proj/simulate",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Access-Key"]).toBe(
      "test-token",
    );

    const body = requestBody(call);
    expect(body.network_id).toBe("1");
    expect(body.from).toBe(USER);
    expect(body.to).toBe(VAULT);
    expect(body.simulation_type).toBe("full");
  });

  it("translates shareable=true to save/save_if_fails=true on the wire", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockImplementation(async (url) =>
        String(url).includes("/share")
          ? { ok: true }
          : { ok: true, json: async () => successBody() },
      );
    installFetchMock(fetchMock);

    await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      shareable: true,
    });

    const simulateCall = fetchMock.mock.calls.find(
      (c) => !String(c[0]).includes("/share"),
    )!;
    const body = requestBody(simulateCall);
    expect(body.save).toBe(true);
    expect(body.save_if_fails).toBe(true);
  });

  it("translates shareable=false to save/save_if_fails=false on the wire", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => successBody() });
    installFetchMock(fetchMock);

    await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      shareable: false,
    });

    const body = requestBody(fetchMock.mock.calls[0]!);
    expect(body.save).toBe(false);
    expect(body.save_if_fails).toBe(false);
  });

  it("returns parsed logs and shareable tenderlyUrl when shareable=true and /share succeeds", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockImplementation(async (url) =>
        String(url).includes("/share")
          ? { ok: true }
          : { ok: true, json: async () => successBody({ id: "sim-xyz" }) },
      );
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      shareable: true,
    });

    expect(result.tenderlyUrl).toBe(
      "https://dashboard.tenderly.co/shared/simulation/sim-xyz",
    );
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]!.logs).toHaveLength(1);
    expect(result.calls[0]!.logs[0]!.address).toBe(USDC);
    expect(result.calls[0]!.returnData).toBe("0xfeed");
    expect(result.calls[0]!.gasUsed).toBe(21_000n);
  });

  it("clears tenderlyUrl when /share endpoint call fails", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockImplementation(async (url) =>
        String(url).includes("/share")
          ? { ok: false, status: 500, statusText: "oops" }
          : { ok: true, json: async () => successBody() },
      );
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      shareable: true,
    });

    expect(result.tenderlyUrl).toBeUndefined();
  });

  it("logs and clears tenderlyUrl when /share fetch rejects", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const fetchMock = vi
      .fn<MockFetch>()
      .mockImplementation(async (url) =>
        String(url).includes("/share")
          ? Promise.reject(new Error("share down"))
          : Promise.resolve({ ok: true, json: async () => successBody() }),
      );
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      shareable: true,
      logger,
    });

    expect(result.tenderlyUrl).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      "Tenderly /share fetch failed; tenderlyUrl will be cleared",
      expect.objectContaining({ error: "share down" }),
    );
  });

  it("logs non-Error /share fetch rejections", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const fetchMock = vi
      .fn<MockFetch>()
      .mockImplementation(async (url) =>
        String(url).includes("/share")
          ? Promise.reject("share down")
          : Promise.resolve({ ok: true, json: async () => successBody() }),
      );
    installFetchMock(fetchMock);

    await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      shareable: true,
      logger,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      "Tenderly /share fetch failed; tenderlyUrl will be cleared",
      expect.objectContaining({ error: "share down" }),
    );
  });

  it("propagates AbortError from /share", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockImplementation(async (url) =>
        String(url).includes("/share")
          ? Promise.reject(new DOMException("aborted", "AbortError"))
          : Promise.resolve({ ok: true, json: async () => successBody() }),
      );
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1],
        shareable: true,
      }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("returns undefined tenderlyUrl when shareable=false", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => successBody() });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      shareable: false,
    });

    expect(result.tenderlyUrl).toBeUndefined();
    // Only /simulate hit; no /share
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serializes bigint blockNumber as string in the body", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => successBody() });
    installFetchMock(fetchMock);

    await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      blockNumber: 20_000_000n,
      shareable: false,
    });

    const body = requestBody(fetchMock.mock.calls[0]!);
    expect(body.block_number).toBe("20000000");
  });

  it("passes block tag string through unchanged", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => successBody() });
    installFetchMock(fetchMock);

    await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      blockNumber: "latest",
      shareable: false,
    });

    const body = requestBody(fetchMock.mock.calls[0]!);
    expect(body.block_number).toBe("latest");
  });

  it("returns per-tx assetChanges from transaction_info", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => successBody() });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      shareable: false,
    });

    expect(result.calls[0]!.assetChanges).toEqual({ foo: "bar" });
  });

  it("defaults omitted log fields to empty topics and 0x data", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () =>
        successBody({
          logs: [{ raw: { address: USDC } }, {}],
        }),
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      shareable: false,
    });

    expect(result.calls[0]!.logs).toEqual([
      { address: USDC, topics: [], data: "0x" },
    ]);
  });

  it("defaults omitted Tenderly logs to an empty array", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        simulation: { id: "sim-no-logs", status: true },
        transaction: {
          gas_used: 21_000,
          transaction_info: {
            asset_changes: { foo: "bar" },
            call_trace: { output: "0x" as Hex },
          },
        },
      }),
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      shareable: false,
    });

    expect(result.calls[0]!.logs).toEqual([]);
  });
});

describe.sequential("simulateTenderlyRest — bundle (multi-tx)", () => {
  it("calls POST /simulate-bundle with all txs in the simulations array", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        simulation_results: [successBody(), successBody()],
      }),
    });
    installFetchMock(fetchMock);

    await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1, TX2],
      shareable: false,
    });

    const call = fetchMock.mock.calls[0]!;
    const [url] = call;
    expect(url).toContain("/simulate-bundle");
    const body = requestBody(call);
    expect(body.simulations).toHaveLength(2);
    const simulations = body.simulations as Array<{ to: Address }>;
    expect(simulations[0]!.to).toBe(VAULT);
    expect(simulations[1]!.to).toBe(USDC);
  });

  it("emits one call entry per bundle step with that step's logs, gas, returnData, and assetChanges", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        simulation_results: [
          successBody({
            id: "sim-1",
            logs: [
              {
                raw: {
                  address: USDC,
                  topics: ["0x1111" as Hex],
                  data: "0x" as Hex,
                },
              },
            ],
            gasUsed: 11_000,
            output: "0x1111" as Hex,
            assetChanges: { step: 1 },
          }),
          successBody({
            id: "sim-2",
            logs: [
              {
                raw: {
                  address: USDC,
                  topics: ["0x2222" as Hex],
                  data: "0x" as Hex,
                },
              },
            ],
            gasUsed: 22_000,
            output: "0x2222" as Hex,
            assetChanges: { step: 2 },
          }),
        ],
      }),
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1, TX2],
      shareable: false,
    });

    expect(result.calls).toHaveLength(2);

    expect(result.calls[0]!.logs[0]!.topics[0]).toBe("0x1111");
    expect(result.calls[0]!.gasUsed).toBe(11_000n);
    expect(result.calls[0]!.returnData).toBe("0x1111");
    expect(result.calls[0]!.assetChanges).toEqual({ step: 1 });

    expect(result.calls[1]!.logs[0]!.topics[0]).toBe("0x2222");
    expect(result.calls[1]!.gasUsed).toBe(22_000n);
    expect(result.calls[1]!.returnData).toBe("0x2222");
    expect(result.calls[1]!.assetChanges).toEqual({ step: 2 });
  });

  it("only creates a shareable URL from the LAST bundle step", async () => {
    const fetchMock = vi.fn<MockFetch>().mockImplementation(async (url) => {
      if (String(url).includes("/share")) return { ok: true };
      return {
        ok: true,
        json: async () => ({
          simulation_results: [
            successBody({ id: "first" }),
            successBody({ id: "last" }),
          ],
        }),
      };
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1, TX2],
      shareable: true,
    });

    expect(result.tenderlyUrl).toContain("/last");
    expect(result.tenderlyUrl).not.toContain("/first");

    // Also assert the /share endpoint was called for the LAST simulation id,
    // not the first — the contract is enforced on both the URL build side
    // AND the share call side.
    const shareCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/share"),
    );
    expect(shareCalls).toHaveLength(1);
    expect(String(shareCalls[0]![0])).toContain("/simulations/last/share");
    expect(String(shareCalls[0]![0])).not.toContain("/simulations/first/share");
  });

  it("throws SimulationRevertedError when a bundle step has simulation.status=false", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        simulation_results: [successBody(), revertBody(), successBody()],
      }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1, TX2, TX1],
        shareable: false,
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
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1, TX2],
        shareable: false,
      }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("clears tenderlyUrl when /share fails in bundle mode", async () => {
    const fetchMock = vi.fn<MockFetch>().mockImplementation(async (url) => {
      if (String(url).includes("/share")) {
        return { ok: false, status: 503, statusText: "Service Unavailable" };
      }
      return {
        ok: true,
        json: async () => ({
          simulation_results: [successBody(), successBody({ id: "last" })],
        }),
      };
    });
    installFetchMock(fetchMock);

    const result = await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1, TX2],
      shareable: true,
    });

    expect(result.tenderlyUrl).toBeUndefined();
  });
});

describe.sequential("simulateTenderlyRest — errors", () => {
  it("throws SimulationRevertedError when simulation.status is false", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => revertBody() });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1],
        shareable: false,
      }),
    ).rejects.toThrow(SimulationRevertedError);
  });

  it("throws ExternalServiceError on non-200 response", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1],
        shareable: false,
      }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("wraps unknown fetch errors in ExternalServiceError", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1],
        shareable: false,
      }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("wraps non-Error fetch failures in ExternalServiceError", async () => {
    const fetchMock = vi.fn<MockFetch>().mockRejectedValueOnce("fetch down");
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1],
        shareable: false,
      }),
    ).rejects.toThrow("fetch down");
  });

  it("uses simulation.error_message when transaction error_message is omitted", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        simulation: {
          id: "sim-abc",
          status: false,
          error_message: "simulation-level revert",
        },
        transaction: {
          gas_used: 21_000,
          transaction_info: {
            logs: [],
            call_trace: { output: "0x" as Hex },
          },
        },
      }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1],
        shareable: false,
      }),
    ).rejects.toThrow("simulation-level revert");
  });

  it("uses a generic revert message when Tenderly omits all error messages", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        simulation: {
          id: "sim-abc",
          status: false,
        },
        transaction: {
          gas_used: 21_000,
          transaction_info: {
            logs: [],
            call_trace: { output: "0x" as Hex },
          },
        },
      }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1],
        shareable: false,
      }),
    ).rejects.toThrow("Transaction simulation reverted");
  });

  it("throws ExternalServiceError when bundle returns empty simulation_results", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ simulation_results: [] }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1, TX2],
        shareable: false,
      }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("passes AbortSignal to fetch", async () => {
    const fetchMock = vi
      .fn<MockFetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => successBody() });
    installFetchMock(fetchMock);

    const controller = new AbortController();
    await simulateTenderlyRest({
      config: CONFIG,
      chainId: 1,
      transactions: [TX1],
      shareable: false,
      signal: controller.signal,
    });

    expect(requestInit(fetchMock.mock.calls[0]!).signal).toBe(
      controller.signal,
    );
  });

  it("throws ExternalServiceError when the response body does not match the schema", async () => {
    // Malformed body: `simulation` is missing entirely. Zod validation fails
    // and the catch-all wraps it as ExternalServiceError (treated as transient
    // by the caller — fallback will be attempted).
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ not: "a valid tenderly response" }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1],
        shareable: false,
      }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("throws ExternalServiceError when a Tenderly log has a non-hex address", async () => {
    // Schema validates `raw.address` as a well-formed EVM address. A
    // malformed address in the response is Tenderly-side data corruption —
    // classify as transient and let the caller fall back rather than
    // silently dropping the log downstream.
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        simulation: { id: "sim-bad", status: true },
        transaction: {
          gas_used: 21_000,
          transaction_info: {
            logs: [
              {
                raw: {
                  address: "not-a-hex-address",
                  topics: ["0xaaaa"],
                  data: "0xdeadbeef",
                },
              },
            ],
            call_trace: { output: "0x" as Hex },
          },
        },
      }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1],
        shareable: false,
      }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("throws ExternalServiceError when a successful Tenderly response omits gas_used", async () => {
    // The schema requires `gas_used` on every successful sim. Tenderly always
    // populates it; absence is treated as a contract violation, not silently
    // defaulted to 0n.
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        simulation: { id: "sim-no-gas", status: true },
        transaction: {
          transaction_info: {
            logs: [],
            asset_changes: { foo: "bar" },
            call_trace: { output: "0x" as Hex },
          },
          // gas_used omitted
        },
      }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1],
        shareable: false,
      }),
    ).rejects.toThrow(ExternalServiceError);
  });

  it("throws ExternalServiceError when a successful Tenderly response omits call_trace.output", async () => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        simulation: { id: "sim-no-output", status: true },
        transaction: {
          gas_used: 21_000,
          transaction_info: {
            logs: [],
            asset_changes: { foo: "bar" },
            // call_trace omitted
          },
        },
      }),
    });
    installFetchMock(fetchMock);

    await expect(
      simulateTenderlyRest({
        config: CONFIG,
        chainId: 1,
        transactions: [TX1],
        shareable: false,
      }),
    ).rejects.toThrow(ExternalServiceError);
  });
});
