import { addressesRegistry } from "@morpho-org/blue-sdk";
import { permit2Abi } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  type Address,
  decodeFunctionData,
  encodeFunctionResult,
  type Hex,
  maxUint256,
  zeroAddress,
} from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  ChainIdMismatchError,
  InputExceedsMaxError,
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

  test("behavior: rolls over to the next word when the first is fully consumed", async () => {
    // `mockRead` keys on (address, selector), so both words would collide on one entry.
    // Drive per-word results directly: word 0 fully consumed, word 1 empty.
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method, params }) => {
      if (method === "eth_chainId") return `0x${mainnet.id.toString(16)}`;
      if (method === "eth_call") {
        const [tx] = (params ?? []) as [{ to: Address; data: Hex }];
        const decoded = decodeFunctionData({ abi: permit2Abi, data: tx.data });
        const word = (decoded.args as readonly unknown[])[1] as bigint;
        return encodeFunctionResult({
          abi: permit2Abi,
          functionName: "nonceBitmap",
          result: word === 0n ? maxUint256 : 0n,
        });
      }
      throw new Error(`unhandled RPC ${method}`);
    });

    // First free nonce is the low bit of word 1: (1 << 8) | 0 === 256.
    await expect(
      getUnusedPermit2Nonce(handle.client, { owner, chainId: mainnet.id }),
    ).resolves.toBe(256n);
  });

  test("error: InputExceedsMaxError when startNonce exceeds uint256", async () => {
    const handle = createMockClient(mainnet);
    await expect(
      getUnusedPermit2Nonce(handle.client, {
        owner,
        chainId: mainnet.id,
        startNonce: maxUint256 + 1n,
      }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);
  });
});
