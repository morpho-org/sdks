import { addressesRegistry } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, vi } from "vitest";
import {
  GauntletWethVaultV1,
  SteakhouseUsdcVaultV1,
} from "../../../test/fixtures/vaultV1.js";
import { test } from "../../../test/setup.js";
import {
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  NonPositiveAssetAmountError,
  NonPositiveMaxSharePriceError,
  ZeroDepositAmountError,
  isRequirementApproval,
  isRequirementSignature,
} from "../../types/index.js";
import * as getRequirementsActionModule from "../requirements/getRequirementsAction.js";
import { getRequirements } from "../requirements/index.js";
import { vaultV1Deposit } from "./deposit.js";

describe("depositVaultV1 unit tests", () => {
  const { dai, usdc, wNative } = addressesRegistry[mainnet.id];

  test("should create deposit bundle with DAI via permit2", async ({
    client,
  }) => {
    const mockVaultAddress =
      "0x0000000000000000000000000000000000000001" as Address;
    const assets = parseUnits("100", 18);
    const maxSharePrice = 1000000000000000000n;

    const requirements = await getRequirements(client, {
      address: dai,
      chainId: mainnet.id,
      supportSignature: true,
      args: {
        amount: assets,
        from: client.account.address,
      },
    });

    const approvalPermit2 = requirements[0];
    if (!isRequirementApproval(approvalPermit2)) {
      throw new Error("Approval requirement not found");
    }

    const permit2Requirement = requirements[1];
    if (!isRequirementSignature(permit2Requirement)) {
      throw new Error("Permit2 requirement not found");
    }

    const requirementSignature = await permit2Requirement.sign(
      client,
      client.account.address,
    );

    expect(requirementSignature.args.asset).toEqual(dai);

    const tx = vaultV1Deposit({
      vault: {
        chainId: mainnet.id,
        address: mockVaultAddress,
        asset: dai,
      },
      args: {
        amount: assets,
        maxSharePrice,
        recipient: client.account.address,
        requirementSignature,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV1Deposit");
    expect(tx.action.args.vault).toBe(mockVaultAddress);
    expect(tx.action.args.amount).toBe(assets);
    expect(tx.action.args.maxSharePrice).toBe(maxSharePrice);
    expect(tx.action.args.recipient).toBe(client.account.address);
    expect(tx.to).toBeDefined();
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should create deposit bundle with USDC via simple permit", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    const maxSharePrice = 1000000n;

    const requirements = await getRequirements(client, {
      address: usdc,
      chainId: mainnet.id,
      supportSignature: true,
      useSimplePermit: true,
      args: {
        amount,
        from: client.account.address,
      },
    });

    const permitRequirement = requirements[0];
    if (!isRequirementSignature(permitRequirement)) {
      throw new Error("Permit requirement not found");
    }

    const requirementSignature = await permitRequirement.sign(
      client,
      client.account.address,
    );

    expect(requirementSignature.args.asset).toEqual(usdc);

    const localSpy = vi.spyOn(
      getRequirementsActionModule,
      "getRequirementsAction",
    );

    const tx = vaultV1Deposit({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
        asset: usdc,
      },
      args: {
        amount,
        maxSharePrice,
        recipient: client.account.address,
        requirementSignature,
      },
    });

    expect(localSpy).toHaveBeenCalled();

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV1Deposit");
    expect(tx.action.args.vault).toBe(SteakhouseUsdcVaultV1.address);
    expect(tx.action.args.amount).toBe(amount);
    expect(tx.action.args.maxSharePrice).toBe(maxSharePrice);
    expect(tx.action.args.recipient).toBe(client.account.address);
    expect(tx.to).toBeDefined();
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should create deposit bundle with WETH via permit2", async ({
    client,
  }) => {
    const amount = parseUnits("5", 18);
    const maxSharePrice = 1000000000000000000n;

    const requirements = await getRequirements(client, {
      address: wNative,
      chainId: mainnet.id,
      supportSignature: true,
      args: {
        amount,
        from: client.account.address,
      },
    });

    const approvalPermit2 = requirements[0];
    if (!isRequirementApproval(approvalPermit2)) {
      throw new Error("Approval requirement not found");
    }

    const permit2Requirement = requirements[1];
    if (!isRequirementSignature(permit2Requirement)) {
      throw new Error("Permit2 requirement not found");
    }

    const requirementSignature = await permit2Requirement.sign(
      client,
      client.account.address,
    );

    expect(requirementSignature.args.asset).toEqual(wNative);

    const tx = vaultV1Deposit({
      vault: {
        chainId: mainnet.id,
        address: GauntletWethVaultV1.address,
        asset: wNative,
      },
      args: {
        amount,
        maxSharePrice,
        recipient: client.account.address,
        requirementSignature,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV1Deposit");
    expect(tx.action.args.vault).toBe(GauntletWethVaultV1.address);
    expect(tx.action.args.amount).toBe(amount);
    expect(tx.action.args.maxSharePrice).toBe(maxSharePrice);
    expect(tx.action.args.recipient).toBe(client.account.address);
    expect(tx.to).toBeDefined();
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should create deposit bundle without requirement signature", async ({
    client,
  }) => {
    const assets = parseUnits("500", 6);
    const maxSharePrice = 1000000n;

    const localSpy = vi.spyOn(
      getRequirementsActionModule,
      "getRequirementsAction",
    );

    const tx = vaultV1Deposit({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
        asset: usdc,
      },
      args: {
        amount: assets,
        maxSharePrice,
        recipient: client.account.address,
      },
    });

    expect(localSpy).not.toHaveBeenCalled();

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV1Deposit");
    expect(tx.action.args.vault).toBe(SteakhouseUsdcVaultV1.address);
    expect(tx.action.args.amount).toBe(assets);
    expect(tx.action.args.maxSharePrice).toBe(maxSharePrice);
    expect(tx.action.args.recipient).toBe(client.account.address);
    expect(tx.to).toBeDefined();
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should throw when signature amount does not match deposit amount", async ({
    client,
  }) => {
    const signatureAmount = parseUnits("5000", 6);
    const depositAmount = parseUnits("1000", 6);
    const maxSharePrice = 1000000n;

    const requirements = await getRequirements(client, {
      address: usdc,
      chainId: mainnet.id,
      supportSignature: true,
      useSimplePermit: true,
      args: {
        amount: signatureAmount,
        from: client.account.address,
      },
    });

    const permitRequirement = requirements[0];
    if (!isRequirementSignature(permitRequirement)) {
      throw new Error("Permit requirement not found");
    }

    const requirementSignature = await permitRequirement.sign(
      client,
      client.account.address,
    );

    expect(() =>
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
          asset: usdc,
        },
        args: {
          amount: depositAmount,
          maxSharePrice,
          recipient: client.account.address,
          requirementSignature,
        },
      }),
    ).toThrow(DepositAmountMismatchError);
  });

  test("should throw NonPositiveAssetAmountError when assets is negative", async ({
    client,
  }) => {
    expect(() =>
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
          asset: SteakhouseUsdcVaultV1.asset,
        },
        args: {
          amount: -1n,
          maxSharePrice: 1000000n,
          recipient: client.account.address,
        },
      }),
    ).toThrow(NonPositiveAssetAmountError);
  });

  test("should throw ZeroDepositAmountError when assets and nativeAmount are both zero", async ({
    client,
  }) => {
    expect(() =>
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
          asset: SteakhouseUsdcVaultV1.asset,
        },
        args: {
          amount: 0n,
          maxSharePrice: 1000000n,
          recipient: client.account.address,
        },
      }),
    ).toThrow(ZeroDepositAmountError);
  });

  test("should throw NonPositiveMaxSharePriceError when maxSharePrice is zero", async ({
    client,
  }) => {
    expect(() =>
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
          asset: SteakhouseUsdcVaultV1.asset,
        },
        args: {
          amount: parseUnits("100", 6),
          maxSharePrice: 0n,
          recipient: client.account.address,
        },
      }),
    ).toThrow(NonPositiveMaxSharePriceError);
  });

  test("should throw NonPositiveMaxSharePriceError when maxSharePrice is negative", async ({
    client,
  }) => {
    expect(() =>
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
          asset: SteakhouseUsdcVaultV1.asset,
        },
        args: {
          amount: parseUnits("100", 6),
          maxSharePrice: -1n,
          recipient: client.account.address,
        },
      }),
    ).toThrow(NonPositiveMaxSharePriceError);
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = vaultV1Deposit({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
        asset: usdc,
      },
      args: {
        amount: parseUnits("100", 6),
        maxSharePrice: 1000000n,
        recipient: client.account.address,
      },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });

  test("should append metadata to transaction data when provided", async ({
    client,
  }) => {
    const assets = parseUnits("100", 6);
    const maxSharePrice = 1000000n;

    const txWithout = vaultV1Deposit({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
        asset: usdc,
      },
      args: {
        amount: assets,
        maxSharePrice,
        recipient: client.account.address,
      },
    });

    const txWith = vaultV1Deposit({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
        asset: usdc,
      },
      args: {
        amount: assets,
        maxSharePrice,
        recipient: client.account.address,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.data.length).toBeGreaterThan(txWithout.data.length);
    expect(txWith.action.type).toBe("vaultV1Deposit");
  });

  test("should throw DepositAssetMismatchError when signature asset does not match deposit asset", async ({
    client,
  }) => {
    const assets = parseUnits("100", 18);
    const maxSharePrice = 1000000000000000000n;

    const requirements = await getRequirements(client, {
      address: dai,
      chainId: mainnet.id,
      supportSignature: true,
      args: {
        amount: assets,
        from: client.account.address,
      },
    });

    const approvalPermit2 = requirements[0];
    if (!isRequirementApproval(approvalPermit2)) {
      throw new Error("Approval requirement not found");
    }

    const permit2Requirement = requirements[1];
    if (!isRequirementSignature(permit2Requirement)) {
      throw new Error("Permit2 requirement not found");
    }

    const requirementSignature = await permit2Requirement.sign(
      client,
      client.account.address,
    );

    expect(() =>
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: GauntletWethVaultV1.address,
          asset: wNative,
        },
        args: {
          amount: assets,
          maxSharePrice,
          recipient: client.account.address,
          requirementSignature,
        },
      }),
    ).toThrow(DepositAssetMismatchError);
  });
});
