import {
  type Chain,
  concatHex,
  createWalletClient,
  custom,
  type Hex,
  sliceHex,
  type TypedDataDefinition,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  InvalidSignatureError,
  MalformedSignatureError,
} from "../types/index.js";
import { signAndVerifyTypedData } from "./signAndVerifyTypedData.js";

const account = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000001",
);
const otherAccount = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000002",
);
const chain: Chain = { ...mainnet };
const typedData = {
  domain: {
    name: "Morpho Test",
    version: "1",
    chainId: mainnet.id,
    verifyingContract: "0x0000000000000000000000000000000000000001",
  },
  types: {
    Message: [{ name: "value", type: "uint256" }],
  },
  primaryType: "Message",
  message: { value: 1n },
} as const satisfies TypedDataDefinition<Record<string, unknown>, "Message">;

describe("signAndVerifyTypedData", () => {
  test.each([
    { signature: `0x${"11".repeat(64)}`, byteLength: 64, isHex: true },
    { signature: "0xnot-hex", byteLength: undefined, isHex: false },
    { signature: "0x", byteLength: 0, isHex: true },
    { signature: `0x${"00".repeat(64)}1b`, byteLength: 65, isHex: true },
  ] as const)(
    "error: malformed $signature signature",
    async ({ signature, byteLength, isHex }) => {
      const client = createWalletClient({
        account: { ...account, signTypedData: async () => signature as Hex },
        chain,
        transport: custom({ request: async () => "0x" }),
      });
      const error = await signAndVerifyTypedData({
        client,
        userAddress: account.address,
        typedData,
      }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(InvalidSignatureError);
      expect(error).toBeInstanceOf(MalformedSignatureError);
      expect(error).toMatchObject({
        name: "MalformedSignatureError",
        signatureType: "string",
        signatureIsHex: isHex,
        signatureByteLength: byteLength,
        cause: expect.any(Error),
      });
      expect(String(error)).not.toContain(
        signature === "0x" ? '"0x"' : signature,
      );
    },
  );

  test("error: invalid v preserves recovery cause", async () => {
    const valid = await account.signTypedData(typedData);
    const signature = concatHex([sliceHex(valid, 0, 64), "0x1d"]);
    const client = createWalletClient({
      account: { ...account, signTypedData: async () => signature },
      chain,
      transport: custom({ request: async () => "0x" }),
    });
    await expect(
      signAndVerifyTypedData({
        client,
        userAddress: account.address,
        typedData,
      }),
    ).rejects.toMatchObject({
      name: "MalformedSignatureError",
      signatureByteLength: 65,
      cause: expect.any(Error),
    });
  });

  test("error: signing failures are not normalized", async () => {
    const cause = new TypeError("Signing rejected");
    const client = createWalletClient({
      account: {
        ...account,
        signTypedData: async () => {
          throw cause;
        },
      },
      chain,
      transport: custom({ request: async () => "0x" }),
    });
    const error = await signAndVerifyTypedData({
      client,
      userAddress: account.address,
      typedData,
    }).catch((failure: unknown) => failure);
    expect(error).toBe(cause);
  });

  test("error: address pre-check is not normalized", async () => {
    const client = createWalletClient({
      account,
      chain,
      transport: custom({ request: async () => "0x" }),
    });
    await expect(
      signAndVerifyTypedData({
        client,
        userAddress: otherAccount.address,
        typedData,
      }),
    ).rejects.toBeInstanceOf(AddressMismatchError);
  });

  test("behavior: no-arg error retains mismatch message", () => {
    expect(new InvalidSignatureError().message).toBe(
      "Signature verification failed: the signed data does not match the expected signer address",
    );
  });
  test.each([
    { signature: undefined, type: "undefined" },
    { signature: null, type: "object" },
    { signature: 123, type: "number" },
    { signature: {}, type: "object" },
  ])(
    "behavior: redacts non-string signature diagnostics ($type)",
    ({ signature, type }) => {
      const cause = new TypeError("Recovery failed");
      const error = new MalformedSignatureError({
        signature,
        cause,
      });
      expect(error.cause).toBe(cause);
      expect(error.signatureType).toBe(type);
      expect(error.signatureIsHex).toBe(false);
      expect(error.signatureByteLength).toBeUndefined();
      expect(error).not.toHaveProperty("signature");
      expect(error).not.toHaveProperty("reason");
    },
  );
  test("default", async () => {
    const client = createWalletClient({
      account,
      chain,
      transport: custom({ request: async () => "0x" }),
    });

    await expect(
      signAndVerifyTypedData({
        client,
        userAddress: account.address,
        typedData,
      }),
    ).resolves.toMatch(/^0x[0-9a-f]+$/u);
  });

  test("error: InvalidSignatureError", async () => {
    const client = createWalletClient({
      account: account.address,
      chain,
      transport: custom({
        request: async ({ method, params }) => {
          if (
            method === "eth_signTypedData_v4" &&
            Array.isArray(params) &&
            typeof params[1] === "string"
          ) {
            return otherAccount.signTypedData(JSON.parse(params[1]));
          }
          throw new Error(`Unexpected RPC request "${method}".`);
        },
      }),
    });

    await expect(
      signAndVerifyTypedData({
        client,
        userAddress: account.address,
        typedData,
      }),
    ).rejects.toMatchObject({
      name: "InvalidSignatureError",
    });
  });

  test("error: ChainIdMismatchError", async () => {
    const client = createWalletClient({
      account,
      chain: { ...mainnet, id: mainnet.id + 1 },
      transport: custom({ request: async () => "0x" }),
    });

    await expect(
      signAndVerifyTypedData({
        client,
        userAddress: account.address,
        typedData,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });
});
