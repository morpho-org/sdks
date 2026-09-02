import { Eip5267Domain, getChainAddress, Token } from "@morpho-org/blue-sdk";
import {
  type Address,
  createWalletClient,
  custom,
  verifyTypedData,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  AddressMismatchError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../../types/index.js";
import { encodeVaultSharesPermit } from "./encodeVaultSharesPermit.js";

const vault = "0x0000000000000000000000000000000000002001" as const;
const spender = getChainAddress(mainnet.id, "bundles.vaultExitBundlesV1");
const otherSpender = "0x0000000000000000000000000000000000002999" as const;
const amount = 500n;
const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
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

describe("encodeVaultSharesPermit", () => {
  test("default: signs a bounded Vault V2 permit", async () => {
    const requirement = encodeVaultSharesPermit({
      vault: new Token({ address: vault, name: "Vault V2" }),
      version: "vaultV2",
      spender,
      owner: account.address,
      chainId: mainnet.id,
      nonce: 9n,
      amount,
      deadline: 1_900_000_000n,
    });
    const signed = await requirement.sign(walletClient, account.address);

    expect(signed.action).toEqual({
      type: "permit",
      args: { spender, amount, deadline: 1_900_000_000n },
    });
    expect(signed.args).toMatchObject({
      owner: account.address,
      asset: vault,
      amount,
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
      amount,
      deadline: 1_900_000_000n,
    });

    await expect(
      requirement.sign(walletClient, account.address),
    ).resolves.toMatchObject({ args: { amount, nonce: 3n } });
  });

  test("behavior: accepts the VaultBundlesV1 spender", () => {
    const vaultBundlesV1 = getChainAddress(
      mainnet.id,
      "bundles.vaultBundlesV1",
    );

    expect(() =>
      encodeVaultSharesPermit({
        vault: new Token({ address: vault, name: "Vault V1" }),
        version: "vaultV1",
        spender: vaultBundlesV1,
        owner: account.address,
        chainId: mainnet.id,
        nonce: 3n,
        amount,
        deadline: 1_900_000_000n,
      }),
    ).not.toThrow();
  });

  test("behavior: snapshots permit inputs before signing", async () => {
    const params = {
      vault: new Token({ address: vault, name: "Vault V2" }),
      version: "vaultV2" as const,
      spender: spender as Address,
      owner: account.address,
      chainId: mainnet.id,
      nonce: 9n,
      amount,
      deadline: 1_900_000_000n,
    };
    const requirement = encodeVaultSharesPermit(params);
    params.spender = otherSpender;

    const signed = await requirement.sign(walletClient, account.address);
    const signatureMatchesPreparedSpender = await verifyTypedData({
      address: account.address,
      signature: signed.args.signature,
      domain: { chainId: mainnet.id, verifyingContract: vault },
      types: permitTypes,
      primaryType: "Permit",
      message: {
        owner: account.address,
        spender,
        value: amount,
        nonce: 9n,
        deadline: 1_900_000_000n,
      },
    });

    expect(signatureMatchesPreparedSpender).toBe(true);
    expect(signed.action.args.spender).toBe(spender);
  });

  test("behavior: snapshots the Vault V1 permit domain before signing", async () => {
    const extensions: bigint[] = [];
    const requirement = encodeVaultSharesPermit({
      vault: new Token({
        address: vault,
        name: "Vault V1",
        eip5267Domain: new Eip5267Domain({
          fields: "0x0f",
          name: "Snapshot Vault V1",
          version: "1",
          chainId: BigInt(mainnet.id),
          verifyingContract: vault,
          salt: zeroHash,
          extensions,
        }),
      }),
      version: "vaultV1",
      spender,
      owner: account.address,
      chainId: mainnet.id,
      nonce: 3n,
      amount,
      deadline: 1_900_000_000n,
    });
    extensions.push(1n);

    const signed = await requirement.sign(walletClient, account.address);
    const signatureMatchesPreparedDomain = await verifyTypedData({
      address: account.address,
      signature: signed.args.signature,
      domain: {
        name: "Snapshot Vault V1",
        version: "1",
        chainId: mainnet.id,
        verifyingContract: vault,
      },
      types: permitTypes,
      primaryType: "Permit",
      message: {
        owner: account.address,
        spender,
        value: amount,
        nonce: 3n,
        deadline: 1_900_000_000n,
      },
    });

    expect(signatureMatchesPreparedDomain).toBe(true);
  });

  test("error: AddressMismatchError binds sign() to the prepared owner", async () => {
    const requirement = encodeVaultSharesPermit({
      vault: new Token({ address: vault, name: "Vault V2" }),
      version: "vaultV2",
      spender,
      owner: "0x0000000000000000000000000000000000002999",
      chainId: mainnet.id,
      nonce: 0n,
      amount,
      deadline: 1_900_000_000n,
    });

    await expect(
      requirement.sign(walletClient, account.address),
    ).rejects.toBeInstanceOf(AddressMismatchError);
  });

  test("error: UnsupportedErc20ApprovalSpenderError", () => {
    const generalAdapter1 = getChainAddress(
      mainnet.id,
      "bundler3.generalAdapter1",
    );

    expect(() =>
      encodeVaultSharesPermit({
        vault: new Token({ address: vault, name: "Vault V2" }),
        version: "vaultV2",
        spender: generalAdapter1,
        owner: account.address,
        chainId: mainnet.id,
        nonce: 0n,
        amount,
        deadline: 1_900_000_000n,
      }),
    ).toThrow(UnsupportedErc20ApprovalSpenderError);
  });
});
