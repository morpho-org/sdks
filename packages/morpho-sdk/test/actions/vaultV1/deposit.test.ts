import {
  MathLib,
  addressesRegistry,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { isHex, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  MorphoClient,
  isRequirementApproval,
  isRequirementSignature,
  vaultV1Deposit,
} from "../../../src/index.js";
import {
  GauntletWethVaultV1,
  SteakhouseUSDTVaultV1,
  SteakhouseUsdcVaultV1,
} from "../../fixtures/vaultV1.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("DepositVaultV1", () => {
  test("should create deposit bundle", async ({ client }) => {
    const morpho = new MorphoClient(client);

    const vault = morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id);
    const accrualVault = await vault.getData();
    const deposit = vault.deposit({
      userAddress: client.account.address,
      amount: 1000000000000000000n,
      accrualVault,
    });
    const requirements_1 = await deposit.getRequirements();
    const tx_1 = deposit.buildTx();

    const tx_2 = vaultV1Deposit({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
        asset: SteakhouseUsdcVaultV1.asset,
      },
      args: {
        amount: 1000000000000000000n,
        maxSharePrice: tx_1.action.args.maxSharePrice,
        recipient: client.account.address,
      },
    });

    expect(deposit).toBeDefined();
    expect(requirements_1).toBeDefined();
    expect(tx_1).toStrictEqual(tx_2);
    expect(accrualVault.asset).toStrictEqual(SteakhouseUsdcVaultV1.asset);
    expect(accrualVault.address).toStrictEqual(SteakhouseUsdcVaultV1.address);
  });

  test("should deposit 1K USDC in vaultV1", async ({ client }) => {
    const amount = parseUnits("1000", 6);
    await client.deal({
      erc20: SteakhouseUsdcVaultV1.asset,
      amount: amount,
    });

    const {
      vaults: {
        SteakhouseUsdcVaultV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { SteakhouseUsdcVaultV1 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client);
        const vaultV1 = morpho.vaultV1(
          SteakhouseUsdcVaultV1.address,
          mainnet.id,
        );
        const accrualVault = await vaultV1.getData();
        const deposit = vaultV1.deposit({
          userAddress: client.account.address,
          amount: amount,
          accrualVault,
        });

        const tx = deposit.buildTx();
        const requirements = await deposit.getRequirements();

        const approveTx = requirements[0];
        if (!approveTx) {
          throw new Error("Approve transaction not found");
        }
        if (!isRequirementApproval(approveTx)) {
          throw new Error("Approve transaction is not an approval transaction");
        }

        await client.sendTransaction(approveTx);
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
    expect(finalState.userSharesBalanceInAssets).toEqual(amount - 1n);
  });

  test("should deposit 1K USDT in vaultV1 with reset-to-0 allowance", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    await client.deal({
      erc20: SteakhouseUSDTVaultV1.asset,
      amount: amount,
    });

    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(mainnet.id);

    await client.approve({
      address: SteakhouseUSDTVaultV1.asset,
      args: [generalAdapter1, 1n],
    });

    const {
      vaults: {
        SteakhouseUSDTVaultV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { SteakhouseUSDTVaultV1 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client);
        const vaultV1 = morpho.vaultV1(
          SteakhouseUSDTVaultV1.address,
          mainnet.id,
        );
        const accrualVault = await vaultV1.getData();
        const deposit = vaultV1.deposit({
          userAddress: client.account.address,
          amount: amount,
          accrualVault,
        });

        const tx = deposit.buildTx();
        const requirements = await deposit.getRequirements();

        expect(requirements.length).toBe(2);

        const resetApproveTx = requirements[0];
        if (!isRequirementApproval(resetApproveTx)) {
          throw new Error("Reset to 0 approval not found");
        }
        expect(resetApproveTx.action.args.amount).toBe(0n);

        const approveTx = requirements[1];
        if (!isRequirementApproval(approveTx)) {
          throw new Error("Approve transaction not found");
        }

        await client.sendTransaction(resetApproveTx);
        await client.sendTransaction(approveTx);
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
    expect(finalState.userSharesBalanceInAssets).toEqual(amount - 1n);
  });

  test("should deposit USDC with simple permit in vaultV1", async ({
    client,
  }) => {
    const amount = parseUnits("10", 6);

    await client.deal({
      erc20: SteakhouseUsdcVaultV1.asset,
      amount,
    });

    const {
      vaults: {
        SteakhouseUsdcVaultV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { SteakhouseUsdcVaultV1 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client, { supportSignature: true });

        const vault = morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id);
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          accrualVault,
        });
        const requirements = await deposit.getRequirements({
          useSimplePermit: true,
        });

        if (!isRequirementSignature(requirements[0])) {
          throw new Error("Requirement is not a signature requirement");
        }

        const requirementSignature = await requirements[0].sign(
          client,
          client.account.address,
        );

        expect(requirementSignature.args.owner).toEqual(client.account.address);
        expect(requirementSignature.args.asset).toEqual(
          SteakhouseUsdcVaultV1.asset,
        );
        expect(requirementSignature.args.amount).toEqual(amount);
        expect(isHex(requirementSignature.args.signature)).toBe(true);
        expect(requirementSignature.args.signature.length).toBe(132);
        expect(requirementSignature.args.deadline).toBeGreaterThan(
          BigInt(Math.floor(Date.now() / 1000)),
        );

        const tx = deposit.buildTx(requirementSignature);

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
    expect(finalState.userSharesBalanceInAssets).toEqual(amount - 1n);
  });

  test("should deposit USDC with permit2 in vaultV1", async ({ client }) => {
    const {
      permit2,
      bundler3: { generalAdapter1 },
    } = addressesRegistry[mainnet.id];

    const amount = parseUnits("1000", 6);

    await client.deal({
      erc20: SteakhouseUsdcVaultV1.asset,
      amount,
    });

    const morpho = new MorphoClient(client, { supportSignature: true });
    const vault = morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id);

    const {
      vaults: {
        SteakhouseUsdcVaultV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { SteakhouseUsdcVaultV1 },
      },
      actionFn: async () => {
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          accrualVault,
        });

        const requirements = await deposit.getRequirements({
          useSimplePermit: false,
        });

        expect(requirements.length).toBe(2);

        const approvalPermit2 = requirements[0];
        if (!isRequirementApproval(approvalPermit2)) {
          throw new Error("Approval requirement not found");
        }

        expect(approvalPermit2.action.args.spender).toBe(permit2);
        expect(approvalPermit2.action.args.amount).toBe(MathLib.MAX_UINT_160);
        expect(approvalPermit2.action.type).toBe("erc20Approval");

        const permit2Requirement = requirements[1];

        if (!isRequirementSignature(permit2Requirement)) {
          throw new Error("Requirement is not a signature requirement");
        }

        expect(permit2Requirement.action.type).toBe("permit2");
        expect(permit2Requirement.action.args.spender).toBe(generalAdapter1);
        expect(permit2Requirement.action.args.amount).toBe(amount);

        const requirementSignature = await permit2Requirement.sign(
          client,
          client.account.address,
        );

        expect(requirementSignature.args.owner).toEqual(client.account.address);
        expect(isHex(requirementSignature.args.signature)).toBe(true);
        expect(requirementSignature.args.signature.length).toBe(132);
        expect(requirementSignature.args.asset).toBe(
          SteakhouseUsdcVaultV1.asset,
        );
        expect(requirementSignature.args.deadline).toBeGreaterThan(
          BigInt(Math.floor(Date.now() / 1000)),
        );

        await client.sendTransaction(approvalPermit2);

        const tx = deposit.buildTx(requirementSignature);

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
    expect(finalState.userSharesBalanceInAssets).toEqual(amount - 1n);
  });

  test("should deposit WETH with approval already sufficient in vaultV1", async ({
    client,
  }) => {
    const amount = parseUnits("0.5", 18);

    await client.deal({
      erc20: GauntletWethVaultV1.asset,
      amount,
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
        const morpho = new MorphoClient(client, { supportSignature: true });
        const vault = morpho.vaultV1(GauntletWethVaultV1.address, mainnet.id);
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          accrualVault,
        });

        const requirements = await deposit.getRequirements();

        expect(requirements.length).toBe(0);

        await client.sendTransaction(deposit.buildTx());
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
    expect(finalState.userSharesBalanceInAssets).toEqual(amount - 1n);
  });

  test("should deposit and withdraw round trip in vaultV1", async ({
    client,
  }) => {
    const amount = parseUnits("100", 6);
    await client.deal({
      erc20: SteakhouseUsdcVaultV1.asset,
      amount,
    });

    const {
      vaults: {
        SteakhouseUsdcVaultV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { SteakhouseUsdcVaultV1 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client);
        const vaultV1 = morpho.vaultV1(
          SteakhouseUsdcVaultV1.address,
          mainnet.id,
        );

        const accrualVault = await vaultV1.getData();
        const deposit = vaultV1.deposit({
          userAddress: client.account.address,
          amount: amount,
          accrualVault,
        });
        const requirements = await deposit.getRequirements();
        const approveTx = requirements[0];
        if (!isRequirementApproval(approveTx)) {
          throw new Error("Approve transaction not found");
        }
        await client.sendTransaction(approveTx);
        const depositTx = deposit.buildTx();
        await client.sendTransaction(depositTx);

        const withdraw = vaultV1.withdraw({
          userAddress: client.account.address,
          amount: amount,
        });

        const withdrawTx = withdraw.buildTx();

        await client.sendTransaction(withdrawTx);
      },
    });

    expect(finalState.userAssetBalance).toEqual(initialState.userAssetBalance);
    expect(finalState.userSharesBalance).toBeGreaterThanOrEqual(
      initialState.userSharesBalance,
    );
  });
});
