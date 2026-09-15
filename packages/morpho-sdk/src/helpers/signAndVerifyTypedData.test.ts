import {
  type Chain,
  createWalletClient,
  custom,
  type TypedDataDefinition,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { ChainIdMismatchError, InvalidSignatureError } from "../types/index.js";
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
    ).rejects.toBeInstanceOf(InvalidSignatureError);
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
