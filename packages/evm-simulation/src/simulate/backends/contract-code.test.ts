import { type Address, numberToHex } from "viem";
import { vi } from "vitest";
import {
  InvalidSimulationResponseError,
  RpcTransportError,
  SimulationValidationError,
} from "../../errors.js";
import type { ParsedTransaction } from "../request/parse-request.js";
import { createSimulationClient } from "./client.js";
import { assertTransactionTargetsHaveCode } from "./contract-code.js";

const fetchMock = vi.fn<typeof fetch>();
const rpc = (result: unknown) =>
  Response.json({ jsonrpc: "2.0", id: 1, result });

const client = () => createSimulationClient("https://rpc.example");

const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TARGET = "0x2222222222222222222222222222222222222222" as Address;
const OTHER = "0x3333333333333333333333333333333333333333" as Address;

// biome-ignore lint/complexity/useMaxParams: positional fixture builder
const tx = (
  to: Address,
  data: `0x${string}`,
  value = 0n,
): ParsedTransaction => ({ from: FROM, to, data, value });

const baseParams = {
  chainId: 1,
  blockNumber: 20_000_000n,
};

const getCodeCalls = () =>
  fetchMock.mock.calls.filter(
    ([, init]) => JSON.parse(String(init?.body)).method === "eth_getCode",
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe.sequential("assertTransactionTargetsHaveCode", () => {
  test("default: resolves when every calldata target holds code", async () => {
    fetchMock.mockImplementation(async () => rpc("0x6000"));
    await expect(
      assertTransactionTargetsHaveCode({
        client: client(),
        transactions: [tx(TARGET, "0xdeadbeef"), tx(OTHER, "0xdeadbeef")],
        ...baseParams,
      }),
    ).resolves.toBeUndefined();
    expect(getCodeCalls()).toHaveLength(2);
  });

  test("behavior: dedupes targets and skips value-only transfers", async () => {
    fetchMock.mockImplementation(async () => rpc("0x6000"));
    await assertTransactionTargetsHaveCode({
      client: client(),
      transactions: [
        tx(TARGET, "0xdeadbeef"),
        tx(TARGET, "0xcafe"),
        tx(OTHER, "0x", 1_000_000_000_000_000_000n),
      ],
      ...baseParams,
    });
    expect(getCodeCalls()).toHaveLength(1);
  });

  test("behavior: queries code at the pinned block", async () => {
    fetchMock.mockImplementation(async () => rpc("0x6000"));
    await assertTransactionTargetsHaveCode({
      client: client(),
      transactions: [tx(TARGET, "0xdeadbeef")],
      ...baseParams,
    });
    expect(JSON.parse(String(getCodeCalls()[0]?.[1]?.body)).params).toEqual([
      TARGET,
      numberToHex(20_000_000n),
    ]);
  });

  test("error: SimulationValidationError for a code-less calldata target", async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      rpc(
        JSON.parse(String(init?.body)).params[0] === TARGET ? "0x" : "0x6000",
      ),
    );
    const promise = assertTransactionTargetsHaveCode({
      client: client(),
      transactions: [tx(OTHER, "0xdeadbeef"), tx(TARGET, "0xdeadbeef")],
      ...baseParams,
    });
    await expect(promise).rejects.toBeInstanceOf(SimulationValidationError);
    const error = (await promise.catch(
      (e: unknown) => e,
    )) as SimulationValidationError;
    expect(error.fieldErrors).toEqual([
      `transactions[1].to: no contract code at ${TARGET}`,
    ]);
  });

  test("error: a value-only transfer to a code-less target is not blamed", async () => {
    fetchMock.mockImplementation(async () => rpc("0x"));
    const promise = assertTransactionTargetsHaveCode({
      client: client(),
      transactions: [tx(TARGET, "0x", 1n), tx(TARGET, "0xdeadbeef")],
      ...baseParams,
    });
    await expect(promise).rejects.toBeInstanceOf(SimulationValidationError);
    const error = (await promise.catch(
      (e: unknown) => e,
    )) as SimulationValidationError;
    expect(error.fieldErrors).toEqual([
      `transactions[1].to: no contract code at ${TARGET}`,
    ]);
    expect(getCodeCalls()).toHaveLength(1);
  });

  test("error: a fast rejection surfaces in transaction order without an unhandled rejection", async () => {
    // The second target's read rejects before the first's slower read resolves.
    fetchMock.mockImplementation(async (_url, init) => {
      const params = JSON.parse(String(init?.body)).params;
      if (params[0] === TARGET) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return rpc("0x6000");
      }
      throw new TypeError("fetch failed");
    });
    await expect(
      assertTransactionTargetsHaveCode({
        client: client(),
        transactions: [tx(TARGET, "0xdeadbeef"), tx(OTHER, "0xdeadbeef")],
        ...baseParams,
      }),
    ).rejects.toBeInstanceOf(RpcTransportError);
    // Vitest fails the run on an unhandled rejection; reaching here proves none.
  });

  test("error: a confirmed empty target wins over a failed read, first", async () => {
    // transactions[0] is code-less, transactions[1]'s read rejects.
    fetchMock.mockImplementation(async (_url, init) => {
      const params = JSON.parse(String(init?.body)).params;
      if (params[0] === TARGET) return rpc("0x");
      throw new TypeError("fetch failed");
    });
    const promise = assertTransactionTargetsHaveCode({
      client: client(),
      transactions: [tx(TARGET, "0xdeadbeef"), tx(OTHER, "0xdeadbeef")],
      ...baseParams,
    });
    await expect(promise).rejects.toBeInstanceOf(SimulationValidationError);
    const error = (await promise.catch(
      (e: unknown) => e,
    )) as SimulationValidationError;
    expect(error.fieldErrors).toEqual([
      `transactions[0].to: no contract code at ${TARGET}`,
    ]);
  });

  test("error: a confirmed empty target wins over a failed read, last", async () => {
    // transactions[0]'s read rejects, transactions[1] is code-less.
    fetchMock.mockImplementation(async (_url, init) => {
      const params = JSON.parse(String(init?.body)).params;
      if (params[0] === TARGET) throw new TypeError("fetch failed");
      return rpc("0x");
    });
    const promise = assertTransactionTargetsHaveCode({
      client: client(),
      transactions: [tx(TARGET, "0xdeadbeef"), tx(OTHER, "0xdeadbeef")],
      ...baseParams,
    });
    await expect(promise).rejects.toBeInstanceOf(SimulationValidationError);
    const error = (await promise.catch(
      (e: unknown) => e,
    )) as SimulationValidationError;
    expect(error.fieldErrors).toEqual([
      `transactions[1].to: no contract code at ${OTHER}`,
    ]);
  });

  test("error: RpcTransportError when the getCode read fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(
      assertTransactionTargetsHaveCode({
        client: client(),
        transactions: [tx(TARGET, "0xdeadbeef")],
        ...baseParams,
      }),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof RpcTransportError &&
        error.message ===
          "RPC request failed. Check the endpoint and try again.",
    );
  });

  test("error: InvalidSimulationResponseError for a non-JSON 2xx getCode reply", async () => {
    fetchMock.mockImplementation(async () => new Response("<html>ok</html>"));
    const error = await assertTransactionTargetsHaveCode({
      client: client(),
      transactions: [tx(TARGET, "0xdeadbeef")],
      ...baseParams,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect(error).not.toBeInstanceOf(RpcTransportError);
  });

  test("error: InvalidSimulationResponseError for a JSON null 2xx getCode reply", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("null", { headers: { "Content-Type": "application/json" } }),
    );
    const error = await assertTransactionTargetsHaveCode({
      client: client(),
      transactions: [tx(TARGET, "0xdeadbeef")],
      ...baseParams,
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect(error).not.toBeInstanceOf(RpcTransportError);
  });

  test.each([42, true, "ok", [], {}])(
    "error: SimulationValidationError for JSON getCode bodies without an RPC result (%j)",
    async (body) => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        }),
      );
      const error = await assertTransactionTargetsHaveCode({
        client: client(),
        transactions: [tx(TARGET, "0xdeadbeef")],
        ...baseParams,
      }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(error).not.toBeInstanceOf(RpcTransportError);
      expect(error).not.toBeInstanceOf(InvalidSimulationResponseError);
    },
  );

  test.each([
    { order: "outage first", outage: TARGET },
    { order: "outage last", outage: OTHER },
  ])(
    "error: a non-JSON 2xx reply is not masked by a sibling outage ($order)",
    async ({ outage }) => {
      fetchMock.mockImplementation(async (_url, init) => {
        const params = JSON.parse(String(init?.body)).params;
        if (params[0] === outage)
          return new Response("unavailable", { status: 503 });
        return new Response("<html>ok</html>");
      });
      const error = await assertTransactionTargetsHaveCode({
        client: client(),
        transactions: [tx(TARGET, "0xdeadbeef"), tx(OTHER, "0xdeadbeef")],
        ...baseParams,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InvalidSimulationResponseError);
      expect(error).not.toBeInstanceOf(RpcTransportError);
    },
  );
});
