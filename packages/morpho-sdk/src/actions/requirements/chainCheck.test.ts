import { createMockClient } from "@morpho-org/test/mock";
import { base, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { ChainIdMismatchError } from "../../types/index.js";
import { createChainCheck } from "./chainCheck.js";

describe("createChainCheck", () => {
  test("is lazy and shares one promise across sequential and concurrent uses", async () => {
    const handle = createMockClient(mainnet);
    const check = createChainCheck(handle.client, mainnet.id);
    expect(handle.request.mock.calls).toHaveLength(0);
    const first = check();
    expect(check()).toBe(first);
    await first;
    expect(check()).toBe(first);
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("independent checks allow transport deduplication but never reuse settled results", async () => {
    const handle = createMockClient(mainnet);
    const first = createChainCheck(handle.client, mainnet.id);
    const second = createChainCheck(handle.client, mainnet.id);
    const firstPromise = first();
    const secondPromise = second();
    expect(secondPromise).not.toBe(firstPromise);
    await Promise.all([firstPromise, secondPromise]);
    // Viem may coalesce simultaneous eth_chainId requests at the transport boundary.
    const concurrentProbes = handle.request.mock.calls.length;
    expect(concurrentProbes).toBeGreaterThanOrEqual(1);
    expect(concurrentProbes).toBeLessThanOrEqual(2);
    await createChainCheck(handle.client, mainnet.id)();
    expect(handle.request.mock.calls).toHaveLength(concurrentProbes + 1);
    handle.request.mockResolvedValue("0x2105");
    await expect(
      createChainCheck(handle.client, mainnet.id)(),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request.mock.calls).toHaveLength(concurrentProbes + 2);
    expect(first()).toBe(firstPromise);
    expect(second()).toBe(secondPromise);
  });

  test("retains a rejected served-chain check without another probe", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockResolvedValue("0x2105");
    const check = createChainCheck(handle.client, mainnet.id);
    const first = check();
    await expect(first).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(check()).toBe(first);
    await expect(check()).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("retains a failed probe and rejects declared-chain mismatches without RPC", async () => {
    const handle = createMockClient(mainnet);
    const failure = new Error("offline");
    handle.request.mockRejectedValue(failure);
    const check = createChainCheck(handle.client, mainnet.id);
    const first = check();
    await expect(first).rejects.toThrow("offline");
    expect(check()).toBe(first);
    const attempts = handle.request.mock.calls.length;
    await expect(check()).rejects.toThrow("offline");
    expect(handle.request.mock.calls).toHaveLength(attempts);
    handle.request.mockClear();
    await expect(
      createChainCheck(handle.client, base.id)(),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request.mock.calls).toHaveLength(0);
  });
});
