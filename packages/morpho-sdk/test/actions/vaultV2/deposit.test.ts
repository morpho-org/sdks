import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  MorphoClient,
  isRequirementApproval,
  vaultV2Deposit,
} from "../../../src/index.js";
import { KeyrockUsdcVaultV2 } from "../../fixtures/vaultV2.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("DepositVaultV2", () => {
  test("should create deposit bundle", async ({ client }) => {
    const morpho = new MorphoClient(client);

    const vault = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);
    const accrualVault = await vault.getData();
    const deposit = vault.deposit({
      userAddress: client.account.address,
      amount: 1000000000000000000n,
      accrualVault,
    });
    const requirements_1 = await deposit.getRequirements();
    const data = await vault.getData();
    const tx_1 = deposit.buildTx();

    const tx_2 = vaultV2Deposit({
      vault: {
        chainId: mainnet.id,
        address: KeyrockUsdcVaultV2.address,
        asset: KeyrockUsdcVaultV2.asset,
      },
      args: {
        amount: 1000000000000000000n,
        maxSharePrice: 1030789509859687n,
        recipient: client.account.address,
      },
    });

    expect(deposit).toBeDefined();
    expect(requirements_1).toBeDefined();
    expect(tx_1).toStrictEqual(tx_2);
    expect(data.asset).toStrictEqual(KeyrockUsdcVaultV2.asset);
    expect(data.address).toStrictEqual(KeyrockUsdcVaultV2.address);
  });

  test("should deposit 1K USDC in vaultV2", async ({ client }) => {
    const amount = parseUnits("1000", 6);
    await client.deal({
      erc20: KeyrockUsdcVaultV2.asset,
      amount: amount,
    });

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
        const morpho = new MorphoClient(client);
        const vaultV2 = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);
        const accrualVault = await vaultV2.getData();
        const deposit = vaultV2.deposit({
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
    expect(finalState.userSharesBalance).toEqual(970421203423413218710n);
  });
});
