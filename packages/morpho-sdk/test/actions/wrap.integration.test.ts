import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  type BundlesFundingArgs,
  type BundlesTokenRequirementSignature,
  MixedBundlesFundingError,
  morphoViemExtension,
  NativeAmountOnNonWNativeVaultError,
  NegativeInputError,
  NonPositiveInputError,
  vaultV1Deposit,
  vaultV2Deposit,
} from "../../src/index.js";
import {
  GauntletWethVaultV1,
  SteakhouseUsdcVaultV1,
} from "../fixtures/vaultV1.js";
import { KeyrockUsdcVaultV2, KpkWETHVaultV2 } from "../fixtures/vaultV2.js";
import { testInvariants } from "../helpers/invariants.js";
import { vaultBundlesV1Test as test } from "../helpers/vaultBundlesV1.js";

describe("VaultBundlesV1 native funding", () => {
  test("Vault V1 deposits native ETH into a wNative vault", async ({
    client,
  }) => {
    const nativeAmount = parseUnits("1", 18);
    await client.setBalance({
      address: client.account.address,
      value: nativeAmount + parseUnits("10", 18),
    });

    const {
      vaults: {
        GauntletWethVaultV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { vaults: { GauntletWethVaultV1 } },
      actionFn: async () => {
        const vault = client
          .extend(morphoViemExtension())
          .morpho.vaultV1(GauntletWethVaultV1.address, mainnet.id);
        const deposit = vault.deposit({
          userAddress: client.account.address,
          nativeAmount,
          vaultData: await vault.getData(),
        });
        expect(await deposit.getRequirements()).toEqual([]);
        const transaction = deposit.buildTx();
        expect(transaction.value).toBe(nativeAmount);
        expect(transaction.action.args.amount).toBe(nativeAmount);
        expect(transaction.action.args.nativeAmount).toBe(nativeAmount);
        await client.sendTransaction(transaction);
      },
    });

    expect(finalState.userNativeBalance).toBeLessThan(
      initialState.userNativeBalance,
    );
    expect(finalState.morphoAssetBalance).toBe(initialState.morphoAssetBalance);
  });

  test("Vault V2 deposits native ETH into a wNative vault", async ({
    client,
  }) => {
    const nativeAmount = parseUnits("1", 18);
    await client.setBalance({
      address: client.account.address,
      value: nativeAmount + parseUnits("10", 18),
    });

    const {
      vaults: {
        KpkWETHVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { vaults: { KpkWETHVaultV2 } },
      actionFn: async () => {
        const vault = client
          .extend(morphoViemExtension())
          .morpho.vaultV2(KpkWETHVaultV2.address, mainnet.id);
        const deposit = vault.deposit({
          userAddress: client.account.address,
          nativeAmount,
          vaultData: await vault.getData(),
        });
        expect(await deposit.getRequirements()).toEqual([]);
        const transaction = deposit.buildTx();
        expect(transaction.value).toBe(nativeAmount);
        expect(transaction.action.args.amount).toBe(nativeAmount);
        await client.sendTransaction(transaction);
      },
    });

    expect(finalState.userNativeBalance).toBeLessThan(
      initialState.userNativeBalance,
    );
    expect(finalState.morphoAssetBalance).toBe(initialState.morphoAssetBalance);
  });

  test("rejects mixed token/native funding and a native-path token signature", () => {
    const mixedFunding = {
      amount: 1n,
      nativeAmount: 1n,
    } as unknown as BundlesFundingArgs;
    expect(() =>
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: GauntletWethVaultV1.address,
          asset: GauntletWethVaultV1.asset,
        },
        args: {
          ...mixedFunding,
          maxSharePrice: 1n,
          userAddress: "0x0000000000000000000000000000000000000001",
          deadline: 1n,
        },
      }),
    ).toThrow(MixedBundlesFundingError);

    const requirementSignature = {
      action: { type: "permit" },
    } as unknown as BundlesTokenRequirementSignature;
    expect(() =>
      vaultV2Deposit({
        vault: {
          chainId: mainnet.id,
          address: KpkWETHVaultV2.address,
          asset: KpkWETHVaultV2.asset,
        },
        args: {
          nativeAmount: 1n,
          maxSharePrice: 1n,
          userAddress: "0x0000000000000000000000000000000000000001",
          requirementSignature,
          deadline: 1n,
        },
      }),
    ).toThrow(MixedBundlesFundingError);
  });

  test("rejects non-wNative, zero, and negative native funding", () => {
    expect(() =>
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
          asset: SteakhouseUsdcVaultV1.asset,
        },
        args: {
          nativeAmount: 1n,
          maxSharePrice: 1n,
          userAddress: "0x0000000000000000000000000000000000000001",
          deadline: 1n,
        },
      }),
    ).toThrow(NativeAmountOnNonWNativeVaultError);
    expect(() =>
      vaultV2Deposit({
        vault: {
          chainId: mainnet.id,
          address: KeyrockUsdcVaultV2.address,
          asset: KeyrockUsdcVaultV2.asset,
        },
        args: {
          amount: 0n,
          maxSharePrice: 1n,
          userAddress: "0x0000000000000000000000000000000000000001",
          deadline: 1n,
        },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: GauntletWethVaultV1.address,
          asset: GauntletWethVaultV1.asset,
        },
        args: {
          nativeAmount: -1n,
          maxSharePrice: 1n,
          userAddress: "0x0000000000000000000000000000000000000001",
          deadline: 1n,
        },
      }),
    ).toThrow(NegativeInputError);
  });
});
