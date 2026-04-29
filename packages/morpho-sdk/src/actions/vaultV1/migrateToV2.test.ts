import { mainnet } from "viem/chains";
import { describe, expect, vi } from "vitest";
import {
  GauntletWethVaultV1,
  SteakhouseUsdcVaultV1,
} from "../../../test/fixtures/vaultV1.js";
import {
  KeyrockUsdcVaultV2,
  KpkWETHVaultV2,
} from "../../../test/fixtures/vaultV2.js";
import { test } from "../../../test/setup.js";
import {
  DepositAssetMismatchError,
  NegativeMinSharePriceError,
  NonPositiveMaxSharePriceError,
  NonPositiveSharesAmountError,
  isRequirementApproval,
  isRequirementSignature,
} from "../../types/index.js";
import * as getRequirementsActionModule from "../requirements/getRequirementsAction.js";
import { getRequirements } from "../requirements/index.js";
import { vaultV1MigrateToV2 } from "./migrateToV2.js";

describe("vaultV1MigrateToV2 unit tests", () => {
  test("should create migrate transaction for USDC vaults", async ({
    client,
  }) => {
    const shares = 1000000000000000000n;
    const minSharePriceVaultV1 = 1000000000000000000000000000n;
    const maxSharePriceVaultV2 = 1000000000000000000000000000n;

    const tx = vaultV1MigrateToV2({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        targetVault: KeyrockUsdcVaultV2.address,
        shares,
        minSharePriceVaultV1,
        maxSharePriceVaultV2,
        recipient: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV1MigrateToV2");
    expect(tx.action.args.sourceVault).toBe(SteakhouseUsdcVaultV1.address);
    expect(tx.action.args.targetVault).toBe(KeyrockUsdcVaultV2.address);
    expect(tx.action.args.minSharePriceVaultV1).toBe(minSharePriceVaultV1);
    expect(tx.action.args.maxSharePriceVaultV2).toBe(maxSharePriceVaultV2);
    expect(tx.action.args.recipient).toBe(client.account.address);
    expect(tx.to).toBeDefined();
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should create migrate transaction for WETH vaults", async ({
    client,
  }) => {
    const shares = 1000000000000000000n;
    const minSharePriceVaultV1 = 1000000000000000000000000000n;
    const maxSharePriceVaultV2 = 1000000000000000000000000000n;

    const tx = vaultV1MigrateToV2({
      vault: {
        chainId: mainnet.id,
        address: GauntletWethVaultV1.address,
      },
      args: {
        targetVault: KpkWETHVaultV2.address,
        shares,
        minSharePriceVaultV1,
        maxSharePriceVaultV2,
        recipient: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV1MigrateToV2");
    expect(tx.action.args.sourceVault).toBe(GauntletWethVaultV1.address);
    expect(tx.action.args.targetVault).toBe(KpkWETHVaultV2.address);
    expect(tx.action.args.minSharePriceVaultV1).toBe(minSharePriceVaultV1);
    expect(tx.action.args.maxSharePriceVaultV2).toBe(maxSharePriceVaultV2);
    expect(tx.action.args.recipient).toBe(client.account.address);
    expect(tx.to).toBeDefined();
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should allow different recipient address", async () => {
    const differentRecipient =
      "0x1234567890123456789012345678901234567890" as const;

    const tx = vaultV1MigrateToV2({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        targetVault: KeyrockUsdcVaultV2.address,
        shares: 1000000000000000000n,
        minSharePriceVaultV1: 1000000000000000000000000000n,
        maxSharePriceVaultV2: 1000000000000000000000000000n,
        recipient: differentRecipient,
      },
    });

    expect(tx.action.args.recipient).toBe(differentRecipient);
  });

  test("should create migrate bundle with V1 shares via simple permit", async ({
    client,
  }) => {
    const shares = 1000000000000000000000n; // 1000 shares (18 decimals)

    const requirements = await getRequirements(client, {
      address: SteakhouseUsdcVaultV1.address,
      chainId: mainnet.id,
      supportSignature: true,
      useSimplePermit: true,
      args: {
        amount: shares,
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

    expect(requirementSignature.args.asset).toEqual(
      SteakhouseUsdcVaultV1.address,
    );

    const localSpy = vi.spyOn(
      getRequirementsActionModule,
      "getRequirementsAction",
    );

    const tx = vaultV1MigrateToV2({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        targetVault: KeyrockUsdcVaultV2.address,
        shares,
        minSharePriceVaultV1: 1000000000000000000000000000n,
        maxSharePriceVaultV2: 1000000000000000000000000000n,
        recipient: client.account.address,
        requirementSignature,
      },
    });

    expect(localSpy).toHaveBeenCalled();
    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV1MigrateToV2");
    expect(tx.action.args.sourceVault).toBe(SteakhouseUsdcVaultV1.address);
    expect(tx.action.args.targetVault).toBe(KeyrockUsdcVaultV2.address);
    expect(tx.action.args.recipient).toBe(client.account.address);
    expect(tx.to).toBeDefined();
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should create migrate bundle with V1 shares via permit2", async ({
    client,
  }) => {
    const shares = 5000000000000000000n; // 5 shares (18 decimals)

    const requirements = await getRequirements(client, {
      address: GauntletWethVaultV1.address,
      chainId: mainnet.id,
      supportSignature: true,
      args: {
        amount: shares,
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

    expect(requirementSignature.args.asset).toEqual(
      GauntletWethVaultV1.address,
    );

    const tx = vaultV1MigrateToV2({
      vault: {
        chainId: mainnet.id,
        address: GauntletWethVaultV1.address,
      },
      args: {
        targetVault: KpkWETHVaultV2.address,
        shares,
        minSharePriceVaultV1: 1000000000000000000000000000n,
        maxSharePriceVaultV2: 1000000000000000000000000000n,
        recipient: client.account.address,
        requirementSignature,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV1MigrateToV2");
    expect(tx.action.args.sourceVault).toBe(GauntletWethVaultV1.address);
    expect(tx.action.args.targetVault).toBe(KpkWETHVaultV2.address);
    expect(tx.action.args.recipient).toBe(client.account.address);
    expect(tx.to).toBeDefined();
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should not call getRequirementsAction without requirement signature", async ({
    client,
  }) => {
    const localSpy = vi.spyOn(
      getRequirementsActionModule,
      "getRequirementsAction",
    );

    const tx = vaultV1MigrateToV2({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        targetVault: KeyrockUsdcVaultV2.address,
        shares: 1000000000000000000n,
        minSharePriceVaultV1: 1000000000000000000000000000n,
        maxSharePriceVaultV2: 1000000000000000000000000000n,
        recipient: client.account.address,
      },
    });

    expect(localSpy).not.toHaveBeenCalled();
    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV1MigrateToV2");
  });

  test("should throw DepositAssetMismatchError when signature asset does not match source vault", async ({
    client,
  }) => {
    const shares = 1000000000000000000000n; // 1000 shares (18 decimals)

    // Sign permit for WETH vault shares
    const requirements = await getRequirements(client, {
      address: GauntletWethVaultV1.address,
      chainId: mainnet.id,
      supportSignature: true,
      useSimplePermit: true,
      args: {
        amount: shares,
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

    // But use USDC vault as source -> asset mismatch
    expect(() =>
      vaultV1MigrateToV2({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
        },
        args: {
          targetVault: KeyrockUsdcVaultV2.address,
          shares,
          minSharePriceVaultV1: 1000000000000000000000000000n,
          maxSharePriceVaultV2: 1000000000000000000000000000n,
          recipient: client.account.address,
          requirementSignature,
        },
      }),
    ).toThrow(DepositAssetMismatchError);
  });

  test("should throw NonPositiveSharesAmountError when shares is zero", async ({
    client,
  }) => {
    expect(() =>
      vaultV1MigrateToV2({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
        },
        args: {
          targetVault: KeyrockUsdcVaultV2.address,
          shares: 0n,
          minSharePriceVaultV1: 1000000000000000000000000000n,
          maxSharePriceVaultV2: 1000000000000000000000000000n,
          recipient: client.account.address,
        },
      }),
    ).toThrow(NonPositiveSharesAmountError);
  });

  test("should throw NonPositiveSharesAmountError when shares is negative", async ({
    client,
  }) => {
    expect(() =>
      vaultV1MigrateToV2({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
        },
        args: {
          targetVault: KeyrockUsdcVaultV2.address,
          shares: -1n,
          minSharePriceVaultV1: 1000000000000000000000000000n,
          maxSharePriceVaultV2: 1000000000000000000000000000n,
          recipient: client.account.address,
        },
      }),
    ).toThrow(NonPositiveSharesAmountError);
  });

  test("should throw NonPositiveMaxSharePriceError when maxSharePriceVaultV2 is zero", async ({
    client,
  }) => {
    expect(() =>
      vaultV1MigrateToV2({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
        },
        args: {
          targetVault: KeyrockUsdcVaultV2.address,
          shares: 1000000000000000000n,
          minSharePriceVaultV1: 1000000000000000000000000000n,
          maxSharePriceVaultV2: 0n,
          recipient: client.account.address,
        },
      }),
    ).toThrow(NonPositiveMaxSharePriceError);
  });

  test("should throw NonPositiveMaxSharePriceError when maxSharePriceVaultV2 is negative", async ({
    client,
  }) => {
    expect(() =>
      vaultV1MigrateToV2({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
        },
        args: {
          targetVault: KeyrockUsdcVaultV2.address,
          shares: 1000000000000000000n,
          minSharePriceVaultV1: 1000000000000000000000000000n,
          maxSharePriceVaultV2: -1n,
          recipient: client.account.address,
        },
      }),
    ).toThrow(NonPositiveMaxSharePriceError);
  });

  test("should accept minSharePriceVaultV1 of zero (no slippage floor)", async ({
    client,
  }) => {
    expect(() =>
      vaultV1MigrateToV2({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
        },
        args: {
          targetVault: KeyrockUsdcVaultV2.address,
          shares: 1000000000000000000n,
          minSharePriceVaultV1: 0n,
          maxSharePriceVaultV2: 1000000000000000000000000000n,
          recipient: client.account.address,
        },
      }),
    ).not.toThrow();
  });

  test("should throw NegativeMinSharePriceError when minSharePriceVaultV1 is negative", async ({
    client,
  }) => {
    expect(() =>
      vaultV1MigrateToV2({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
        },
        args: {
          targetVault: KeyrockUsdcVaultV2.address,
          shares: 1000000000000000000n,
          minSharePriceVaultV1: -1n,
          maxSharePriceVaultV2: 1000000000000000000000000000n,
          recipient: client.account.address,
        },
      }),
    ).toThrow(NegativeMinSharePriceError);
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = vaultV1MigrateToV2({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        targetVault: KeyrockUsdcVaultV2.address,
        shares: 1000000000000000000n,
        minSharePriceVaultV1: 1000000000000000000000000000n,
        maxSharePriceVaultV2: 1000000000000000000000000000n,
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
    const args = {
      targetVault: KeyrockUsdcVaultV2.address,
      shares: 1000000000000000000n,
      minSharePriceVaultV1: 1000000000000000000000000000n,
      maxSharePriceVaultV2: 1000000000000000000000000000n,
      recipient: client.account.address,
    } as const;

    const txWithout = vaultV1MigrateToV2({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
      },
      args,
    });

    const txWith = vaultV1MigrateToV2({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
      },
      args,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.data.length).toBeGreaterThan(txWithout.data.length);
    expect(txWith.action.type).toBe("vaultV1MigrateToV2");
  });
});
