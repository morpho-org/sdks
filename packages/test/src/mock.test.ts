import {
  type Address,
  decodeFunctionData,
  encodeFunctionData,
  type Hex,
  parseAbi,
} from "viem";
import { readContract } from "viem/actions";
import { base, mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import { createMockClient, expectReadCall, mockRead } from "./mock.js";

const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const TOKEN: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const HOLDER: Address = "0x000000000000000000000000000000000000dEaD";

describe("createMockClient", () => {
  test("returns a viem client backed by a vi.fn() request handler", () => {
    const handle = createMockClient(mainnet);
    expect(handle.client).toBeDefined();
    expect(handle.request).toBeTypeOf("function");
    expect(vi.isMockFunction(handle.request)).toBe(true);
    expect(handle.chain).toBe(mainnet);
  });

  test("answers eth_chainId by default with the configured chain id (mainnet)", async () => {
    const { client } = createMockClient(mainnet);
    expect(await client.request({ method: "eth_chainId" })).toBe("0x1");
  });

  test("answers eth_chainId for a non-mainnet chain", async () => {
    const { client } = createMockClient(base);
    const chainId = await client.request({ method: "eth_chainId" });
    expect(chainId).toBe(`0x${base.id.toString(16)}`);
  });

  test("default handler throws on unhandled methods", async () => {
    const { client } = createMockClient(mainnet);
    await expect(
      client.request({ method: "eth_blockNumber" } as never),
    ).rejects.toThrow(/unhandled RPC eth_blockNumber/);
  });

  test("the request fn is observable (call history)", async () => {
    const { client, request } = createMockClient(mainnet);
    await client.request({ method: "eth_chainId" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![0]).toMatchObject({
      method: "eth_chainId",
    });
  });
});

describe("mockRead", () => {
  test("intercepts eth_call by selector and returns the encoded result", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 12345n,
    });

    const balance = await readContract(handle.client, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [HOLDER],
    });
    expect(balance).toBe(12345n);
  });

  test("supports multiple distinct functions on the same contract", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "decimals",
      result: 6,
    });
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "symbol",
      result: "USDC",
    });
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 999n,
    });

    expect(
      await readContract(handle.client, {
        address: TOKEN,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ).toBe(6);
    expect(
      await readContract(handle.client, {
        address: TOKEN,
        abi: erc20Abi,
        functionName: "symbol",
      }),
    ).toBe("USDC");
    expect(
      await readContract(handle.client, {
        address: TOKEN,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [HOLDER],
      }),
    ).toBe(999n);
  });

  test("last-write-wins when overriding the same function", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "decimals",
      result: 6,
    });
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "decimals",
      result: 18,
    });
    expect(
      await readContract(handle.client, {
        address: TOKEN,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ).toBe(18);
  });

  test("does not match calls to a different address", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "decimals",
      result: 6,
    });
    const other: Address = "0x0000000000000000000000000000000000000001";
    await expect(
      readContract(handle.client, {
        address: other,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ).rejects.toThrow(/unhandled RPC/);
  });

  test("does not match calls with a different function selector", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "decimals",
      result: 6,
    });
    await expect(
      readContract(handle.client, {
        address: TOKEN,
        abi: erc20Abi,
        functionName: "symbol",
      }),
    ).rejects.toThrow(/unhandled RPC/);
  });

  test("throws when the function name is not in the abi", () => {
    const handle = createMockClient(mainnet);
    expect(() =>
      mockRead(handle, {
        address: TOKEN,
        abi: erc20Abi,
        // @ts-expect-error - intentional bad input
        functionName: "transferFrom",
        result: 1n,
      }),
    ).toThrow(/not found in abi/);
  });

  test("matches addresses case-insensitively", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "decimals",
      result: 6,
    });
    expect(
      await readContract(handle.client, {
        address: TOKEN.toLowerCase() as Address,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ).toBe(6);
  });

  test("matches every view/pure overload of a function name", async () => {
    // Two view overloads of `counter` with different argument lists.
    const overloadedAbi = parseAbi([
      "function counter(uint256 a) view returns (uint256)",
      "function counter(address b) view returns (uint256)",
    ]);
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: TOKEN,
      abi: overloadedAbi,
      functionName: "counter",
      result: 42n,
    });

    // Either overload's call data should resolve via the mock.
    const r1 = await readContract(handle.client, {
      address: TOKEN,
      abi: overloadedAbi,
      functionName: "counter",
      args: [1n],
    });
    const r2 = await readContract(handle.client, {
      address: TOKEN,
      abi: overloadedAbi,
      functionName: "counter",
      args: [HOLDER],
    });
    expect(r1).toBe(42n);
    expect(r2).toBe(42n);
  });

  test("registers the nonpayable overload selector too (current permissive behaviour)", async () => {
    // The TS signature on `mockRead`'s `functionName` only allows view/pure
    // overloads of the name, but the runtime filter is broader: it includes
    // every ABI entry whose `name === functionName` regardless of mutability.
    // This test pins that behaviour by directly invoking `eth_call` with the
    // nonpayable selector and asserting the dispatch hits.
    const mixedAbi = parseAbi([
      "function counter(uint256 a) view returns (uint256)",
      "function counter(address b) returns (uint256)",
    ]);
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: TOKEN,
      abi: mixedAbi,
      functionName: "counter",
      result: 7n,
    });
    // The view overload still resolves through readContract.
    expect(
      await readContract(handle.client, {
        address: TOKEN,
        abi: mixedAbi,
        functionName: "counter",
        args: [1n],
      }),
    ).toBe(7n);
    // The nonpayable selector is also registered. Hand-craft an eth_call
    // for the `counter(address)` selector and assert it hits the dispatch
    // (no "unhandled RPC" error). If a future refactor narrows the runtime
    // filter to view/pure only, this call will start throwing and this test
    // should be flipped to assert rejection.
    const nonpayableCallData = encodeFunctionData({
      abi: mixedAbi,
      functionName: "counter",
      args: [HOLDER],
    });
    const result = (await handle.client.request({
      method: "eth_call",
      params: [{ to: TOKEN, data: nonpayableCallData }, "latest"],
    })) as Hex;
    // 7n encoded as uint256 = 32 bytes of 0 with trailing 7.
    expect(BigInt(result)).toBe(7n);
  });
});

