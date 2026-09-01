import { addressesRegistry } from "@morpho-org/blue-sdk";
import { permit2Abi } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { createWalletClient, erc20Abi, http, maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  ApprovalAmountLessThanSpendAmountError,
  InputExceedsMaxError,
  isRequirementApproval,
  isRequirementSignature,
  MissingPermit2TransferFromNonceError,
  NegativeInputError,
  NonPositiveInputError,
  Permit2TransferFromNonceAlreadyUsedError,
} from "../../types/index.js";
import { getBundlesTokenRequirements } from "./getBundlesTokenRequirements.js";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
});

describe("getBundlesTokenRequirements", () => {
  const { usdc, permit2, bundles } = addressesRegistry[mainnet.id];
  if (permit2 == null || bundles?.blueBundlesV1 == null) {
    throw new Error("BlueBundlesV1 requirements are not registered");
  }
  const blueBundlesV1 = bundles.blueBundlesV1;

  test("returns a direct exact approval when signatures are disabled", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });

    const requirements = await getBundlesTokenRequirements(handle.client, {
      token: usdc,
      spender: blueBundlesV1,
      amount: 1_000_000n,
      owner: account.address,
      chainId: mainnet.id,
      deadline: maxUint256,
      supportSignature: false,
    });

    expect(requirements).toHaveLength(1);
    expect(isRequirementApproval(requirements[0])).toBe(true);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: blueBundlesV1, amount: 1_000_000n },
    });

    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 2_000_000n,
    });
    const reusableRequirements = await getBundlesTokenRequirements(
      handle.client,
      {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1_000_000n,
        approvalAmount: maxUint256,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      },
    );
    expect(reusableRequirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: blueBundlesV1, amount: maxUint256 },
    });
  });

  test("falls back from a failed ERC-2612 nonce probe to the explicit SignatureTransfer nonce", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    mockRead(handle, {
      address: permit2,
      abi: permit2Abi,
      functionName: "nonceBitmap",
      result: 1n,
    });

    const requirements = await getBundlesTokenRequirements(handle.client, {
      token: usdc,
      spender: blueBundlesV1,
      amount: maxUint256,
      owner: account.address,
      chainId: mainnet.id,
      deadline: maxUint256,
      supportSignature: true,
      useSimplePermit: true,
      permit2Nonce: maxUint256 - 1n,
    });
    const signatureRequirement = requirements.at(-1);
    if (!isRequirementSignature(signatureRequirement)) {
      throw new Error("SignatureTransfer requirement is missing");
    }
    const signed = await signatureRequirement.sign(
      walletClient,
      account.address,
    );

    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: permit2 },
    });
    if (signed.action.type !== "permit2TransferFrom") {
      throw new Error("Unexpected signature requirement");
    }
    expect(signed.action.type).toBe("permit2TransferFrom");
    expect(signed.args.nonce).toBe(maxUint256 - 1n);
  });

  test("rejects invalid amounts and unavailable Permit2 nonces", async () => {
    const handle = createMockClient(mainnet);
    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: -1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(NegativeInputError);

    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: 0n,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(NonPositiveInputError);

    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 2n,
        approvalAmount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(ApprovalAmountLessThanSpendAmountError);

    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
      }),
    ).rejects.toBeInstanceOf(MissingPermit2TransferFromNonceError);

    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
        permit2Nonce: -1n,
      }),
    ).rejects.toBeInstanceOf(NegativeInputError);

    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
        permit2Nonce: maxUint256 + 1n,
      }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);

    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    mockRead(handle, {
      address: permit2,
      abi: permit2Abi,
      functionName: "nonceBitmap",
      result: 1n << 7n,
    });
    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
        permit2Nonce: 7n,
      }),
    ).rejects.toBeInstanceOf(Permit2TransferFromNonceAlreadyUsedError);
  });
});
