import { MathLib, addressesRegistry } from "@morpho-org/blue-sdk";
import { isHex, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  MorphoClient,
  isRequirementApproval,
  isRequirementSignature,
} from "../../../src/index.js";
import {
  KeyrockUsdcVaultV2,
  KpkWETHVaultV2,
  Re7UsdtVaultV2,
} from "../../fixtures/vaultV2.js";
import { testInvariants } from "../../helpers/invariants.js";
import { createVaultV2 } from "../../helpers/vaultV2.js";
import { test } from "../../setup.js";

describe("Permit2", () => {
  const {
    dai,
    permit2,
    bundler3: { generalAdapter1 },
  } = addressesRegistry[mainnet.id];

  test("should deposit USDT with permit2 with prior reset", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 18);
    await client.deal({
      erc20: Re7UsdtVaultV2.asset,
      amount: amount,
    });

    await client.approve({
      address: Re7UsdtVaultV2.asset,
      args: [permit2, 1n],
    });

    const {
      vaults: {
        Re7UsdtVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { Re7UsdtVaultV2 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client, { supportSignature: true });
        const vault = morpho.vaultV2(Re7UsdtVaultV2.address, mainnet.id);
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          accrualVault,
        });

        const requirements = await deposit.getRequirements();

        // USDT may require two signature requirements (reset approval permit2 + approve permit2 + set allowance)
        expect(requirements.length).toBe(3);

        const approvalResetPermit2 = requirements[0];
        const approvalPermit2 = requirements[1];
        if (
          !isRequirementApproval(approvalResetPermit2) ||
          !isRequirementApproval(approvalPermit2)
        ) {
          throw new Error(
            "Approval requirement not found (reset permit2 or approve permit2)",
          );
        }

        expect(approvalResetPermit2.action.args.spender).toBe(permit2);
        expect(approvalResetPermit2.action.args.amount).toBe(0n);
        expect(approvalPermit2.action.args.spender).toBe(permit2);
        expect(approvalPermit2.action.args.amount).toBe(MathLib.MAX_UINT_160);

        await client.sendTransaction(approvalResetPermit2);
        await client.sendTransaction(approvalPermit2);

        const signaturePermit2 = requirements[2];

        if (!isRequirementSignature(signaturePermit2)) {
          throw new Error("Permit2 requirement not found");
        }

        const requirementSignature = await signaturePermit2.sign(
          client,
          client.account.address,
        );

        expect(requirementSignature.args.owner).toEqual(client.account.address);
        expect(isHex(requirementSignature.args.signature)).toBe(true);
        expect(requirementSignature.args.signature.length).toBe(132);
        expect(requirementSignature.action.args.spender).toBe(generalAdapter1);
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
  });

  test("should deposit USDT with permit2 with allowance 0", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 18);
    await client.deal({
      erc20: Re7UsdtVaultV2.asset,
      amount: amount,
    });

    const {
      vaults: {
        Re7UsdtVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { Re7UsdtVaultV2 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client, { supportSignature: true });
        const vault = morpho.vaultV2(Re7UsdtVaultV2.address, mainnet.id);
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          accrualVault,
        });

        const requirements = await deposit.getRequirements();

        // USDT may require two signature requirements (approve permit2 + set allowance)
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

        expect(requirementSignature.args.owner).toEqual(client.account.address);
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
  });

  test("should deposit WETH approval already sufficient on general adapter", async ({
    client,
  }) => {
    const { wNative } = addressesRegistry[mainnet.id];
    const amount = parseUnits("0.5", 18);

    await client.deal({
      erc20: wNative,
      amount: amount,
    });

    await client.approve({
      address: wNative,
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
        const morpho = new MorphoClient(client, { supportSignature: true });
        const vault = morpho.vaultV2(KpkWETHVaultV2.address, mainnet.id);
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
  });

  test("should deposit DAI with permit2", async ({ client }) => {
    const amount = parseUnits("10", 18);

    await client.deal({
      erc20: dai,
      amount,
    });

    const { address } = await createVaultV2({
      client,
      asset: dai,
      chainId: mainnet.id,
    });
    const DaiVaultV2 = {
      address,
      asset: dai,
    } as const;

    const morpho = new MorphoClient(client, { supportSignature: true });
    const vault = morpho.vaultV2(address, mainnet.id);

    const {
      vaults: {
        DaiVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { DaiVaultV2 },
      },
      actionFn: async () => {
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          accrualVault,
        });

        const requirements = await deposit.getRequirements();

        expect(requirements.length).toBe(2);

        const approvalPermit2 = requirements[0];
        if (!isRequirementApproval(approvalPermit2)) {
          throw new Error("Approval requirement not found");
        }

        expect(approvalPermit2.action.args.spender).toBe(permit2);
        expect(approvalPermit2.action.args.amount).toBe(MathLib.MAX_UINT_160);
        expect(approvalPermit2.action.type).toBe("erc20Approval");

        await client.sendTransaction(approvalPermit2);

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
        expect(requirementSignature.args.asset).toBe(dai);
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
    expect(finalState.vaultBalance).toEqual(initialState.vaultBalance + amount);
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
  });

  test("should deposit USDC with permit2 with useSimplePermit to false", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);

    await client.deal({
      erc20: KeyrockUsdcVaultV2.asset,
      amount,
    });

    const morpho = new MorphoClient(client, { supportSignature: true });
    const vault = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);

    const {
      vaults: {
        KeyrockUsdcVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { KeyrockUsdcVaultV2 },
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

        await client.sendTransaction(approvalPermit2);

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
        expect(requirementSignature.args.asset).toBe(KeyrockUsdcVaultV2.asset);
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
  });
});
