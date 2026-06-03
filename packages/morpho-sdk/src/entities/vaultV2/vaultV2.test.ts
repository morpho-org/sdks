import { ChainId } from "@morpho-org/blue-sdk";
import { createPublicClient, http, parseUnits } from "viem";
import { celo, mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  KeyrockUsdcVaultV2,
  KpkWETHVaultV2,
} from "../../../test/fixtures/vaultV2.js";
import { test } from "../../../test/setup.js";
import { morphoViemExtension } from "../../client/index.js";
import { MAX_SLIPPAGE_TOLERANCE } from "../../helpers/constant.js";
import {
  ChainIdMismatchError,
  ChainWNativeMissingError,
  ExcessiveSlippageToleranceError,
  NativeAmountOnNonWNativeVaultError,
  NegativeNativeAmountError,
  NegativeSlippageToleranceError,
  NonPositiveAssetAmountError,
  NonPositiveSharesAmountError,
  VaultAddressMismatchError,
} from "../../types/index.js";

describe("MorphoVaultV2 entity tests", () => {
  describe("chain and data validation", () => {
    test("getData throws ChainIdMismatchError when client chain differs", async () => {
      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http("https://rpc.example"),
      });
      const vault = publicClient
        .extend(morphoViemExtension())
        .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id + 1);

      await expect(vault.getData()).rejects.toThrow(ChainIdMismatchError);
    });

    test("deposit throws ChainIdMismatchError when client chain differs", () => {
      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http("https://rpc.example"),
      });
      const vault = publicClient
        .extend(morphoViemExtension())
        .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id + 1);

      expect(() =>
        vault.deposit({
          amount: 1n,
          userAddress: KeyrockUsdcVaultV2.address,
          vaultData: {} as never,
        }),
      ).toThrow(ChainIdMismatchError);
    });

    test("withdraw, redeem, forceWithdraw, and forceRedeem throw ChainIdMismatchError when client chain differs", () => {
      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http("https://rpc.example"),
      });
      const vault = publicClient
        .extend(morphoViemExtension())
        .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id + 1);

      expect(() =>
        vault.withdraw({ amount: 1n, userAddress: KeyrockUsdcVaultV2.address }),
      ).toThrow(ChainIdMismatchError);
      expect(() =>
        vault.redeem({ shares: 1n, userAddress: KeyrockUsdcVaultV2.address }),
      ).toThrow(ChainIdMismatchError);
      expect(() =>
        vault.forceWithdraw({
          deallocations: [],
          withdraw: { amount: 1n },
          userAddress: KeyrockUsdcVaultV2.address,
        }),
      ).toThrow(ChainIdMismatchError);
      expect(() =>
        vault.forceRedeem({
          deallocations: [],
          redeem: { shares: 1n },
          userAddress: KeyrockUsdcVaultV2.address,
        }),
      ).toThrow(ChainIdMismatchError);
    });
  });

  describe("slippageTolerance boundary", () => {
    test("should accept slippageTolerance of exactly 0n", async ({
      client,
    }) => {
      const morphoClient = client.extend(
        morphoViemExtension({
          supportSignature: true,
        }),
      ).morpho;
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
        mainnet.id,
      );

      const vaultData = await vault.getData();
      const result = vault.deposit({
        amount: parseUnits("100", 6),
        userAddress: client.account.address,
        vaultData,
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
      const morphoClient = client.extend(
        morphoViemExtension({
          supportSignature: true,
        }),
      ).morpho;
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
        mainnet.id,
      );

      const vaultData = await vault.getData();
      const result = vault.deposit({
        amount: parseUnits("100", 6),
        userAddress: client.account.address,
        vaultData,
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
      const morphoClient = client.extend(
        morphoViemExtension({
          supportSignature: true,
        }),
      ).morpho;
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
        mainnet.id,
      );

      const vaultData = await vault.getData();
      expect(() =>
        vault.deposit({
          amount: parseUnits("100", 6),
          userAddress: client.account.address,
          vaultData,
          slippageTolerance: MAX_SLIPPAGE_TOLERANCE + 1n,
        }),
      ).toThrow(ExcessiveSlippageToleranceError);
    });

    test("should throw NegativeSlippageToleranceError when slippageTolerance is negative", async ({
      client,
    }) => {
      const morphoClient = client.extend(
        morphoViemExtension({
          supportSignature: true,
        }),
      ).morpho;
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
        mainnet.id,
      );

      const vaultData = await vault.getData();
      expect(() =>
        vault.deposit({
          amount: parseUnits("100", 6),
          userAddress: client.account.address,
          vaultData,
          slippageTolerance: -1n,
        }),
      ).toThrow(NegativeSlippageToleranceError);
    });
  });

  describe("nativeAmount validation", () => {
    test("should throw VaultAddressMismatchError when data belongs to a different vault", async ({
      client,
    }) => {
      const morphoClient = client.extend(
        morphoViemExtension({
          supportSignature: true,
        }),
      ).morpho;
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
        mainnet.id,
      );
      const vaultData = await morphoClient
        .vaultV2(KpkWETHVaultV2.address, mainnet.id)
        .getData();

      expect(() =>
        vault.deposit({
          amount: 1n,
          userAddress: client.account.address,
          vaultData,
        }),
      ).toThrow(VaultAddressMismatchError);
    });

    test("should throw NonPositiveAssetAmountError for negative amount", async ({
      client,
    }) => {
      const morphoClient = client.extend(
        morphoViemExtension({
          supportSignature: true,
        }),
      ).morpho;
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
        mainnet.id,
      );
      const vaultData = await vault.getData();

      expect(() =>
        vault.deposit({
          amount: -1n,
          userAddress: client.account.address,
          vaultData,
        }),
      ).toThrow(NonPositiveAssetAmountError);
    });

    test("should throw NegativeNativeAmountError for negative nativeAmount", async ({
      client,
    }) => {
      const morphoClient = client.extend(
        morphoViemExtension({
          supportSignature: true,
        }),
      ).morpho;
      const vault = morphoClient.vaultV2(KpkWETHVaultV2.address, mainnet.id);

      const vaultData = await vault.getData();
      expect(() =>
        vault.deposit({
          amount: 0n,
          nativeAmount: -1n,
          userAddress: client.account.address,
          vaultData,
        }),
      ).toThrow(NegativeNativeAmountError);
    });

    test("should throw ChainWNativeMissingError when native deposit is requested on a chain without wNative", () => {
      const publicClient = createPublicClient({
        chain: celo,
        transport: http("https://rpc.example"),
      });
      const vault = publicClient
        .extend(morphoViemExtension())
        .morpho.vaultV2(KeyrockUsdcVaultV2.address, ChainId.CeloMainnet);

      expect(() =>
        vault.deposit({
          amount: 1n,
          nativeAmount: 1n,
          userAddress: KeyrockUsdcVaultV2.address,
          vaultData: {
            address: KeyrockUsdcVaultV2.address,
            asset: KeyrockUsdcVaultV2.asset,
          } as never,
        }),
      ).toThrow(ChainWNativeMissingError);
    });

    test("should throw NativeAmountOnNonWNativeVaultError for non-WETH vault", async ({
      client,
    }) => {
      const morphoClient = client.extend(
        morphoViemExtension({
          supportSignature: true,
        }),
      ).morpho;
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
        mainnet.id,
      );

      const vaultData = await vault.getData();
      expect(() =>
        vault.deposit({
          amount: 0n,
          nativeAmount: parseUnits("1", 18),
          userAddress: client.account.address,
          vaultData,
        }),
      ).toThrow(NativeAmountOnNonWNativeVaultError);
    });

    test("should throw NonPositiveSharesAmountError for zero total assets", async ({
      client,
    }) => {
      const morphoClient = client.extend(
        morphoViemExtension({
          supportSignature: true,
        }),
      ).morpho;
      const vault = morphoClient.vaultV2(
        KeyrockUsdcVaultV2.address,
        mainnet.id,
      );
      const vaultData = await vault.getData();

      expect(() =>
        vault.deposit({
          amount: 0n,
          userAddress: client.account.address,
          vaultData,
        }),
      ).toThrow(NonPositiveSharesAmountError);
    });
  });
});