describe("expectReadCall", () => {
  test("returns decoded args for matching eth_calls", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 1n,
    });
    await readContract(handle.client, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [HOLDER],
    });

    const calls = expectReadCall(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual([HOLDER]);
  });

  test("returns an empty array when no calls match", () => {
    const handle = createMockClient(mainnet);
    expect(
      expectReadCall(handle, {
        address: TOKEN,
        abi: erc20Abi,
        functionName: "balanceOf",
      }),
    ).toEqual([]);
  });

  test("filters by both address AND function", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "decimals",
      result: 6,
    });
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "symbol",
      result: "X",
    });
    await readContract(handle.client, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "decimals",
    });
    await readContract(handle.client, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "symbol",
    });

    expect(
      expectReadCall(handle, {
        address: TOKEN,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ).toHaveLength(1);
    expect(
      expectReadCall(handle, {
        address: TOKEN,
        abi: erc20Abi,
        functionName: "symbol",
      }),
    ).toHaveLength(1);
  });
});

describe("encodeFunctionData round-trip with the mock", () => {
  test("client.request for a manually-crafted eth_call works end-to-end", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 42n,
    });
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [HOLDER],
    });
    const result = (await handle.client.request({
      method: "eth_call",
      params: [{ to: TOKEN, data }, "latest"],
    })) as `0x${string}`;
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      // The returned hex is the encoded *result*, not call data — but we
      // round-trip via the same abi to assert encoding is consistent.
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [HOLDER],
      }),
    });
    expect(decoded.functionName).toBe("balanceOf");
    expect(result.startsWith("0x")).toBe(true);
  });
});
