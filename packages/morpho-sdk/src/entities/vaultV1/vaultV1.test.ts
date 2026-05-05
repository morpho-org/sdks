import { fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  GauntletWethVaultV1,
  SteakhouseUsdcVaultV1,
} from "../../../test/fixtures/vaultV1.js";
import {
  KeyrockUsdcVaultV2,
  KpkWETHVaultV2,
} from "../../../test/fixtures/vaultV2.js";
import { morphoFromTestClient } from "../../../test/helpers/morphoTestClient.js";
import { test } from "../../../test/setup.js";
import { MAX_SLIPPAGE_TOLERANCE } from "../../helpers/constant.js";
import {
  ExcessiveSlippageToleranceError,
  isRequirementApproval,
  NativeAmountOnNonWNativeVaultError,
  NegativeNativeAmountError,
  NegativeSlippageToleranceError,
  VaultAssetMismatchError,
} from "../../types/index.js";

describe("MorphoVaultV1 entity tests", () => {
  describe("slippageTolerance boundary", () => {
    test("should accept slippageTolerance of exactly 0n", async ({
      client,
    }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const accrualVault = await vault.getData();
      const result = vault.deposit({
        amount: parseUnits("100", 6),
        userAddress: client.account.address,
        accrualVault,
        slippageTolerance: 0n,
      });

      expect(result.buildTx).toBeDefined();
      expect(result.getRequirements).toBeDefined();

      const tx = result.buildTx();
      expect(tx.data).toBeDefined();
      expect(tx.value).toBe(0n);
    });

    test("should accept slippageTolerance of exactly MAX_SLIPPAGE_TOLERANCE", async ({
      client,
    }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const accrualVault = await vault.getData();
      const result = vault.deposit({
        amount: parseUnits("100", 6),
        userAddress: client.account.address,
        accrualVault,
        slippageTolerance: MAX_SLIPPAGE_TOLERANCE,
      });

      expect(result.buildTx).toBeDefined();
      expect(result.getRequirements).toBeDefined();

      const tx = result.buildTx();
      expect(tx.data).toBeDefined();
      expect(tx.value).toBe(0n);
    });

    test("should throw ExcessiveSlippageToleranceError when slippageTolerance exceeds MAX", async ({
      client,
    }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const accrualVault = await vault.getData();
      expect(() =>
        vault.deposit({
          amount: parseUnits("100", 6),
          userAddress: client.account.address,
          accrualVault,
          slippageTolerance: MAX_SLIPPAGE_TOLERANCE + 1n,
        }),
      ).toThrow(ExcessiveSlippageToleranceError);
    });

    test("should throw NegativeSlippageToleranceError when slippageTolerance is negative", async ({
      client,
    }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const accrualVault = await vault.getData();
      expect(() =>
        vault.deposit({
          amount: parseUnits("100", 6),
          userAddress: client.account.address,
          accrualVault,
          slippageTolerance: -1n,
        }),
      ).toThrow(NegativeSlippageToleranceError);
    });
  });

  describe("nativeAmount validation", () => {
    test("should throw NegativeNativeAmountError for negative nativeAmount", async ({
      client,
    }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        GauntletWethVaultV1.address,
        mainnet.id,
      );

      const accrualVault = await vault.getData();
      expect(() =>
        vault.deposit({
          amount: 0n,
          nativeAmount: -1n,
          userAddress: client.account.address,
          accrualVault,
        }),
      ).toThrow(NegativeNativeAmountError);
    });

    test("should throw NativeAmountOnNonWNativeVaultError for non-WETH vault", async ({
      client,
    }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const accrualVault = await vault.getData();
      expect(() =>
        vault.deposit({
          amount: 0n,
          nativeAmount: parseUnits("1", 18),
          userAddress: client.account.address,
          accrualVault,
        }),
      ).toThrow(NativeAmountOnNonWNativeVaultError);
    });
  });

  describe("getRequirements with supportSignature: false", () => {
    test("should return classic approval requirements when supportSignature is false", async ({
      client,
    }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: false,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const accrualVault = await vault.getData();
      const { getRequirements } = vault.deposit({
        amount: parseUnits("100", 6),
        userAddress: client.account.address,
        accrualVault,
      });

      const requirements = await getRequirements();

      expect(requirements).toHaveLength(1);

      const approval = requirements[0];
      if (!isRequirementApproval(approval)) {
        throw new Error("Requirement is not an approval transaction");
      }
    });
  });

  describe("migrateToV2", () => {
    test("should return buildTx and getRequirements", async ({ client }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: false,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const sourceVault = await vault.getData();
      const targetVault = await fetchAccrualVaultV2(
        KeyrockUsdcVaultV2.address,
        client,
        { chainId: mainnet.id },
      );

      const result = vault.migrateToV2({
        userAddress: client.account.address,
        sourceVault,
        targetVault,
        shares: parseUnits("1000", 18),
      });

      expect(result.buildTx).toBeDefined();
      expect(result.getRequirements).toBeDefined();

      const tx = result.buildTx();
      expect(tx.action.type).toBe("vaultV1MigrateToV2");
      expect(tx.action.args.sourceVault).toBe(SteakhouseUsdcVaultV1.address);
      expect(tx.action.args.targetVault).toBe(KeyrockUsdcVaultV2.address);
      expect(tx.action.args.recipient).toBe(client.account.address);
      expect(tx.data).toBeDefined();
      expect(tx.value).toBe(0n);
    });

    test("should throw NegativeSlippageToleranceError when slippageTolerance is negative", async ({
      client,
    }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: false,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const sourceVault = await vault.getData();
      const targetVault = await fetchAccrualVaultV2(
        KeyrockUsdcVaultV2.address,
        client,
        { chainId: mainnet.id },
      );

      expect(() =>
        vault.migrateToV2({
          userAddress: client.account.address,
          sourceVault,
          targetVault,
          shares: parseUnits("1000", 18),
          slippageTolerance: -1n,
        }),
      ).toThrow(NegativeSlippageToleranceError);
    });

    test("should throw ExcessiveSlippageToleranceError when slippageTolerance exceeds MAX", async ({
      client,
    }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: false,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const sourceVault = await vault.getData();
      const targetVault = await fetchAccrualVaultV2(
        KeyrockUsdcVaultV2.address,
        client,
        { chainId: mainnet.id },
      );

      expect(() =>
        vault.migrateToV2({
          userAddress: client.account.address,
          sourceVault,
          targetVault,
          shares: parseUnits("1000", 18),
          slippageTolerance: MAX_SLIPPAGE_TOLERANCE + 1n,
        }),
      ).toThrow(ExcessiveSlippageToleranceError);
    });

    test("should throw VaultAssetMismatchError when V1 and V2 have different underlying assets", async ({
      client,
    }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: false,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const sourceVault = await vault.getData();
      const targetVault = await fetchAccrualVaultV2(
        KpkWETHVaultV2.address,
        client,
        { chainId: mainnet.id },
      );

      expect(() =>
        vault.migrateToV2({
          userAddress: client.account.address,
          sourceVault,
          targetVault,
          shares: parseUnits("1000", 18),
        }),
      ).toThrow(VaultAssetMismatchError);
    });

    test("should accept slippageTolerance of exactly 0n", async ({
      client,
    }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: false,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const sourceVault = await vault.getData();
      const targetVault = await fetchAccrualVaultV2(
        KeyrockUsdcVaultV2.address,
        client,
        { chainId: mainnet.id },
      );

      const result = vault.migrateToV2({
        userAddress: client.account.address,
        sourceVault,
        targetVault,
        shares: parseUnits("1000", 18),
        slippageTolerance: 0n,
      });

      expect(result.buildTx).toBeDefined();
      const tx = result.buildTx();
      expect(tx.data).toBeDefined();
    });

    test("should accept slippageTolerance of exactly MAX_SLIPPAGE_TOLERANCE", async ({
      client,
    }) => {
      const morphoClient = morphoFromTestClient(client, {
        supportSignature: false,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const sourceVault = await vault.getData();
      const targetVault = await fetchAccrualVaultV2(
        KeyrockUsdcVaultV2.address,
        client,
        { chainId: mainnet.id },
      );

      const result = vault.migrateToV2({
        userAddress: client.account.address,
        sourceVault,
        targetVault,
        shares: parseUnits("1000", 18),
        slippageTolerance: MAX_SLIPPAGE_TOLERANCE,
      });

      expect(result.buildTx).toBeDefined();
      const tx = result.buildTx();
      expect(tx.data).toBeDefined();
    });

    test("should return classic approval requirement for V1 shares when supportSignature is false", async ({
      client,
    }) => {
      const shares = parseUnits("1000", 18);
      await client.deal({
        erc20: SteakhouseUsdcVaultV1.address,
        amount: shares,
      });

      const morphoClient = morphoFromTestClient(client, {
        supportSignature: false,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const sourceVault = await vault.getData();
      const targetVault = await fetchAccrualVaultV2(
        KeyrockUsdcVaultV2.address,
        client,
        { chainId: mainnet.id },
      );

      const { getRequirements } = vault.migrateToV2({
        userAddress: client.account.address,
        sourceVault,
        targetVault,
        shares,
      });

      const requirements = await getRequirements();

      expect(requirements).toHaveLength(1);

      const approval = requirements[0];
      if (!isRequirementApproval(approval)) {
        throw new Error("Requirement is not an approval transaction");
      }
    });

    test("should return requirement for V1 shares when supportSignature is true", async ({
      client,
    }) => {
      const shares = parseUnits("1000", 18);
      await client.deal({
        erc20: SteakhouseUsdcVaultV1.address,
        amount: shares,
      });

      const morphoClient = morphoFromTestClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const sourceVault = await vault.getData();
      const targetVault = await fetchAccrualVaultV2(
        KeyrockUsdcVaultV2.address,
        client,
        { chainId: mainnet.id },
      );

      const { getRequirements } = vault.migrateToV2({
        userAddress: client.account.address,
        sourceVault,
        targetVault,
        shares,
      });

      const requirements = await getRequirements();

      expect(requirements.length).toBeGreaterThanOrEqual(1);
    });
  });
});
