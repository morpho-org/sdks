import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";
import { isHex, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  MorphoClient,
  NativeAmountOnNonWNativeVaultError,
  NegativeNativeAmountError,
  ZeroDepositAmountError,
  isRequirementApproval,
  isRequirementSignature,
  vaultV1Deposit,
  vaultV2Deposit,
} from "../../src/index.js";
import {
  GauntletWethVaultV1,
  SteakhouseUsdcVaultV1,
} from "../fixtures/vaultV1.js";
import { KeyrockUsdcVaultV2, KpkWETHVaultV2 } from "../fixtures/vaultV2.js";
import { testInvariants } from "../helpers/invariants.js";
import { test } from "../setup.js";

describe("WrapNative - VaultV1", () => {
  test("should deposit native ETH only in WETH vaultV1", async ({ client }) => {
    const nativeAmount = parseUnits("1000", 18);

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
      params: {
        vaults: { GauntletWethVaultV1 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client);
        const vault = morpho.vaultV1(GauntletWethVaultV1.address, mainnet.id);
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: 0n,
          nativeAmount,
          accrualVault,
        });

        const requirements = await deposit.getRequirements();
        expect(requirements.length).toBe(0);

        const tx = deposit.buildTx();
        expect(tx.value).toEqual(nativeAmount);
        expect(tx.action.args.nativeAmount).toEqual(nativeAmount);
        expect(tx.action.args.amount).toEqual(0n);

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userNativeBalance).toBeLessThan(
      initialState.userNativeBalance,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + nativeAmount,
    );
    expect(finalState.userSharesBalanceInAssets).toEqual(
      initialState.userSharesBalanceInAssets + nativeAmount - 1n,
    );
  });

  test("should deposit with both amount and nativeAmount in WETH vaultV1", async ({
    client,
  }) => {
    const amount = parseUnits("0.5", 18);
    const nativeAmount = parseUnits("0.5", 18);
    const totalAssets = amount + nativeAmount;

    await client.deal({
      erc20: GauntletWethVaultV1.asset,
      amount,
    });

    await client.setBalance({
      address: client.account.address,
      value: nativeAmount + parseUnits("10", 18),
    });

    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(mainnet.id);

    await client.approve({
      address: GauntletWethVaultV1.asset,
      args: [generalAdapter1, MathLib.MAX_UINT_256],
    });

    const {
      vaults: {
        GauntletWethVaultV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { GauntletWethVaultV1 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client);
        const vault = morpho.vaultV1(GauntletWethVaultV1.address, mainnet.id);
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount,
          nativeAmount,
          accrualVault,
        });

        const requirements = await deposit.getRequirements();
        expect(requirements.length).toBe(0);

        const tx = deposit.buildTx();
        expect(tx.value).toEqual(nativeAmount);
        expect(tx.action.args.nativeAmount).toEqual(nativeAmount);
        expect(tx.action.args.amount).toEqual(amount);

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + totalAssets,
    );
    expect(finalState.userSharesBalanceInAssets).toEqual(
      initialState.userSharesBalanceInAssets + totalAssets - 1n,
    );
  });

  test("should deposit with permit2 signature + native wrapping in WETH vaultV1", async ({
    client,
  }) => {
    const amount = parseUnits("0.5", 18);
    const nativeAmount = parseUnits("0.5", 18);
    const totalAssets = amount + nativeAmount;

    await client.deal({
      erc20: GauntletWethVaultV1.asset,
      amount,
    });

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
      params: {
        vaults: { GauntletWethVaultV1 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client, { supportSignature: true });
        const vault = morpho.vaultV1(GauntletWethVaultV1.address, mainnet.id);
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount,
          nativeAmount,
          accrualVault,
        });

        const requirements = await deposit.getRequirements();

        expect(requirements.length).toBe(2);

        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        await client.sendTransaction(approval);

        const permit2 = requirements[1];
        if (!isRequirementSignature(permit2)) {
          throw new Error("Permit2 requirement not found");
        }

        const requirementSignature = await permit2.sign(
          client,
          client.account.address,
        );

        expect(isHex(requirementSignature.args.signature)).toBe(true);
        expect(requirementSignature.args.signature.length).toBe(132);

        const tx = deposit.buildTx(requirementSignature);
        expect(tx.value).toEqual(nativeAmount);
        expect(tx.action.args.nativeAmount).toEqual(nativeAmount);
        expect(tx.action.args.amount).toEqual(amount);

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + totalAssets,
    );
    expect(finalState.userSharesBalanceInAssets).toEqual(
      initialState.userSharesBalanceInAssets + totalAssets - 1n,
    );
  });

  test("should throw NativeAmountOnNonWNativeVaultError for non-WETH vaultV1", () => {
    expect(() =>
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: SteakhouseUsdcVaultV1.address,
          asset: SteakhouseUsdcVaultV1.asset,
        },
        args: {
          nativeAmount: parseUnits("1", 18),
          maxSharePrice: 1n,
          recipient: "0x0000000000000000000000000000000000000001",
        },
      }),
    ).toThrow(NativeAmountOnNonWNativeVaultError);
  });

  test("should throw ZeroDepositAmountError when both amounts are zero in vaultV1", () => {
    expect(() =>
      vaultV1Deposit({
        vault: {
          chainId: mainnet.id,
          address: GauntletWethVaultV1.address,
          asset: GauntletWethVaultV1.asset,
        },
        args: {
          amount: 0n,
          maxSharePrice: 1n,
          recipient: "0x0000000000000000000000000000000000000001",
        },
      }),
    ).toThrow(ZeroDepositAmountError);
  });

  test("should throw NegativeNativeAmountError for negative nativeAmount in vaultV1", () => {
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
          recipient: "0x0000000000000000000000000000000000000001",
        },
      }),
    ).toThrow(NegativeNativeAmountError);
  });
});

