import { createMockClient } from "@morpho-org/test/mock";
import { BaseError } from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { ChainIdMismatchError } from "../../types/index.js";
import { validateClientChainId } from "./validateClientChainId.js";

describe("validateClientChainId", () => {
  const methods = (handle: ReturnType<typeof createMockClient>) =>
    handle.request.mock.calls.map(([{ method }]) => method);

  test("default: resolves when the declared and observed chains match", async () => {
    const handle = createMockClient(mainnet);
    await expect(
      validateClientChainId(handle.client, mainnet.id),
    ).resolves.toBeUndefined();
    expect(methods(handle)).toEqual(["eth_chainId"]);
  });

  test("[INV-05] error: ChainIdMismatchError without eth_chainId when the declared chain differs", async () => {
    const handle = createMockClient(base);
    await expect(
      validateClientChainId(handle.client, mainnet.id),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("[INV-05] error: ChainIdMismatchError when eth_chainId reports another chain", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockResolvedValue("0x2105");
    const error = await validateClientChainId(handle.client, mainnet.id).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ChainIdMismatchError);
    expect((error as Error).message).toBe(
      `Chain ID mismatch between client: ${base.id} and args: ${mainnet.id}`,
    );
  });

  test("error: propagates a failed eth_chainId request", async () => {
    const handle = createMockClient(mainnet);
    const failure = new Error("connection refused");
    handle.request.mockRejectedValue(failure);
    const error = await validateClientChainId(handle.client, mainnet.id).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BaseError);
    expect(error).not.toBeInstanceOf(ChainIdMismatchError);
    // viem's transport retries the failed request; nothing else is sent.
    expect(new Set(methods(handle))).toEqual(new Set(["eth_chainId"]));
  });
});
