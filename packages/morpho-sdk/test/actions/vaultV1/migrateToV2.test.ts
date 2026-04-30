import { MathLib, addressesRegistry } from "@morpho-org/blue-sdk";
import { isHex, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  MorphoClient,
  isRequirementApproval,
  isRequirementSignature,
  vaultV1MigrateToV2,
} from "../../../src/index.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { KeyrockUsdcVaultV2 } from "../../fixtures/vaultV2.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("MigrateToV2 VaultV1", () => {
  test("should create migration bundle via entity", async ({ client }) => {
    const morpho = new MorphoClient(client);

    const vaultV1 = morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id);
    const sourceVault = await vaultV1.getData();

    const vaultV2 = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);
    const targetVault = await vaultV2.getData();

    const shares = parseUnits("1000", 18);
    const migrate = vaultV1.migrateToV2({
      userAddress: client.account.address,
      sourceVault,
      targetVault,
      shares,
    });

    const requirements = await migrate.getRequirements();
    const tx_1 = migrate.buildTx();

    const tx_2 = vaultV1MigrateToV2({
      vault: {
        chainId: mainnet.id,
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        targetVault: KeyrockUsdcVaultV2.address,
        shares,
        minSharePriceVaultV1: tx_1.action.args.minSharePriceVaultV1,
        maxSharePriceVaultV2: tx_1.action.args.maxSharePriceVaultV2,
        recipient: client.account.address,
      },
    });

    expect(migrate).toBeDefined();
    expect(requirements).toBeDefined();
    expect(tx_1).toStrictEqual(tx_2);
    expect(sourceVault.asset).toStrictEqual(SteakhouseUsdcVaultV1.asset);
    expect(sourceVault.address).toStrictEqual(SteakhouseUsdcVaultV1.address);
  });

  test("should migrate full USDC position from V1 to V2", async ({
    client,
  }) => {
    const shares = parseUnits("1000", 18);
    await client.deal({
      erc20: SteakhouseUsdcVaultV1.address,
      amount: shares,
    });

    const {
      vaults: {
        SteakhouseUsdcVaultV1: { initialState: v1Initial, finalState: v1Final },
        KeyrockUsdcVaultV2: { initialState: v2Initial, finalState: v2Final },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { SteakhouseUsdcVaultV1, KeyrockUsdcVaultV2 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client);
        const vaultV1 = morpho.vaultV1(
          SteakhouseUsdcVaultV1.address,
          mainnet.id,
        );
        const vaultV2 = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);

        const sourceVault = await vaultV1.getData();
        const targetVault = await vaultV2.getData();

        const migrate = vaultV1.migrateToV2({
          userAddress: client.account.address,
          sourceVault,
          targetVault,
          shares,
        });

        const requirements = await migrate.getRequirements();

        expect(requirements.length).toBe(1);

        const approveTx = requirements[0];
        if (!approveTx) {
          throw new Error("Approve transaction not found");
        }
        if (!isRequirementApproval(approveTx)) {
          throw new Error("Approve transaction is not an approval transaction");
        }

        await client.sendTransaction(approveTx);

        const tx = migrate.buildTx();
        await client.sendTransaction(tx);
      },
    });

    // V1: all shares should be gone
    expect(v1Final.userSharesBalance).toBe(0n);

    // V2: user should have received shares
    expect(v2Final.userSharesBalance).toBeGreaterThan(
      v2Initial.userSharesBalance,
    );

    // User's underlying asset balance should be roughly unchanged
    // (assets moved vault-to-vault, not through user's wallet)
    expect(v1Final.userAssetBalance).toEqual(v1Initial.userAssetBalance);
  });

  test("should migrate with simple permit for V1 shares", async ({
    client,
  }) => {
    const shares = parseUnits("1000", 18);
    await client.deal({
      erc20: SteakhouseUsdcVaultV1.address,
      amount: shares,
    });

    const {
      vaults: {
        SteakhouseUsdcVaultV1: { initialState: v1Initial, finalState: v1Final },
        KeyrockUsdcVaultV2: { initialState: v2Initial, finalState: v2Final },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { SteakhouseUsdcVaultV1, KeyrockUsdcVaultV2 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client, { supportSignature: true });
        const vaultV1 = morpho.vaultV1(
          SteakhouseUsdcVaultV1.address,
          mainnet.id,
        );
        const vaultV2 = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);

        const sourceVault = await vaultV1.getData();
        const targetVault = await vaultV2.getData();

        const migrate = vaultV1.migrateToV2({
          userAddress: client.account.address,
          sourceVault,
          targetVault,
          shares,
        });

        const requirements = await migrate.getRequirements({
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
          SteakhouseUsdcVaultV1.address,
        );
        expect(requirementSignature.args.amount).toEqual(shares);
        expect(isHex(requirementSignature.args.signature)).toBe(true);
        expect(requirementSignature.args.signature.length).toBe(132);
        expect(requirementSignature.args.deadline).toBeGreaterThan(
          BigInt(Math.floor(Date.now() / 1000)),
        );

        const tx = migrate.buildTx(requirementSignature);
        await client.sendTransaction(tx);
      },
    });

    // V1: all shares should be gone
    expect(v1Final.userSharesBalance).toBe(0n);

    // V2: user should have received shares
    expect(v2Final.userSharesBalance).toBeGreaterThan(
      v2Initial.userSharesBalance,
    );

    // User's underlying asset balance should be unchanged
    expect(v1Final.userAssetBalance).toEqual(v1Initial.userAssetBalance);
  });

  test("should migrate with permit2 for V1 shares", async ({ client }) => {
    const {
      permit2,
      bundler3: { generalAdapter1 },
    } = addressesRegistry[mainnet.id];

    const shares = parseUnits("1000", 18);
    await client.deal({
      erc20: SteakhouseUsdcVaultV1.address,
      amount: shares,
    });

    const {
      vaults: {
        SteakhouseUsdcVaultV1: { initialState: v1Initial, finalState: v1Final },
        KeyrockUsdcVaultV2: { initialState: v2Initial, finalState: v2Final },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { SteakhouseUsdcVaultV1, KeyrockUsdcVaultV2 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client, { supportSignature: true });
        const vaultV1 = morpho.vaultV1(
          SteakhouseUsdcVaultV1.address,
          mainnet.id,
        );
        const vaultV2 = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);

        const sourceVault = await vaultV1.getData();
        const targetVault = await vaultV2.getData();

        const migrate = vaultV1.migrateToV2({
          userAddress: client.account.address,
          sourceVault,
          targetVault,
          shares,
        });

        const requirements = await migrate.getRequirements({
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
        expect(permit2Requirement.action.args.amount).toBe(shares);

        const requirementSignature = await permit2Requirement.sign(
          client,
          client.account.address,
        );

        expect(requirementSignature.args.owner).toEqual(client.account.address);
        expect(isHex(requirementSignature.args.signature)).toBe(true);
        expect(requirementSignature.args.signature.length).toBe(132);
        expect(requirementSignature.args.asset).toBe(
          SteakhouseUsdcVaultV1.address,
        );
        expect(requirementSignature.args.deadline).toBeGreaterThan(
          BigInt(Math.floor(Date.now() / 1000)),
        );

        await client.sendTransaction(approvalPermit2);

        const tx = migrate.buildTx(requirementSignature);
        await client.sendTransaction(tx);
      },
    });

    // V1: all shares should be gone
    expect(v1Final.userSharesBalance).toBe(0n);

    // V2: user should have received shares
    expect(v2Final.userSharesBalance).toBeGreaterThan(
      v2Initial.userSharesBalance,
    );

    // User's underlying asset balance should be unchanged
    expect(v1Final.userAssetBalance).toEqual(v1Initial.userAssetBalance);
  });
});
