import { type Address, createWalletClient, custom, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../../test/fixtures/midnight.js";
import {
  AddressMismatchError,
  InvalidSignatureError,
} from "../../../types/index.js";
import { encodeMidnightBundlesPermit2Transfer } from "./encodeMidnightBundlesPermit2Transfer.js";

describe("encodeMidnightBundlesPermit2Transfer", () => {
  const account = privateKeyToAccount(
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  );
  const client = createWalletClient({
    account,
    chain: {
      id: midnightChainId,
      name: "Midnight Test",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: {
        default: {
          http: ["http://127.0.0.1"],
        },
      },
    },
    transport: custom({
      request: async () => {
        throw new Error("Unexpected RPC request");
      },
    }),
  });

  test("default", async () => {
    const requirement = encodeMidnightBundlesPermit2Transfer({
      token: midnightAddresses.loanToken,
      spender: midnightAddresses.midnightBundles,
      amount: 1_000n,
      chainId: midnightChainId,
      nonce: 42n,
    });

    const signature = await requirement.sign(client, client.account.address);

    expect(requirement.action.type).toBe("permit2Transfer");
    expect(requirement.action.args.spender).toBe(
      midnightAddresses.midnightBundles,
    );
    expect("expiration" in requirement.action.args).toBe(false);
    expect(signature.args.owner).toBe(client.account.address);
    expect(signature.args.asset).toBe(midnightAddresses.loanToken);
    expect(signature.args.amount).toBe(1_000n);
    expect(signature.args.nonce).toBe(42n);
    expect("expiration" in signature.args).toBe(false);
    expect(isHex(signature.args.signature)).toBe(true);
  });

  test("error: AddressMismatchError", async () => {
    const differentAddress =
      "0x0000000000000000000000000000000000000001" as Address;
    const requirement = encodeMidnightBundlesPermit2Transfer({
      token: midnightAddresses.loanToken,
      spender: midnightAddresses.midnightBundles,
      amount: 1_000n,
      chainId: midnightChainId,
      nonce: 42n,
    });

    await expect(requirement.sign(client, differentAddress)).rejects.toThrow(
      new AddressMismatchError(client.account.address, differentAddress),
    );
  });

  test("error: InvalidSignatureError", async () => {
    const wrongSigner = privateKeyToAccount(
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    );
    const invalidSignatureClient = {
      ...client,
      account: {
        ...wrongSigner,
        address: client.account.address,
      },
    };
    const requirement = encodeMidnightBundlesPermit2Transfer({
      token: midnightAddresses.loanToken,
      spender: midnightAddresses.midnightBundles,
      amount: 1_000n,
      chainId: midnightChainId,
      nonce: 42n,
    });

    await expect(
      requirement.sign(invalidSignatureClient, client.account.address),
    ).rejects.toThrow(InvalidSignatureError);
  });
});
