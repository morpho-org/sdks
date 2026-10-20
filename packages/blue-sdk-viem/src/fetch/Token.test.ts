import {
  type Address,
  NATIVE_ADDRESS,
  Token,
  UnknownTokenError,
} from "@morpho-org/blue-sdk";
import { classifyError, expectFailClosed } from "@morpho-org/test/chaos";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  ContractFunctionRevertedError,
  createClient,
  encodeErrorResult,
  erc20Abi,
  erc20Abi_bytes32,
  HttpRequestError,
  http,
  LimitExceededRpcError,
  parseAbi,
  RpcRequestError,
  stringToHex,
} from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, test, vi } from "vitest";
import { expectMalformedMetadataFailure } from "../__test__/errors.js";
import {
  encodeReadResult,
  mockDeploylessRead,
  mockDeploylessReads,
  mockReadFailure,
} from "../__test__/viem.js";
import { erc5267Abi } from "../abis.js";
import { MalformedTokenMetadataError } from "../error.js";
import { abi as tokenQueryAbi } from "../queries/GetToken.js";
import {
  isContractRevertError,
  isTransportError,
  isUndecodableResultError,
} from "../utils.js";
import { fetchToken } from "./Token.js";

const TOKEN: Address = "0x2222222222222222222222222222222222222222";

const DECIMALS_SELECTOR = "0x313ce567";
const SYMBOL_SELECTOR = "0x95d89b41";
const NAME_SELECTOR = "0x06fdde03";
const EIP712_DOMAIN_SELECTOR = "0x84b0196e";

const DOMAIN = {
  fields: "0x0f",
  name: "Mock Token",
  version: "1",
  chainId: 1n,
  verifyingContract: TOKEN,
  salt: `0x${"00".repeat(32)}` as `0x${string}`,
  extensions: [],
};

const mockTokenReads = (
  handle: ReturnType<typeof createMockClient>,
  { name = "Mock Token", symbol = "MOCK", decimals = 18 } = {},
) => {
  mockRead(handle, {
    address: TOKEN,
    abi: erc20Abi,
    functionName: "decimals",
    result: decimals,
  });
  mockRead(handle, {
    address: TOKEN,
    abi: erc20Abi,
    functionName: "symbol",
    result: symbol,
  });
  if (name == null) {
    for (const abi of [erc20Abi, erc20Abi_bytes32])
      mockReadFailure(handle, { address: TOKEN, abi, functionName: "name" });
  } else {
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "name",
      result: name,
    });
  }
  mockReadFailure(handle, {
    address: TOKEN,
    abi: erc5267Abi,
    functionName: "eip712Domain",
  });
};

const mockRevertingRpc = (
  handle: ReturnType<typeof createMockClient>,
  { address = TOKEN, selector }: { address?: Address; selector: string },
) => {
  const target = `${address.toLowerCase()}|${selector.toLowerCase()}`;
  const base = handle.request.getMockImplementation()!;
  handle.request.mockImplementation(async (call) => {
    if (call.method === "eth_call") {
      const [tx] = (call.params ?? []) as [{ to?: Address; data?: string }];
      if (
        `${tx?.to?.toLowerCase()}|${tx?.data?.slice(0, 10).toLowerCase()}` ===
        target
      ) {
        const error = new Error("execution reverted");
        (error as Error & { code?: number }).code = 3;
        throw error;
      }
    }
    return base(call);
  });
};

const mockInfraRpc = (
  handle: ReturnType<typeof createMockClient>,
  { address = TOKEN, selector }: { address?: Address; selector: string },
) => {
  const target = `${address.toLowerCase()}|${selector.toLowerCase()}`;
  const base = handle.request.getMockImplementation()!;
  handle.request.mockImplementation(async (call) => {
    if (call.method === "eth_call") {
      const [tx] = (call.params ?? []) as [{ to?: Address; data?: string }];
      if (
        `${tx?.to?.toLowerCase()}|${tx?.data?.slice(0, 10).toLowerCase()}` ===
        target
      )
        throw new LimitExceededRpcError(new Error("request rate limited"));
    }
    return base(call);
  });
};

