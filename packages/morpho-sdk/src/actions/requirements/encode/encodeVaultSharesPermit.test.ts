import { Eip5267Domain, getChainAddress, Token } from "@morpho-org/blue-sdk";
import {
  type Address,
  createWalletClient,
  custom,
  maxUint256,
  verifyTypedData,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  AddressMismatchError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NonPositiveInputError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../../types/index.js";
import { selectBundlesSharesPermitSignature } from "../../bundles/common.js";
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

    expect(signed.action).toMatchObject({
      type: "permit",
      args: { spender, amount, deadline: 1_900_000_000n, nonce: 9n },
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

  test("behavior: the signed permit is consumable by the bundles shares selector", async () => {
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
    const { action } = signed;
    if (action.type !== "permit") {
      throw new Error(`expected an ERC-2612 permit action, got ${action.type}`);
    }

    expect(
      selectBundlesSharesPermitSignature([signed], {
        spender,
        amount,
        deadline: 1_900_000_000n,
      }),
    ).toEqual(signed);
  });

  test("action.typedData carries the Vault V2 shares-permit payload", () => {
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

    const typedData = requirement.action.typedData;

    expect(typedData.primaryType).toBe("Permit");
    expect(typedData.types).toEqual(permitTypes);
    expect(typedData.domain).toMatchObject({
      chainId: mainnet.id,
      verifyingContract: vault,
    });
    expect(typedData.message).toMatchObject({
      owner: account.address,
      spender,
      value: amount,
      nonce: 9n,
      deadline: 1_900_000_000n,
    });
  });

  test("error: sign throws AddressMismatchError when signer differs from owner", async () => {
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

    await expect(
      requirement.sign(
        walletClient,
        "0x1111111111111111111111111111111111111111",
      ),
    ).rejects.toBeInstanceOf(AddressMismatchError);
  });

  test("behavior: signing action.typedData externally matches sign()", async () => {
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

    const typedData = requirement.action.typedData;
    const externalSignature = await account.signTypedData(typedData);
    const signed = await requirement.sign(walletClient, account.address);

    expect(externalSignature).toEqual(signed.args.signature);
    await expect(
      verifyTypedData({
        ...typedData,
        address: account.address,
        signature: externalSignature,
      }),
    ).resolves.toBe(true);
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

  test("behavior: does not freeze the caller's Vault V1 EIP-5267 domain", () => {
    const token = new Token({
      address: vault,
      name: "Vault V1",
      eip5267Domain: new Eip5267Domain({
        fields: "0x0f",
        name: "Frozen Vault V1",
        version: "1",
        chainId: BigInt(mainnet.id),
        verifyingContract: vault,
        salt: zeroHash,
        extensions: [],
      }),
    });

    const requirement = encodeVaultSharesPermit({
      vault: token,
      version: "vaultV1",
      spender,
      owner: account.address,
      chainId: mainnet.id,
      nonce: 3n,
      amount,
      deadline: 1_900_000_000n,
    });

    expect(Object.isFrozen(requirement.action.typedData.domain)).toBe(true);
    expect(Object.isFrozen(token.eip5267Domain?.eip712Domain)).toBe(false);
    expect(Object.isFrozen(token.eip5267Domain)).toBe(false);
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

  test("error: ExpiredDeadlineError when deadline is not in the future", () => {
    expect(() =>
      encodeVaultSharesPermit({
        vault: new Token({ address: vault, name: "Vault V2" }),
        version: "vaultV2",
        spender,
        owner: account.address,
        chainId: mainnet.id,
        nonce: 0n,
        amount,
        deadline: 1n,
      }),
    ).toThrow(ExpiredDeadlineError);
  });

  test("error: NonPositiveInputError when deadline is not positive", () => {
    expect(() =>
      encodeVaultSharesPermit({
        vault: new Token({ address: vault, name: "Vault V2" }),
        version: "vaultV2",
        spender,
        owner: account.address,
        chainId: mainnet.id,
        nonce: 0n,
        amount,
        deadline: 0n,
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: InputExceedsMaxError when deadline exceeds uint256", () => {
    expect(() =>
      encodeVaultSharesPermit({
        vault: new Token({ address: vault, name: "Vault V2" }),
        version: "vaultV2",
        spender,
        owner: account.address,
        chainId: mainnet.id,
        nonce: 0n,
        amount,
        deadline: maxUint256 + 1n,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: UnsupportedErc20ApprovalSpenderError", () => {
    expect(() =>
      encodeVaultSharesPermit({
        vault: new Token({ address: vault, name: "Vault V2" }),
        version: "vaultV2",
        spender: "0x1111111111111111111111111111111111111111",
        owner: account.address,
        chainId: mainnet.id,
        nonce: 0n,
        amount,
        deadline: 1_900_000_000n,
      }),
    ).toThrow(UnsupportedErc20ApprovalSpenderError);
  });
});
