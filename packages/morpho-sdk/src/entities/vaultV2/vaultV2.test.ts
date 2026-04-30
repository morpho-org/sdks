import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  KeyrockUsdcVaultV2,
  KpkWETHVaultV2,
} from "../../../test/fixtures/vaultV2.js";
import { test } from "../../../test/setup.js";
import { MorphoClient } from "../../client/index.js";
import { MAX_SLIPPAGE_TOLERANCE } from "../../helpers/constant.js";
import {
  ExcessiveSlippageToleranceError,
  NativeAmountOnNonWNativeVaultError,
  NegativeNativeAmountError,
  NegativeSlippageToleranceError,
} from "../../types/index.js";

describe("MorphoVaultV2 entity tests", () => {
  describe("slippageTolerance boundary", () => {
    test("should accept slippageTolerance of exactly 0n", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
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
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
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
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
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
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
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
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV2(KpkWETHVaultV2.address, mainnet.id);

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
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
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
});