// Asserts the full multicall fallback ran: one direct read per ERC-20 field.
const expectDirectReads = (handle: ReturnType<typeof createMockClient>) => {
  const seen = new Set(
    handle.request.mock.calls
      .filter(([call]) => call.method === "eth_call")
      .map(([call]) => {
        const [tx] = (call.params ?? []) as [{ to?: Address; data?: string }];
        return tx?.to?.toLowerCase() === TOKEN.toLowerCase()
          ? tx?.data?.slice(0, 10).toLowerCase()
          : undefined;
      })
      .filter((selector) => selector != null),
  );
  expect(seen).toEqual(
    new Set([
      DECIMALS_SELECTOR,
      SYMBOL_SELECTOR,
      NAME_SELECTOR,
      EIP712_DOMAIN_SELECTOR,
    ]),
  );
};

const httpClient = () =>
  createClient({
    chain: mainnet,
    transport: http("http://localhost/rpc", { retryCount: 0 }),
  });

const jsonRpcError = (id: number, error: { code: number; message: string }) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id, error }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

// viem batches concurrent JSON-RPC calls into one array body; a non-200 reply
// faults the whole request, like the real transports.
const stubJsonRpc = (
  handle: (call: {
    method: string;
    id: number;
    params?: unknown[];
  }) => Response,
) => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (_url, init) => {
    const parsed = JSON.parse(String(init?.body));
    const calls: {
      method: string;
      id: number;
      params?: unknown[];
    }[] = Array.isArray(parsed) ? parsed : [parsed];
    const responses = calls.map(handle);
    const failed = responses.find((response) => response.status !== 200);
    if (failed != null || !Array.isArray(parsed))
      return failed ?? responses[0]!;
    return new Response(
      JSON.stringify(await Promise.all(responses.map((r) => r.json()))),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
};

const rpcResult = (id: number, result: string) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

// Sequential: the tests stub the global fetch; a shared stub would race.
describe.sequential("chaos: S6 token metadata", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("multicall fallback", () => {
    test("error: decimals revert rejects with UnknownTokenError", async () => {
      const handle = createMockClient(mainnet);
      mockTokenReads(handle);
      mockRevertingRpc(handle, { selector: DECIMALS_SELECTOR });

      const error = await expectFailClosed(
        fetchToken(TOKEN, handle.client, { deployless: false }),
        "config",
      );
      expect(error).toBeInstanceOf(UnknownTokenError);
      expect(error).not.toBeInstanceOf(LimitExceededRpcError);
    });

    test("error: decimals returning no data rejects with UnknownTokenError", async () => {
      const handle = createMockClient(mainnet);
      mockTokenReads(handle);
      mockReadFailure(handle, {
        address: TOKEN,
        abi: erc20Abi,
        functionName: "decimals",
      });

      const error = await expectFailClosed(
        fetchToken(TOKEN, handle.client, { deployless: false }),
        "config",
      );
      expect(error).toBeInstanceOf(UnknownTokenError);
    });

    // The string read fails to decode, so the bytes32 retry runs on the same
    // selector — and it fails to decode too: undecodable is absent only for
    // the first `string` read.
    test.each([
      ["name", NAME_SELECTOR],
      ["symbol", SYMBOL_SELECTOR],
    ] as const)(
      "error: %s data undecodable as string and bytes32 rejects",
      async (field, selector) => {
        const handle = createMockClient(mainnet);
        mockTokenReads(handle);
        handle.dispatch.set(`${TOKEN.toLowerCase()}|${selector}`, "0x12");

        const error = await fetchToken(TOKEN, handle.client, {
          deployless: false,
        }).catch((failure: unknown) => failure);
        expectMalformedMetadataFailure(error, field);
        if (error instanceof MalformedTokenMetadataError) {
          expect(error.token).toBe(TOKEN);
          // The `size` check rejects before decoding, so no viem cause exists.
          expect(error.cause).toBeUndefined();
        }
      },
    );

    // Hardhat-style reverts arrive as `-32603` RPC errors on the raw `call`
    // retry; the contract-error mapping must still classify them as reverts.
    test.each([
      ["name", NAME_SELECTOR],
      ["symbol", SYMBOL_SELECTOR],
    ] as const)(
      "behavior: %s bytes32 retry resolving -32603 revert reads as absent",
      async (field, selector) => {
        const handle = createMockClient(mainnet);
        mockTokenReads(handle);
        const target = `${TOKEN.toLowerCase()}|${selector.toLowerCase()}`;
        const base = handle.request.getMockImplementation()!;
        handle.request.mockImplementation(async (call) => {
          if (call.method === "eth_call") {
            const [tx] = (call.params ?? []) as [
              { to?: Address; data?: string },
            ];
            if (
              `${tx?.to?.toLowerCase()}|${tx?.data?.slice(0, 10).toLowerCase()}` ===
              target
            ) {
              const error = new Error(
                "VM Exception while processing transaction: revert",
              );
              (error as Error & { code?: number }).code = -32603;
              throw error;
            }
          }
          return base(call);
        });

        const token = await fetchToken(TOKEN, handle.client, {
          deployless: false,
        });
        expect(token[field]).toBeUndefined();
      },
    );

    test("error: garbled eip712Domain result rejects", async () => {
      const handle = createMockClient(mainnet);
      mockTokenReads(handle);
      handle.dispatch.set(
        `${TOKEN.toLowerCase()}|${EIP712_DOMAIN_SELECTOR}`,
        "0xdeadbeef",
      );

      const error = await fetchToken(TOKEN, handle.client, {
        deployless: false,
      }).catch((failure: unknown) => failure);
      expectMalformedMetadataFailure(error, "eip712Domain");
      if (error instanceof MalformedTokenMetadataError) {
        expect(error.token).toBe(TOKEN);
        expect(isUndecodableResultError(error.cause)).toBe(true);
      }
    });

    test("error: malformed decimals data rejects with UnknownTokenError", async () => {
      const handle = createMockClient(mainnet);
      mockTokenReads(handle);
      handle.dispatch.set(
        `${TOKEN.toLowerCase()}|${DECIMALS_SELECTOR}`,
        "0x12",
      );

      const error = await expectFailClosed(
        fetchToken(TOKEN, handle.client, { deployless: false }),
        "config",
      );
      expect(error).toBeInstanceOf(UnknownTokenError);
    });

    test("error: out-of-range decimals rejects with UnknownTokenError", async () => {
      const handle = createMockClient(mainnet);
      mockTokenReads(handle);
      handle.dispatch.set(
        `${TOKEN.toLowerCase()}|${DECIMALS_SELECTOR}`,
        `0x${(2n ** 200n).toString(16).padStart(64, "0")}`,
      );

      const error = await expectFailClosed(
        fetchToken(TOKEN, handle.client, { deployless: false }),
        "config",
      );
      expect(error).toBeInstanceOf(UnknownTokenError);
    });

    test.each([429, 503])(
      "error: decimals HTTP %i propagates as infra",
      async (status) => {
        stubJsonRpc((body) => {
          if (body.method === "eth_chainId") return rpcResult(body.id, "0x1");
          return new Response("rate limited", { status });
        });

        const error = await expectFailClosed(
          fetchToken(TOKEN, httpClient(), { deployless: false }),
          "infra",
        );
        expect(error).not.toBeInstanceOf(UnknownTokenError);
      },
    );

    test("error: decimals JSON-RPC -32005 propagates as infra", async () => {
      stubJsonRpc((body) => {
        if (body.method === "eth_chainId") return rpcResult(body.id, "0x1");
        return jsonRpcError(body.id, {
          code: -32005,
          message: "limit exceeded",
        });
      });

      const error = await expectFailClosed(
        fetchToken(TOKEN, httpClient(), { deployless: false }),
        "infra",
      );
      expect(error).not.toBeInstanceOf(UnknownTokenError);
    });

    // A geth-style JSON-RPC revert has no code/data payload, so viem maps it to
    // ExecutionRevertedError, not ContractFunctionRevertedError.
    const stubGethRevert = (selector: string, message = "execution reverted") =>
      stubJsonRpc((body) => {
        if (body.method === "eth_chainId") return rpcResult(body.id, "0x1");
        const [tx] = (body.params ?? []) as [{ to?: Address; data?: string }];
        if (tx?.data?.slice(0, 10).toLowerCase() === selector)
          return jsonRpcError(body.id, { code: -32000, message });
        switch (tx?.data?.slice(0, 10).toLowerCase()) {
          case DECIMALS_SELECTOR:
            return rpcResult(
              body.id,
              encodeReadResult(erc20Abi, "decimals", 18),
            );
          case SYMBOL_SELECTOR:
            return rpcResult(
              body.id,
              encodeReadResult(erc20Abi, "symbol", "MOCK"),
            );
          case NAME_SELECTOR:
            return rpcResult(
              body.id,
              encodeReadResult(erc20Abi, "name", "Mock Token"),
            );
        }
        return rpcResult(body.id, "0x");
      });

    test("behavior: geth data-less revert on eip712Domain stays optional", async () => {
      stubGethRevert(EIP712_DOMAIN_SELECTOR);

      const token = await fetchToken(TOKEN, httpClient(), {
        deployless: false,
      });

      expect(token.eip5267Domain).toBeUndefined();
      expect(token.decimals).toBe(18);
    });

    test("error: geth data-less revert on decimals rejects with UnknownTokenError", async () => {
      stubGethRevert(DECIMALS_SELECTOR);

      const error = await expectFailClosed(
        fetchToken(TOKEN, httpClient(), { deployless: false }),
        "config",
      );
      expect(error).toBeInstanceOf(UnknownTokenError);
    });

    test.each([
      ["name", NAME_SELECTOR],
      ["eip712Domain", EIP712_DOMAIN_SELECTOR],
    ] as const)(
      "error: gas allowance error on %s propagates as infra",
      async (_field, selector) => {
        stubGethRevert(selector, "gas required exceeds allowance");

        const error = await fetchToken(TOKEN, httpClient(), {
          deployless: false,
        }).then(
          (token) => (_field === "name" ? token.name : token.eip5267Domain),
          (failure: unknown) => failure,
        );
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(UnknownTokenError);
        expect(isContractRevertError(error)).toBe(false);
        let cause: unknown = error;
        while (cause instanceof Error && !(cause instanceof RpcRequestError))
          cause = cause.cause;
        expect(cause).toBeInstanceOf(RpcRequestError);
        if (cause instanceof RpcRequestError)
          expect(classifyError(cause)).toBe("infra");
      },
    );

    test("error: gas allowance error on decimals propagates as infra", async () => {
      stubGethRevert(DECIMALS_SELECTOR, "gas required exceeds allowance");

      const error = await fetchToken(TOKEN, httpClient(), {
        deployless: false,
      }).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(UnknownTokenError);
      expect(isContractRevertError(error)).toBe(false);
      let cause: unknown = error;
      while (cause instanceof Error && !(cause instanceof RpcRequestError))
        cause = cause.cause;
      expect(cause).toBeInstanceOf(RpcRequestError);
      if (cause instanceof RpcRequestError)
        expect(classifyError(cause)).toBe("infra");
    });

    test("error: geth -32000 non-revert error propagates as infra", async () => {
      stubGethRevert(EIP712_DOMAIN_SELECTOR, "header not found");

      const error = await expectFailClosed(
        fetchToken(TOKEN, httpClient(), { deployless: false }),
        "infra",
      );
      expect(error).not.toBeInstanceOf(UnknownTokenError);
    });

    // A non-200 reply whose JSON-RPC error body says "execution reverted" is
    // stringified into HttpRequestError.details, so viem wraps it in
    // ExecutionRevertedError — but it is still a transport failure, never an
    // absent metadata read.
    const stubRevertText503 = (selector: string) =>
      stubJsonRpc((body) => {
        if (body.method === "eth_chainId") return rpcResult(body.id, "0x1");
        const [tx] = (body.params ?? []) as [{ to?: Address; data?: string }];
        if (tx?.data?.slice(0, 10).toLowerCase() === selector)
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              error: "execution reverted",
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        switch (tx?.data?.slice(0, 10).toLowerCase()) {
          case DECIMALS_SELECTOR:
            return rpcResult(
              body.id,
              encodeReadResult(erc20Abi, "decimals", 18),
            );
          case SYMBOL_SELECTOR:
            return rpcResult(
              body.id,
              encodeReadResult(erc20Abi, "symbol", "MOCK"),
            );
          case NAME_SELECTOR:
            return rpcResult(
              body.id,
              encodeReadResult(erc20Abi, "name", "Mock Token"),
            );
        }
        return rpcResult(body.id, "0x");
      });

    const expect503Rejection = async (promise: Promise<unknown>) => {
      const error = await promise.catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(UnknownTokenError);
      expect(isTransportError(error)).toBe(true);
      let cause: unknown = error;
      while (cause instanceof Error && !(cause instanceof HttpRequestError))
        cause = cause.cause;
      expect(cause).toBeInstanceOf(HttpRequestError);
      if (cause instanceof HttpRequestError) {
        expect(cause.status).toBe(503);
        expect(classifyError(cause)).toBe("infra");
      }
    };

    test("error: HTTP 503 body saying execution reverted on name propagates as infra", async () => {
      stubRevertText503(NAME_SELECTOR);

      await expect503Rejection(
        fetchToken(TOKEN, httpClient(), { deployless: false }),
      );
    });

    test("error: HTTP 503 body saying execution reverted on decimals propagates as infra", async () => {
      stubRevertText503(DECIMALS_SELECTOR);

      await expect503Rejection(
        fetchToken(TOKEN, httpClient(), { deployless: false }),
      );
    });

    test.each([
      ["name", "0x06fdde03"],
      ["symbol", "0x95d89b41"],
      ["eip712Domain", "0x84b0196e"],
    ] as const)(
      "error: transport failure on %s read propagates as infra",
      async (_label, selector) => {
        const handle = createMockClient(mainnet);
        mockTokenReads(handle);
        mockInfraRpc(handle, { selector });

        await expectFailClosed(
          fetchToken(TOKEN, handle.client, { deployless: false }),
          "infra",
        );
      },
    );

    test.each([
      ["name", NAME_SELECTOR],
      ["symbol", SYMBOL_SELECTOR],
    ] as const)(
      "error: %s bytes32 retry with non-32-byte data rejects",
      async (field, selector) => {
        const handle = createMockClient(mainnet);
        mockTokenReads(handle);
        // 64 bytes decodes neither as `string` nor as `bytes32`.
        handle.dispatch.set(
          `${TOKEN.toLowerCase()}|${selector}`,
          `0x${"12".repeat(64)}`,
        );

        const error = await fetchToken(TOKEN, handle.client, {
          deployless: false,
        }).catch((failure: unknown) => failure);
        expectMalformedMetadataFailure(error, field);
        if (error instanceof MalformedTokenMetadataError)
          expect(error.token).toBe(TOKEN);
      },
    );

    test("behavior: bytes32 symbol fallback decodes the string", async () => {
      const handle = createMockClient(mainnet);
      mockTokenReads(handle);
      mockReadFailure(handle, {
        address: TOKEN,
        abi: erc20Abi,
        functionName: "symbol",
      });
      mockRead(handle, {
        address: TOKEN,
        abi: erc20Abi_bytes32,
        functionName: "symbol",
        result: stringToHex("MKR", { size: 32 }),
      });

      const token = await fetchToken(TOKEN, handle.client, {
        deployless: false,
      });

      expect(token.symbol).toBe("MKR");
      expect(token.name).toBe("Mock Token");
      expect(token.decimals).toBe(18);
    });

    test("behavior: absent name and symbol stay optional when decimals succeeds", async () => {
      const handle = createMockClient(mainnet);
      mockTokenReads(handle);
      for (const abi of [erc20Abi, erc20Abi_bytes32]) {
        mockReadFailure(handle, {
          address: TOKEN,
          abi,
          functionName: "symbol",
        });
        mockReadFailure(handle, { address: TOKEN, abi, functionName: "name" });
      }

      const token = await fetchToken(TOKEN, handle.client, {
        deployless: false,
      });

      expect(token.decimals).toBe(18);
      expect(token.symbol).toBeUndefined();
      expect(token.name).toBeUndefined();
    });

    test("behavior: genuine zero decimals are kept", async () => {
      const handle = createMockClient(mainnet);
      mockTokenReads(handle, { decimals: 0 });

      const token = await fetchToken(TOKEN, handle.client, {
        deployless: false,
      });

      expect(token.decimals).toBe(0);
    });

    test.each([NAME_SELECTOR, SYMBOL_SELECTOR])(
      "error: %s bytes32 retry propagates infra",
      async (selector) => {
        const handle = createMockClient(mainnet);
        mockTokenReads(handle);
        // The first read gets no data (a real response viem does not retry);
        // the bytes32 retry on the same selector is rate limited.
        handle.dispatch.set(`${TOKEN.toLowerCase()}|${selector}`, "0x");
        const base = handle.request.getMockImplementation()!;
        let calls = 0;
        handle.request.mockImplementation(async (call) => {
          if (call.method === "eth_call") {
            const [tx] = (call.params ?? []) as [
              { to?: Address; data?: string },
            ];
            if (
              tx?.to?.toLowerCase() === TOKEN.toLowerCase() &&
              tx?.data?.slice(0, 10).toLowerCase() === selector &&
              ++calls > 1
            )
              throw new LimitExceededRpcError(
                new Error("request rate limited"),
              );
          }
          return base(call);
        });

        const error = await expectFailClosed(
          fetchToken(TOKEN, handle.client, { deployless: false }),
          "infra",
        );
        expect(error).not.toBeInstanceOf(UnknownTokenError);
        expect(calls).toBeGreaterThanOrEqual(2);
      },
    );
  });

  describe("deployless", () => {
    // The query's `MalformedReturnData(bytes4 selector)` revert maps to the
    // typed error in every deployless mode.
    const mockMalformedQuery = (
      handle: ReturnType<typeof createMockClient>,
      selector: `0x${string}`,
    ) =>
      mockDeploylessReads(handle, [
        new RpcRequestError({
          body: {},
          error: {
            code: 3,
            message: "execution reverted",
            data: encodeErrorResult({
              abi: tokenQueryAbi,
              errorName: "MalformedReturnData",
              args: [selector],
            }),
          },
          url: "http://localhost",
        }),
      ]);

    test.each([
      ["name", "0x06fdde03"],
      ["symbol", "0x95d89b41"],
      ["eip712Domain", "0x84b0196e"],
    ] as const)(
      "error: query MalformedReturnData on %s rejects in both deployless modes",
      async (field, selector) => {
        for (const deployless of ["force", true] as const) {
          const handle = createMockClient(mainnet);
          mockMalformedQuery(handle, selector);
          mockTokenReads(handle);

          const error = await fetchToken(TOKEN, handle.client, {
            deployless,
          }).catch((failure: unknown) => failure);
          expectMalformedMetadataFailure(error, field);
          if (error instanceof MalformedTokenMetadataError)
            expect(error.token).toBe(TOKEN);
        }
      },
    );

    test("error: expectMalformedMetadataFailure rejects a transport error in the chain", () => {
      const error = new MalformedTokenMetadataError(TOKEN, "name", {
        cause: new HttpRequestError({ status: 429, url: "http://rpc.test" }),
      });

      expect(() => expectMalformedMetadataFailure(error, "name")).toThrow();
    });

    test("error: expectMalformedMetadataFailure rejects a chain with another revert", () => {
      const error = new MalformedTokenMetadataError(TOKEN, "name", {
        cause: new ContractFunctionRevertedError({
          abi: tokenQueryAbi,
          data: encodeErrorResult({
            abi: parseAbi(["error OtherError()"]),
            errorName: "OtherError",
          }),
          functionName: "query",
        }),
      });

      expect(() => expectMalformedMetadataFailure(error, "name")).toThrow();
    });

    test("error: query MalformedReturnData with an unknown selector rethrows raw in force mode", async () => {
      const handle = createMockClient(mainnet);
      mockMalformedQuery(handle, "0xdeadbeef");
      mockTokenReads(handle);

      const error = await fetchToken(TOKEN, handle.client, {
        deployless: "force",
      }).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(MalformedTokenMetadataError);
    });

    test("behavior: query MalformedReturnData with an unknown selector falls back to direct reads", async () => {
      const handle = createMockClient(mainnet);
      mockMalformedQuery(handle, "0xdeadbeef");
      mockTokenReads(handle);

      const token = await fetchToken(TOKEN, handle.client, {
        deployless: true,
      });

      expect(token).toBeInstanceOf(Token);
      expect(token.name).toBe("Mock Token");
      expectDirectReads(handle);
    });

    const query = (decimals: bigint) => ({
      decimals,
      hasSymbol: true,
      symbol: "MOCK",
      hasName: true,
      name: "Mock Token",
      stEthPerWstEth: 0n,
      eip5267Domain: DOMAIN,
      hasEip5267Domain: false,
    });

    test("error: query decimals 0 with reverting decimals() rejects with UnknownTokenError", async () => {
      const handle = createMockClient(mainnet);
      mockDeploylessRead(handle, tokenQueryAbi, "query", query(0n));
      mockTokenReads(handle);
      mockRevertingRpc(handle, { selector: DECIMALS_SELECTOR });

      const error = await expectFailClosed(
        fetchToken(TOKEN, handle.client, {}),
        "config",
      );
      expect(error).toBeInstanceOf(UnknownTokenError);
      expectDirectReads(handle);
    });

    test("behavior: query decimals 0 with direct decimals() = 18 resolves with 18", async () => {
      const handle = createMockClient(mainnet);
      mockDeploylessRead(handle, tokenQueryAbi, "query", query(0n));
      mockTokenReads(handle);

      const token = await fetchToken(TOKEN, handle.client, {});

      expect(token).toBeInstanceOf(Token);
      expect(token.decimals).toBe(18);
      expect(token.name).toBe("Mock Token");
      expect(token.symbol).toBe("MOCK");
      expectDirectReads(handle);
    });

    test("behavior: force query decimals 0 with direct decimals() = 18 resolves with 18", async () => {
      const handle = createMockClient(mainnet);
      mockDeploylessRead(handle, tokenQueryAbi, "query", query(0n));
      mockTokenReads(handle);

      const token = await fetchToken(TOKEN, handle.client, {
        deployless: "force",
      });

      expect(token).toBeInstanceOf(Token);
      expect(token.decimals).toBe(18);
      expectDirectReads(handle);
    });

    test("behavior: query decimals 0 confirmed by a zero decimals() read", async () => {
      const handle = createMockClient(mainnet);
      mockDeploylessRead(handle, tokenQueryAbi, "query", query(0n));
      mockTokenReads(handle, { decimals: 0 });

      const token = await fetchToken(TOKEN, handle.client, {});

      expect(token).toBeInstanceOf(Token);
      expect(token.decimals).toBe(0);
      expectDirectReads(handle);
    });

    test("error: query decimals 0 with a 429 decimals() read propagates as infra", async () => {
      stubJsonRpc((body) => {
        if (body.method === "eth_chainId") return rpcResult(body.id, "0x1");
        const [tx] = (body.params ?? []) as [{ to?: Address }];
        if (tx.to == null) {
          // Deployless GetToken query.
          return rpcResult(
            body.id,
            encodeReadResult(tokenQueryAbi, "query", query(0n)),
          );
        }
        return new Response("rate limited", { status: 429 });
      });

      const error = await expectFailClosed(
        fetchToken(TOKEN, httpClient(), {}),
        "infra",
      );
      expect(error).not.toBeInstanceOf(UnknownTokenError);
    });

    test("behavior: non-zero query decimals does not re-read decimals()", async () => {
      const handle = createMockClient(mainnet);
      mockDeploylessRead(handle, tokenQueryAbi, "query", query(6n));

      const token = await fetchToken(TOKEN, handle.client, {});

      expect(token.decimals).toBe(6);
      const decimalsCalls = handle.request.mock.calls.filter(([call]) => {
        if (call.method !== "eth_call") return false;
        const [tx] = (call.params ?? []) as [{ to?: Address; data?: string }];
        return (
          tx?.to?.toLowerCase() === TOKEN.toLowerCase() &&
          tx?.data?.slice(0, 10).toLowerCase() === DECIMALS_SELECTOR
        );
      });
      expect(decimalsCalls).toHaveLength(0);
    });
  });

  test("error: deployless failure falling back to multicall still fails closed", async () => {
    const handle = createMockClient(mainnet);
    const base = handle.request.getMockImplementation()!;
    // A no-data deployless response fails the query without a transport error,
    // so the multicall fallback really runs. Its name() read gets no data; the
    // bytes32 retry on the same selector is rate limited.
    let deploylessCalls = 0;
    let nameCalls = 0;
    handle.request.mockImplementation(async (call) => {
      if (call.method === "eth_call") {
        const [tx] = (call.params ?? []) as [{ to?: Address; data?: string }];
        if (tx?.to == null) {
          deploylessCalls += 1;
          return "0x";
        }
        if (
          tx?.to?.toLowerCase() === TOKEN.toLowerCase() &&
          tx?.data?.slice(0, 10).toLowerCase() === NAME_SELECTOR &&
          ++nameCalls > 1
        )
          throw new LimitExceededRpcError(new Error("request rate limited"));
      }
      return base(call);
    });
    mockTokenReads(handle);
    // The name() read gets no data; the bytes32 retry on the same selector is
    // rate limited (mockTokenReads' dispatch is set first so "0x" wins call 1).
    handle.dispatch.set(`${TOKEN.toLowerCase()}|${NAME_SELECTOR}`, "0x");

    await expectFailClosed(fetchToken(TOKEN, handle.client, {}), "infra");
    expect(deploylessCalls).toBeGreaterThanOrEqual(1);
    expect(nameCalls).toBeGreaterThanOrEqual(2);
  });

  test("default: the native token requires no RPC reads", async () => {
    const { client } = createMockClient(mainnet);

    const token = await fetchToken(NATIVE_ADDRESS, client, {
      deployless: false,
    });

    expect(token).toBeInstanceOf(Token);
  });
});
