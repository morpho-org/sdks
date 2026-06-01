import { ChainId } from "@morpho-org/blue-sdk";
import { fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
import { type Address, createPublicClient, http, parseUnits } from "viem";
import { celo, mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  GauntletWethVaultV1,
  SteakhouseUsdcVaultV1,
} from "../../../test/fixtures/vaultV1.js";
import {
  KeyrockUsdcVaultV2,
  KpkWETHVaultV2,
} from "../../../test/fixtures/vaultV2.js";
import { test } from "../../../test/setup.js";
import { MorphoClient } from "../../client/index.js";
import { MAX_SLIPPAGE_TOLERANCE } from "../../helpers/constant.js";
import {
  ChainIdMismatchError,
  ChainWNativeMissingError,
  ExcessiveSlippageToleranceError,
  isRequirementApproval,
  NativeAmountOnNonWNativeVaultError,
  NegativeNativeAmountError,
  NegativeSlippageToleranceError,
  NonPositiveAssetAmountError,
  NonPositiveSharesAmountError,
  VaultAddressMismatchError,
  VaultAssetMismatchError,
} from "../../types/index.js";

describe("MorphoVaultV1 entity tests", () => {
  describe("chain and data validation", () => {
    test("getData throws ChainIdMismatchError when client chain differs", async () => {
      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http("https://rpc.example"),
      });
      const vault = new MorphoClient(publicClient).vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id + 1,
      );

      await expect(vault.getData()).rejects.toThrow(ChainIdMismatchError);
    });

    test("deposit throws ChainIdMismatchError when client chain differs", () => {
      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http("https://rpc.example"),
      });
      const vault = new MorphoClient(publicClient).vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id + 1,
      );

      expect(() =>
        vault.deposit({
          amount: 1n,
          userAddress: SteakhouseUsdcVaultV1.address,
          vaultData: {} as never,
        }),
      ).toThrow(ChainIdMismatchError);
    });

    test("withdraw and redeem throw ChainIdMismatchError when client chain differs", () => {
      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http("https://rpc.example"),
      });
      const vault = new MorphoClient(publicClient).vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id + 1,
      );

      expect(() =>
        vault.withdraw({
          amount: 1n,
          userAddress: SteakhouseUsdcVaultV1.address,
        }),
      ).toThrow(ChainIdMismatchError);
      expect(() =>
        vault.redeem({
          shares: 1n,
          userAddress: SteakhouseUsdcVaultV1.address,
        }),
      ).toThrow(ChainIdMismatchError);
    });
  });

  describe("slippageTolerance boundary", () => {
    test("should accept slippageTolerance of exactly 0n", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
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
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
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
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
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
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
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
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );
      const vaultData = await morphoClient
        .vaultV1(GauntletWethVaultV1.address, mainnet.id)
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
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
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

    test("should throw NonPositiveSharesAmountError for zero total assets", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
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

    test("should throw NegativeNativeAmountError for negative nativeAmount", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        GauntletWethVaultV1.address,
        mainnet.id,
      );

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

    test("should throw NativeAmountOnNonWNativeVaultError for non-WETH vault", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client, {
        supportSignature: true,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
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

    test("should throw ChainWNativeMissingError when native deposit is requested on a chain without wNative", () => {
      const publicClient = createPublicClient({
        chain: celo,
        transport: http("https://rpc.example"),
      });
      const vault = new MorphoClient(publicClient).vaultV1(
        SteakhouseUsdcVaultV1.address,
        ChainId.CeloMainnet,
      );

      expect(() =>
        vault.deposit({
          amount: 1n,
          nativeAmount: 1n,
          userAddress: SteakhouseUsdcVaultV1.address,
          vaultData: {
            address: SteakhouseUsdcVaultV1.address,
            asset: SteakhouseUsdcVaultV1.asset,
          } as never,
        }),
      ).toThrow(ChainWNativeMissingError);
    });
  });

  describe("getRequirements with supportSignature: false", () => {
    test("should return classic approval requirements when supportSignature is false", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client, {
        supportSignature: false,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const vaultData = await vault.getData();
      const { getRequirements } = vault.deposit({
        amount: parseUnits("100", 6),
        userAddress: client.account.address,
        vaultData,
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
    test("should throw ChainIdMismatchError when client chain differs", () => {
      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http("https://rpc.example"),
      });
      const vault = new MorphoClient(publicClient, {
        supportSignature: false,
      }).vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id + 1);

      expect(() =>
        vault.migrateToV2({
          userAddress: SteakhouseUsdcVaultV1.address,
          sourceVault: {} as never,
          targetVault: {} as never,
          shares: 1n,
        }),
      ).toThrow(ChainIdMismatchError);
    });

    test("should throw VaultAddressMismatchError when source vault data differs", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client, {
        supportSignature: false,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );
      const sourceVault = await morphoClient
        .vaultV1(GauntletWethVaultV1.address, mainnet.id)
        .getData();
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
          shares: 1n,
        }),
      ).toThrow(VaultAddressMismatchError);
    });

    test("should throw NonPositiveSharesAmountError when shares is zero", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client, {
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
          shares: 0n,
        }),
      ).toThrow(NonPositiveSharesAmountError);
    });

    test("should throw NonPositiveSharesAmountError when the target V2 vault mints zero shares", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client, {
        supportSignature: false,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );
      const sourceVault = await vault.getData();

      expect(() =>
        vault.migrateToV2({
          userAddress: client.account.address,
          sourceVault,
          targetVault: {
            address: KeyrockUsdcVaultV2.address,
            asset: sourceVault.asset,
            lastUpdate: 0n,
            accrueInterest: () => ({
              vault: { toShares: () => 0n },
            }),
          } as never,
          shares: 1n,
        }),
      ).toThrow(NonPositiveSharesAmountError);
    });

    test("should return buildTx and getRequirements", async ({ client }) => {
      const morphoClient = new MorphoClient(client, {
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
      const morphoClient = new MorphoClient(client, {
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
      const morphoClient = new MorphoClient(client, {
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
      const morphoClient = new MorphoClient(client, {
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
      const morphoClient = new MorphoClient(client, {
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
      const morphoClient = new MorphoClient(client, {
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

      const morphoClient = new MorphoClient(client, {
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

      const morphoClient = new MorphoClient(client, {
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

  // Regression: migrateToV2 previously called validateUserAddress; the SDK no
  // longer enforces builder = signer, so a divergent userAddress and a
  // public client with no connected account must still produce a valid tx.
  describe("migrateToV2 builder = signer freedom", () => {
    const OTHER_USER: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

    test("builds tx with userAddress different from client.account", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client, {
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
        userAddress: OTHER_USER,
        sourceVault,
        targetVault,
        shares: parseUnits("1000", 18),
      });

      const tx = result.buildTx();
      expect(tx.action.args.recipient).toBe(OTHER_USER);
    });

    test("builds tx with public client (no account)", async ({ client }) => {
      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http(client.transport.url),
      });
      const morphoClient = new MorphoClient(publicClient, {
        supportSignature: false,
      });
      const vault = morphoClient.vaultV1(
        SteakhouseUsdcVaultV1.address,
        mainnet.id,
      );

      const sourceVault = await vault.getData();
      const targetVault = await fetchAccrualVaultV2(
        KeyrockUsdcVaultV2.address,
        publicClient,
        { chainId: mainnet.id },
      );

      const result = vault.migrateToV2({
        userAddress: OTHER_USER,
        sourceVault,
        targetVault,
        shares: parseUnits("1000", 18),
      });

      const tx = result.buildTx();
      expect(tx.action.args.recipient).toBe(OTHER_USER);
    });
  });
});
