import { addressesRegistry, MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  isRequirementApproval,
  morphoViemExtension,
} from "../../../src/index.js";
import {
  KeyrockUsdcVaultV2,
  KpkWETHVaultV2,
  Re7UsdtVaultV2,
} from "../../fixtures/vaultV2.js";
import { testInvariants } from "../../helpers/invariants.js";
import { vaultBundlesV1Test as test } from "../../helpers/vaultBundlesV1.js";
import {
  createVaultV2,
  seedVaultV2DeadDeposits,
} from "../../helpers/vaultV2.js";

describe("Direct approvals with signatures enabled", () => {
  const { dai } = addressesRegistry[mainnet.id];
  const vaultBundlesV1 = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");

  test("should deposit USDT with direct approval with prior reset", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 18);
    await client.deal({
      erc20: Re7UsdtVaultV2.asset,
      amount: amount,
    });
    await seedVaultV2DeadDeposits(
      client,
      client
        .extend(morphoViemExtension())
        .morpho.vaultV2(Re7UsdtVaultV2.address, mainnet.id),
    );

    await client.approve({
      address: Re7UsdtVaultV2.asset,
      args: [vaultBundlesV1, 1n],
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
        const morpho = client.extend(
          morphoViemExtension({ supportSignature: true }),
        ).morpho;
        const vault = morpho.vaultV2(Re7UsdtVaultV2.address, mainnet.id);
        const vaultData = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          vaultData,
        });

        const requirements = await deposit.getRequirements({
          permit2Nonce: 0n,
        });

        expect(requirements).toHaveLength(2);
        for (const approval of requirements) {
          if (!isRequirementApproval(approval)) {
            throw new Error("Approval requirement not found");
          }
          expect(approval.action.args.spender).toBe(vaultBundlesV1);
          expect(approval.action.args.amount).toBe(
            approval === requirements[0] ? 0n : MathLib.MAX_UINT_256,
          );
          await client.sendTransaction(approval);
        }
        await client.sendTransaction(deposit.buildTx());
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.vaultBalance + finalState.morphoAssetBalance).toEqual(
      initialState.vaultBalance + initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
  });

  test("should deposit USDT with direct approval with allowance 0", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 18);
    await client.deal({
      erc20: Re7UsdtVaultV2.asset,
      amount: amount,
    });
    await seedVaultV2DeadDeposits(
      client,
      client
        .extend(morphoViemExtension())
        .morpho.vaultV2(Re7UsdtVaultV2.address, mainnet.id),
    );

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
        const morpho = client.extend(
          morphoViemExtension({ supportSignature: true }),
        ).morpho;
        const vault = morpho.vaultV2(Re7UsdtVaultV2.address, mainnet.id);
        const vaultData = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          vaultData,
        });

        const requirements = await deposit.getRequirements({
          permit2Nonce: 0n,
        });

        expect(requirements).toHaveLength(1);
        for (const approval of requirements) {
          if (!isRequirementApproval(approval)) {
            throw new Error("Approval requirement not found");
          }
          expect(approval.action.args.spender).toBe(vaultBundlesV1);
          expect(approval.action.args.amount).toBe(MathLib.MAX_UINT_256);
          await client.sendTransaction(approval);
        }
        await client.sendTransaction(deposit.buildTx());
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.vaultBalance + finalState.morphoAssetBalance).toEqual(
      initialState.vaultBalance + initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
  });

  test("should deposit WETH with pre-existing bundles approval without additional approval", async ({
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
      args: [vaultBundlesV1, MathLib.MAX_UINT_256],
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
        const morpho = client.extend(
          morphoViemExtension({ supportSignature: true }),
        ).morpho;
        const vault = morpho.vaultV2(KpkWETHVaultV2.address, mainnet.id);
        const vaultData = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          vaultData,
        });

        const requirements = await deposit.getRequirements({
          permit2Nonce: 0n,
        });

        expect(requirements).toEqual([]);
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

  test("should deposit DAI with direct approval", async ({ client }) => {
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

    const morpho = client.extend(
      morphoViemExtension({ supportSignature: true }),
    ).morpho;
    const vault = morpho.vaultV2(address, mainnet.id);
    await seedVaultV2DeadDeposits(client, vault);

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
        const vaultData = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          vaultData,
        });

        const requirements = await deposit.getRequirements({
          permit2Nonce: 0n,
        });

        expect(requirements).toHaveLength(1);
        for (const approval of requirements) {
          if (!isRequirementApproval(approval)) {
            throw new Error("Approval requirement not found");
          }
          expect(approval.action.args.spender).toBe(vaultBundlesV1);
          expect(approval.action.args.amount).toBe(MathLib.MAX_UINT_256);
          await client.sendTransaction(approval);
        }
        await client.sendTransaction(deposit.buildTx());
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

  test("should deposit USDC with direct approval with useSimplePermit to false", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);

    await client.deal({
      erc20: KeyrockUsdcVaultV2.asset,
      amount,
    });

    const morpho = client.extend(
      morphoViemExtension({ supportSignature: true }),
    ).morpho;
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
        const vaultData = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          vaultData,
        });

        const requirements = await deposit.getRequirements({
          useSimplePermit: false,
          permit2Nonce: 0n,
        });

        expect(requirements).toHaveLength(1);
        for (const approval of requirements) {
          if (!isRequirementApproval(approval)) {
            throw new Error("Approval requirement not found");
          }
          expect(approval.action.args.spender).toBe(vaultBundlesV1);
          expect(approval.action.args.amount).toBe(MathLib.MAX_UINT_256);
          await client.sendTransaction(approval);
        }
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
});
