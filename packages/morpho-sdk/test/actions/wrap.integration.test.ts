import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  type BundlesFundingArgs,
  type BlueBundlesV1TokenRequirementSignature,
  MixedBundlesFundingError,
  morphoViemExtension,
  NativeAmountOnNonWNativeVaultError,
  NegativeInputError,
  NonPositiveInputError,
  vaultV1Deposit,
} from "../../src/index.js";
import {
  GauntletWethVaultV1,
  SteakhouseUsdcVaultV1,
} from "../fixtures/vaultV1.js";
import { testInvariants } from "../helpers/invariants.js";
import { test } from "../setup.js";

describe("VaultBundlesV1 native Vault V1 funding", () => {
  test("deposits native ETH into a wNative vault", async ({ client }) => {
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
    } as unknown as BlueBundlesV1TokenRequirementSignature;
    expect(() =>
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: GauntletWethVaultV1.address,
          asset: GauntletWethVaultV1.asset,
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

  test("validates the native amount and vault asset", () => {
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
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: GauntletWethVaultV1.address,
          asset: GauntletWethVaultV1.asset,
        },
        args: {
          nativeAmount: 0n,
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
