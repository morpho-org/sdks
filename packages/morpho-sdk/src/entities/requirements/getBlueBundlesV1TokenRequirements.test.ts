import { addressesRegistry } from "@morpho-org/blue-sdk";
import { permit2Abi } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { createWalletClient, erc20Abi, http, maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, soneium } from "viem/chains";
import { describe, expect, test } from "vitest";
import { getBlueBundlesV1TokenRequirements } from "../../index.js";
import {
  ApprovalAmountLessThanSpendAmountError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  isRequirementApproval,
  isRequirementSignature,
  MissingPermit2TransferFromNonceError,
  NegativeInputError,
  NonPositiveInputError,
  Permit2TransferFromNonceAlreadyUsedError,
} from "../../types/index.js";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
});

describe("getBlueBundlesV1TokenRequirements", () => {
  const { usdc, permit2, bundles } = addressesRegistry[mainnet.id];
  if (permit2 == null || bundles?.blueBundlesV1 == null) {
    throw new Error("BlueBundlesV1 requirements are not registered");
  }
  const blueBundlesV1 = bundles.blueBundlesV1;

  test("validates amounts and deadlines before resolving BlueBundlesV1", async () => {
    const handle = createMockClient(soneium);
    const params = {
      token: account.address,
      owner: account.address,
      chainId: soneium.id,
      deadline: maxUint256,
      supportSignature: false,
    } as const;

    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        ...params,
        amount: 0n,
      }),
    ).resolves.toEqual([]);
    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        ...params,
        amount: -1n,
      }),
    ).rejects.toBeInstanceOf(NegativeInputError);
    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        ...params,
        amount: maxUint256 + 1n,
      }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);
    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        ...params,
        amount: 1n,
        deadline: 0n,
      }),
    ).rejects.toBeInstanceOf(NonPositiveInputError);
    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        ...params,
        amount: 1n,
        deadline: 1n,
      }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        ...params,
        amount: 1n,
        deadline: maxUint256 + 1n,
      }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("returns a direct exact approval when signatures are disabled", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });

    const requirements = await getBlueBundlesV1TokenRequirements(
      handle.client,
      {
        token: usdc,
        amount: 1_000_000n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      },
    );

    expect(requirements).toHaveLength(1);
    expect(isRequirementApproval(requirements[0])).toBe(true);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: blueBundlesV1, amount: 1_000_000n },
    });

    // A reusable `approvalAmount` sets a larger allowance only when one is
    // actually required: an existing allowance that already covers the pull
    // must not emit a redundant approval, even if it is below `approvalAmount`.
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 2_000_000n,
    });
    const coveredRequirements = await getBlueBundlesV1TokenRequirements(
      handle.client,
      {
        token: usdc,
        amount: 1_000_000n,
        approvalAmount: maxUint256,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      },
    );
    expect(coveredRequirements).toHaveLength(0);

    // When the existing allowance does not cover the pull, the reusable
    // `approvalAmount` is the amount set.
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const reusableRequirements = await getBlueBundlesV1TokenRequirements(
      handle.client,
      {
        token: usdc,
        amount: 1_000_000n,
        approvalAmount: maxUint256,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      },
    );
    expect(reusableRequirements).toHaveLength(1);
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

    const requirements = await getBlueBundlesV1TokenRequirements(
      handle.client,
      {
        token: usdc,
        amount: maxUint256,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
        useSimplePermit: true,
        permit2Nonce: maxUint256 - 1n,
      },
    );
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
      getBlueBundlesV1TokenRequirements(handle.client, {
        token: usdc,
        amount: -1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(NegativeInputError);

    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        token: usdc,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: 0n,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(NonPositiveInputError);

    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        token: usdc,
        amount: maxUint256 + 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);

    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        token: usdc,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256 + 1n,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);

    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        token: usdc,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: 1n,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);

    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        token: usdc,
        amount: 2n,
        approvalAmount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(ApprovalAmountLessThanSpendAmountError);

    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        token: usdc,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
      }),
    ).rejects.toBeInstanceOf(MissingPermit2TransferFromNonceError);

    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        token: usdc,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
        permit2Nonce: -1n,
      }),
    ).rejects.toBeInstanceOf(NegativeInputError);

    await expect(
      getBlueBundlesV1TokenRequirements(handle.client, {
        token: usdc,
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
      getBlueBundlesV1TokenRequirements(handle.client, {
        token: usdc,
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
