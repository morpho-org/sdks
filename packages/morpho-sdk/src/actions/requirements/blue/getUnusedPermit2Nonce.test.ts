import { addressesRegistry } from "@morpho-org/blue-sdk";
import { permit2Abi } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { zeroAddress } from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  ChainIdMismatchError,
  NegativeInputError,
} from "../../../types/index.js";
import { getUnusedPermit2Nonce } from "./getUnusedPermit2Nonce.js";

const permit2 = addressesRegistry[mainnet.id].permit2;
if (permit2 == null) throw new Error("Permit2 is not registered on mainnet");
const owner = zeroAddress;

const mockBitmap = (result: bigint) => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: permit2,
    abi: permit2Abi,
    functionName: "nonceBitmap",
    result,
  });
  return handle;
};

describe("getUnusedPermit2Nonce", () => {
  test("default: returns 0 when the first bitmap word is empty", async () => {
    const handle = mockBitmap(0n);
    await expect(
      getUnusedPermit2Nonce(handle.client, { owner, chainId: mainnet.id }),
    ).resolves.toBe(0n);
  });

  test("behavior: skips consumed low bits and returns the first free nonce", async () => {
    // bits 0 and 1 set -> the lowest free nonce is 2.
    const handle = mockBitmap(0b11n);
    await expect(
      getUnusedPermit2Nonce(handle.client, { owner, chainId: mainnet.id }),
    ).resolves.toBe(2n);
  });

  test("behavior: honors startNonce within the first word", async () => {
    const handle = mockBitmap(0n);
    await expect(
      getUnusedPermit2Nonce(handle.client, {
        owner,
        chainId: mainnet.id,
        startNonce: 42n,
      }),
    ).resolves.toBe(42n);
  });

  test("error: ChainIdMismatchError when the client targets another chain", async () => {
    const handle = createMockClient(mainnet);
    await expect(
      getUnusedPermit2Nonce(handle.client, { owner, chainId: base.id }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });

  test("error: NegativeInputError when startNonce is negative", async () => {
    const handle = createMockClient(mainnet);
    await expect(
      getUnusedPermit2Nonce(handle.client, {
        owner,
        chainId: mainnet.id,
        startNonce: -1n,
      }),
    ).rejects.toBeInstanceOf(NegativeInputError);
  });
});
