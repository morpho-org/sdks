import { createMockClient, type MockClientHandle } from "@morpho-org/test/mock";
import { erc20Abi } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  encodeReadResult,
  extendRpc,
  mockDeploylessRead,
  mockDeploylessReads,
  mockNativeBalance,
} from "./viem.js";

describe("viem test utilities", () => {
  function handleWithoutBaseImplementation() {
    return {
      request: vi.fn(),
    } as unknown as MockClientHandle<typeof mainnet>;
  }

  test("encodeReadResult encodes a read response", () => {
    expect(encodeReadResult(erc20Abi, "decimals", 18)).toMatch(/^0x0{62}12$/);
  });

  test("mockDeploylessReads requires a base mock implementation", () => {
    const handle = handleWithoutBaseImplementation();

    expect(() => mockDeploylessReads(handle, [])).toThrow(
      /mock client has no base implementation/,
    );
  });

  test("mockDeploylessReads delegates non-deployless eth_call to the base handler", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, []);

    await expect(handle.request({ method: "eth_call" })).rejects.toThrow(
      /unhandled RPC eth_call/,
    );
  });

  test("mockDeploylessRead queues ABI-encoded deployless reads", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, erc20Abi, "decimals", 18);

    await expect(
      handle.request({ method: "eth_call", params: [{}] }),
    ).resolves.toMatch(/^0x0{62}12$/);
  });

  test("mockNativeBalance requires a base mock implementation", () => {
    const handle = handleWithoutBaseImplementation();

    expect(() => mockNativeBalance(handle, 1n)).toThrow(
      /mock client has no base implementation/,
    );
  });

  test("mockNativeBalance handles eth_getBalance and delegates other methods", async () => {
    const handle = createMockClient(mainnet);
    mockNativeBalance(handle, 99n);

    await expect(handle.request({ method: "eth_getBalance" })).resolves.toBe(
      "0x63",
    );
    await expect(handle.request({ method: "eth_chainId" })).resolves.toBe(
      "0x1",
    );
  });

  test("extendRpc requires a base mock implementation", () => {
    const handle = handleWithoutBaseImplementation();

    expect(() => extendRpc(handle, vi.fn())).toThrow(
      /mock client has no base implementation/,
    );
  });

  test("extendRpc delegates to the supplied wrapper", async () => {
    const handle = createMockClient(mainnet);
    const wrapper = vi.fn(async (call, base) => {
      if (call.method === "custom_method") return "custom";
      return base(call);
    });

    extendRpc(handle, wrapper);

    await expect(handle.request({ method: "custom_method" })).resolves.toBe(
      "custom",
    );
    await expect(handle.request({ method: "eth_chainId" })).resolves.toBe(
      "0x1",
    );
    expect(wrapper).toHaveBeenCalled();
  });
});
