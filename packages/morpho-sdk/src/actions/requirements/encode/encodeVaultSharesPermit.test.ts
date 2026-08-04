import { registerCustomAddresses, Token } from "@morpho-org/blue-sdk";
import { createWalletClient, custom, maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { AddressMismatchError } from "../../../types/index.js";
import { encodeVaultSharesPermit } from "./encodeVaultSharesPermit.js";

const vault = "0x0000000000000000000000000000000000002001" as const;
const spender = "0x0000000000000000000000000000000000002002" as const;
const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: custom({
    request: async () => {
      throw new Error("Unexpected RPC request");
    },
  }),
});

registerCustomAddresses({
  addresses: { [mainnet.id]: { bundles: { vaultExitBundlesV1: spender } } },
});

describe("encodeVaultSharesPermit", () => {
  test("default: signs a max-value Vault V2 permit", async () => {
    const requirement = encodeVaultSharesPermit({
      vault: new Token({ address: vault, name: "Vault V2" }),
      version: "vaultV2",
      spender,
      owner: account.address,
      chainId: mainnet.id,
      nonce: 9n,
      deadline: 1_900_000_000n,
    });
    const signed = await requirement.sign(walletClient, account.address);

    expect(signed.action).toEqual({
      type: "permit",
      args: { spender, amount: maxUint256, deadline: 1_900_000_000n },
    });
    expect(signed.args).toMatchObject({
      owner: account.address,
      asset: vault,
      amount: maxUint256,
      nonce: 9n,
      deadline: 1_900_000_000n,
    });
    expect(signed.args.signature).toMatch(/^0x[0-9a-f]{130}$/);
  });

  test("behavior: signs a standard Vault V1 permit", async () => {
    const requirement = encodeVaultSharesPermit({
      vault: new Token({ address: vault, name: "Vault V1" }),
      version: "vaultV1",
      spender,
      owner: account.address,
      chainId: mainnet.id,
      nonce: 3n,
      deadline: 1_900_000_000n,
    });

    await expect(
      requirement.sign(walletClient, account.address),
    ).resolves.toMatchObject({ args: { amount: maxUint256, nonce: 3n } });
  });

  test("error: AddressMismatchError binds sign() to the prepared owner", async () => {
    const requirement = encodeVaultSharesPermit({
      vault: new Token({ address: vault, name: "Vault V2" }),
      version: "vaultV2",
      spender,
      owner: "0x0000000000000000000000000000000000002999",
      chainId: mainnet.id,
      nonce: 0n,
      deadline: 1_900_000_000n,
    });

    await expect(
      requirement.sign(walletClient, account.address),
    ).rejects.toBeInstanceOf(AddressMismatchError);
  });
});