describe("WrapNative - VaultV2", () => {
  test("should deposit native ETH only in WETH vaultV2", async ({ client }) => {
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
      params: {
        vaults: { KpkWETHVaultV2 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client);
        const vault = morpho.vaultV2(KpkWETHVaultV2.address, mainnet.id);
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: 0n,
          nativeAmount,
          accrualVault,
        });

        const requirements = await deposit.getRequirements();
        expect(requirements.length).toBe(0);

        const tx = deposit.buildTx();
        expect(tx.value).toEqual(nativeAmount);
        expect(tx.action.args.nativeAmount).toEqual(nativeAmount);
        expect(tx.action.args.amount).toEqual(0n);

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userNativeBalance).toBeLessThan(
      initialState.userNativeBalance,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + nativeAmount,
    );
    expect(finalState.userSharesBalanceInAssets).toEqual(
      initialState.userSharesBalanceInAssets + nativeAmount - 1n,
    );
  });

  test("should deposit with both amount and nativeAmount in WETH vaultV2", async ({
    client,
  }) => {
    const amount = parseUnits("0.5", 18);
    const nativeAmount = parseUnits("0.5", 18);
    const totalAssets = amount + nativeAmount;

    await client.deal({
      erc20: KpkWETHVaultV2.asset,
      amount,
    });

    await client.setBalance({
      address: client.account.address,
      value: nativeAmount + parseUnits("10", 18),
    });

    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(mainnet.id);

    await client.approve({
      address: KpkWETHVaultV2.asset,
      args: [generalAdapter1, MathLib.MAX_UINT_256],
    });

    const {
      vaults: {
        KpkWETHVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { KpkWETHVaultV2 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client);
        const vault = morpho.vaultV2(KpkWETHVaultV2.address, mainnet.id);
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount,
          nativeAmount,
          accrualVault,
        });

        const requirements = await deposit.getRequirements();
        expect(requirements.length).toBe(0);

        const tx = deposit.buildTx();
        expect(tx.value).toEqual(nativeAmount);
        expect(tx.action.args.nativeAmount).toEqual(nativeAmount);
        expect(tx.action.args.amount).toEqual(amount);

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + totalAssets,
    );
    expect(finalState.userSharesBalanceInAssets).toEqual(
      initialState.userSharesBalanceInAssets + totalAssets - 1n,
    );
  });

  test("should deposit with permit2 signature + native wrapping in WETH vaultV2", async ({
    client,
  }) => {
    const amount = parseUnits("0.5", 18);
    const nativeAmount = parseUnits("0.5", 18);
    const totalAssets = amount + nativeAmount;

    await client.deal({
      erc20: KpkWETHVaultV2.asset,
      amount,
    });

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
      params: {
        vaults: { KpkWETHVaultV2 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client, { supportSignature: true });
        const vault = morpho.vaultV2(KpkWETHVaultV2.address, mainnet.id);
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount,
          nativeAmount,
          accrualVault,
        });

        const requirements = await deposit.getRequirements();

        expect(requirements.length).toBe(2);

        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        await client.sendTransaction(approval);

        const permit2 = requirements[1];
        if (!isRequirementSignature(permit2)) {
          throw new Error("Permit2 requirement not found");
        }

        const requirementSignature = await permit2.sign(
          client,
          client.account.address,
        );

        expect(isHex(requirementSignature.args.signature)).toBe(true);
        expect(requirementSignature.args.signature.length).toBe(132);

        const tx = deposit.buildTx(requirementSignature);
        expect(tx.value).toEqual(nativeAmount);
        expect(tx.action.args.nativeAmount).toEqual(nativeAmount);
        expect(tx.action.args.amount).toEqual(amount);

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + totalAssets,
    );
    expect(finalState.userSharesBalanceInAssets).toEqual(
      initialState.userSharesBalanceInAssets + totalAssets - 1n,
    );
  });

  test("should throw NativeAmountOnNonWNativeVaultError for non-WETH vaultV2", () => {
    expect(() =>
      vaultV2Deposit({
        vault: {
          chainId: mainnet.id,
          address: KeyrockUsdcVaultV2.address,
          asset: KeyrockUsdcVaultV2.asset,
        },
        args: {
          nativeAmount: parseUnits("1", 18),
          maxSharePrice: 1n,
          recipient: "0x0000000000000000000000000000000000000001",
        },
      }),
    ).toThrow(NativeAmountOnNonWNativeVaultError);
  });

  test("should throw ZeroDepositAmountError when both amounts are zero in vaultV2", () => {
    expect(() =>
      vaultV2Deposit({
        vault: {
          chainId: mainnet.id,
          address: KpkWETHVaultV2.address,
          asset: KpkWETHVaultV2.asset,
        },
        args: {
          amount: 0n,
          maxSharePrice: 1n,
          recipient: "0x0000000000000000000000000000000000000001",
        },
      }),
    ).toThrow(ZeroDepositAmountError);
  });

  test("should throw NegativeNativeAmountError for negative nativeAmount in vaultV2", () => {
    expect(() =>
      vaultV2Deposit({
        vault: {
          chainId: mainnet.id,
          address: KpkWETHVaultV2.address,
          asset: KpkWETHVaultV2.asset,
        },
        args: {
          nativeAmount: -1n,
          maxSharePrice: 1n,
          recipient: "0x0000000000000000000000000000000000000001",
        },
      }),
    ).toThrow(NegativeNativeAmountError);
  });
});
